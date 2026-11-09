// Visits every screen of a populated project and fails on crashes / error boundaries.
import { launch, newPage, login, OWNER, SHOTS } from './lib.mjs'
import fs from 'node:fs'
import path from 'node:path'
const projectUrl = process.argv[2]
const routes = process.env.TOUR_SKIP_ROUTES ? [] : ['', 'map', 'timeline', 'countries', 'regions', 'politics', 'parliaments', 'diplomacy', 'wars', 'treaties', 'military', 'ships', 'equipment', 'characters', 'events', 'organizations', 'assets', 'search?q=아', 'branches', 'conflicts', 'history', 'settings']
const b = await launch(); const page = await newPage(b)
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await login(page, OWNER)
fs.mkdirSync(SHOTS, { recursive: true })
let bad = 0
for (const r of routes) {
  await page.goto(`${projectUrl}/${r}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200)
  const crashed = await page.getByText('이 화면을 표시하는 중 오류가 발생했습니다').count()
  await page.screenshot({ path: path.join(SHOTS, `tour-${r.replace(/[^a-z]/g, '') || 'dashboard'}.png`) })
  console.log(`${crashed ? '✗' : '✓'} /${r}`)
  if (crashed) bad++
}
// entity detail tabs of every kind
for (const kind of ['countries', 'regions', 'parties', 'parliaments', 'elections', 'governments', 'characters', 'military', 'wars', 'treaties', 'events']) {
  await page.goto(`${projectUrl}/${kind === 'parties' || kind === 'governments' ? 'politics' : kind === 'elections' ? 'parliaments' : kind}`)
  await page.waitForTimeout(800)
  const link = page.locator(`a[href*="/${kind}/"]`).first()
  if (kind === 'elections') await page.getByRole('tab', { name: '선거' }).click()
  if (kind === 'governments') await page.getByRole('tab', { name: '정부' }).click()
  try { await link.waitFor({ timeout: 8000 }) } catch { console.log(`- no ${kind} entity`); continue }
  await link.click()
  await page.getByTestId('entity-title').waitFor()
  const tabs = await page.getByRole('tab').allInnerTexts()
  for (const t of tabs) {
    await page.getByRole('tab', { name: t, exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(700)
    const crashed = await page.getByText('이 화면을 표시하는 중 오류가 발생했습니다').count()
    if (crashed) { bad++; console.log(`✗ ${kind} tab ${t}`); await page.screenshot({ path: path.join(SHOTS, `tour-crash-${kind}.png`) }) }
  }
  console.log(`✓ ${kind} detail (${tabs.length} tabs)`)
}
console.log('page errors:', errors.length ? errors : 'none')
await b.close()
process.exitCode = bad || errors.length ? 1 : 0
