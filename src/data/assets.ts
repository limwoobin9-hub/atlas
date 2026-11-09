import { ASSET_BUCKET, supabase } from '@/lib/supabase'
import { uuid } from '@/lib/utils'
import { DbError, insertRow } from './db'
import type { Asset } from './types'

export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'application/json',
  'application/geo+json', 'text/plain', 'text/markdown', 'application/zip',
]

export const ASSET_CATEGORIES: Record<string, string> = {
  map: '지도', flag: '국기', emblem: '국장', military_flag: '군기', portrait: '인물 사진', ship: '함선 이미지',
  battle_map: '전투지도', document: '문서', pdf: 'PDF', other: '기타 참고자료',
}

function guessMime(f: File): string {
  if (f.type) return f.type
  const ext = f.name.split('.').pop()?.toLowerCase()
  return ({ geojson: 'application/geo+json', json: 'application/json', topojson: 'application/json', svg: 'image/svg+xml', md: 'text/markdown', txt: 'text/plain' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream'
}

async function imageSize(f: File): Promise<{ width: number; height: number } | null> {
  if (!f.type.startsWith('image/')) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src) }
    img.onerror = () => resolve(null)
    img.src = URL.createObjectURL(f)
  })
}

export function validateFile(f: File): string | null {
  if (f.size > MAX_FILE_BYTES) return `파일이 너무 큽니다 (최대 50MB): ${f.name}`
  const mime = guessMime(f)
  if (!ALLOWED_MIME.includes(mime) && mime !== 'application/octet-stream') return `지원하지 않는 파일 형식입니다: ${mime}`
  return null
}

export async function uploadAsset(projectId: string, file: File, meta: { category?: string; title?: string; folder?: string; description?: string; source?: string; license?: string } = {}): Promise<Asset> {
  const invalid = validateFile(file)
  if (invalid) throw new DbError(invalid)
  const mime = guessMime(file)
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const category = meta.category ?? (mime === 'application/pdf' ? 'pdf' : 'other')
  const path = `${projectId}/${category}/${uuid()}.${ext}`
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: mime, upsert: false })
  if (error) throw new DbError(`업로드 실패: ${error.message}`)
  try {
    const size = await imageSize(file)
    return await insertRow<Asset>('atlas_assets', {
      project_id: projectId, storage_path: path, file_name: file.name, title: meta.title ?? file.name.replace(/\.[^.]+$/, ''),
      description: meta.description ?? '', mime_type: mime, size_bytes: file.size, category, folder: meta.folder ?? '',
      width: size?.width ?? null, height: size?.height ?? null, source: meta.source ?? '', license: meta.license ?? '',
    })
  } catch (e) {
    await supabase.storage.from(ASSET_BUCKET).remove([path])
    throw e
  }
}

export async function deleteAsset(a: Asset) {
  const { error } = await supabase.from('atlas_assets').delete().eq('id', a.id)
  if (error) throw new DbError(error.message, error.code)
  await supabase.storage.from(ASSET_BUCKET).remove([a.storage_path])
}
