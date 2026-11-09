// Shared helpers for the browser E2E scenario (uses the preinstalled Playwright + Chromium).
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
export const { chromium } = require('playwright')

export const BASE = process.env.ATLAS_BASE_URL ?? 'http://localhost:5173'
export const PASSWORD = process.env.ATLAS_E2E_PASSWORD ?? 'AtlasE2E!2026'
export const OWNER = process.env.ATLAS_E2E_OWNER ?? 'atlas-e2e-owner@example.com'
export const OTHER = process.env.ATLAS_E2E_OTHER ?? 'atlas-e2e-other@example.com'
export const SHOTS = process.env.ATLAS_SHOTS ?? 'test-results'

export async function launch() {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
  return chromium.launch({ proxy })
}

export async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ko-KR', acceptDownloads: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|pretendard|favicon/i.test(m.text())) console.log('  [console]', m.text().slice(0, 300)) })
  return page
}

export async function login(page, email) {
  await page.goto(BASE + '/login')
  await page.fill('#email', email)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/projects/, { timeout: 20000 })
}

let step = 0
export async function check(name, fn) {
  step++
  const t = Date.now()
  try {
    await fn()
    console.log(`✓ ${String(step).padStart(2, '0')} ${name} (${Date.now() - t}ms)`)
  } catch (e) {
    console.log(`✗ ${String(step).padStart(2, '0')} ${name}\n    ${String(e.message).split('\n').slice(0, 6).join('\n    ')}`)
    throw e
  }
}

export function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg) }
