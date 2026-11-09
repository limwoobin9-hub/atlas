import JSZip from 'jszip'
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, prepareImport, validateBackup, type BackupFile, type Row } from '@/domain/backup'
import { ASSET_BUCKET, supabase } from '@/lib/supabase'
import { uuid } from '@/lib/utils'
import { DbError, downloadBlob, fetchAll, rpc } from './db'

export async function exportProject(projectId: string): Promise<BackupFile> {
  const { data: project, error } = await supabase.from('atlas_projects').select('*').eq('id', projectId).single()
  if (error) throw error
  const tables: Record<string, Row[]> = {}
  for (const t of BACKUP_TABLES) {
    tables[t] = await fetchAll(t, { projectId, order: t === 'atlas_government_parties' || t === 'atlas_treaty_participants' || t === 'atlas_asset_links' || t === 'atlas_entity_branch_hidden' ? 'project_id' : 'id' })
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), app: 'ATLAS web', project, tables }
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'atlas'

export async function downloadJsonBackup(projectId: string) {
  const b = await exportProject(projectId)
  const stamp = new Date().toISOString().slice(0, 10)
  download(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }), `${safeName(String(b.project.name))}_${stamp}.atlas.json`)
}

export async function downloadZipBackup(projectId: string, onProgress?: (msg: string) => void) {
  const b = await exportProject(projectId)
  const zip = new JSZip()
  const files: Record<string, string> = {}
  const assets = (b.tables.atlas_assets ?? []) as Row[]
  let i = 0
  for (const a of assets) {
    i++
    onProgress?.(`파일 ${i}/${assets.length} 내려받는 중…`)
    const path = String(a.storage_path)
    try {
      const blob = await downloadBlob(path)
      const entry = `assets/${a.id}_${String(a.file_name).replace(/[^\w.-]+/g, '_')}`
      zip.file(entry, blob)
      files[path] = entry
    } catch {
      // missing files are reported in metadata.json
    }
  }
  b.files = files
  zip.file('project.json', JSON.stringify(b, null, 1))
  zip.file('metadata.json', JSON.stringify({
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: b.exported_at, project_name: b.project.name,
    counts: Object.fromEntries(Object.entries(b.tables).map(([k, v]) => [k, v.length])),
    files_included: Object.keys(files).length, files_missing: assets.length - Object.keys(files).length,
  }, null, 2))
  onProgress?.('압축하는 중…')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  download(blob, `${safeName(String(b.project.name))}_${b.exported_at.slice(0, 10)}.atlas.zip`)
}

export interface ParsedBackup {
  backup: BackupFile
  zip: JSZip | null
}

export async function readBackupFile(file: File): Promise<ParsedBackup> {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    const zip = await JSZip.loadAsync(file)
    const entry = zip.file('project.json')
    if (!entry) throw new DbError('ZIP 안에 project.json이 없습니다.')
    return { backup: JSON.parse(await entry.async('string')), zip }
  }
  return { backup: JSON.parse(await file.text()), zip: null }
}

/** Create a brand-new project from a backup (never overwrites an existing one). */
export async function importBackup(
  parsed: ParsedBackup, opts: { name?: string; sourceFilesFromProject?: string } = {}, onProgress?: (m: string) => void,
): Promise<string> {
  const { backup, zip } = parsed
  const v = validateBackup(backup)
  if (!v.ok) throw new DbError(v.errors.join(' '))
  const name = opts.name ?? `${backup.project.name} (가져옴)`
  onProgress?.('새 프로젝트를 만드는 중…')
  const newPid = await rpc<string>('atlas_create_project', {
    p_name: name.slice(0, 120), p_description: String(backup.project.description ?? ''),
    p_default_date: String(backup.project.default_date ?? '1936-01-01'), p_seed_ideologies: false,
  })
  try {
    const { data: main, error } = await supabase.from('atlas_branches').select('id').eq('project_id', newPid).eq('is_main', true).single()
    if (error) throw error
    const { tables, project, mainBranch } = prepareImport(backup, newPid, main.id, uuid)

    // storage files: copy (duplicate) or upload (zip)
    const assets = tables.atlas_assets ?? []
    const oldPid = String(backup.project.id)
    let n = 0
    const missing: string[] = []
    for (const a of assets) {
      n++
      onProgress?.(`파일 ${n}/${assets.length} 처리 중…`)
      const newPath = String(a.storage_path)
      const oldPath = oldPid + newPath.slice(newPid.length)
      try {
        if (opts.sourceFilesFromProject) {
          const { error: e } = await supabase.storage.from(ASSET_BUCKET).copy(oldPath, newPath)
          if (e) throw e
        } else if (zip && backup.files?.[oldPath]) {
          const blob = await zip.file(backup.files[oldPath])!.async('blob')
          const { error: e } = await supabase.storage.from(ASSET_BUCKET).upload(newPath, blob, { contentType: String(a.mime_type), upsert: false })
          if (e) throw e
        } else {
          missing.push(String(a.file_name))
        }
      } catch {
        missing.push(String(a.file_name))
      }
    }

    onProgress?.('데이터를 기록하는 중…')
    // one transaction when small enough; otherwise table-by-table in dependency order
    const size = JSON.stringify(tables).length
    if (size < 3_000_000) {
      await rpc('atlas_import_rows', { p_project: newPid, p_tables: tables })
    } else {
      for (const t of BACKUP_TABLES) {
        const rows = tables[t] ?? []
        for (let i = 0; i < rows.length; i += 1500) {
          onProgress?.(`${t} ${i}/${rows.length}`)
          await rpc('atlas_import_rows', { p_project: newPid, p_tables: { [t]: rows.slice(i, i + 1500) } })
        }
      }
    }
    const patch: Row = { settings: project.settings ?? {}, cover_path: project.cover_path ?? null, default_map_id: project.default_map_id ?? null }
    const { error: pe } = await supabase.from('atlas_projects').update(patch).eq('id', newPid)
    if (pe) throw pe
    if (mainBranch) {
      await supabase.from('atlas_branches').update({ name: mainBranch.name, description: mainBranch.description, color: mainBranch.color }).eq('id', main.id)
    }
    if (missing.length) onProgress?.(`누락된 파일 ${missing.length}개: ${missing.slice(0, 5).join(', ')}`)
    return newPid
  } catch (e) {
    // roll back the half-created project so nothing partial remains
    await supabase.from('atlas_projects').delete().eq('id', newPid)
    throw e
  }
}

export async function duplicateProject(projectId: string, name: string, onProgress?: (m: string) => void): Promise<string> {
  onProgress?.('원본을 읽는 중…')
  const backup = await exportProject(projectId)
  return importBackup({ backup, zip: null }, { name, sourceFilesFromProject: projectId }, onProgress)
}
