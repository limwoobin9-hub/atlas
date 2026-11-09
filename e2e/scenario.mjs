// Full ATLAS user scenario (PART XX 종합 사용자 시나리오) driven in a real browser against the real database.
// Usage: ATLAS_MAP_FILE=/path/world_1938.geojson node e2e/scenario.mjs   (dev server on ATLAS_BASE_URL)
import fs from 'node:fs'
import path from 'node:path'
import { launch, newPage, login, check, assert, OWNER, OTHER, BASE, SHOTS } from './lib.mjs'

const MAP_FILE = process.env.ATLAS_MAP_FILE
const PROJECT = `E2E 대체역사 ${new Date().toISOString().slice(0, 16)}`
fs.mkdirSync(SHOTS, { recursive: true })
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })

const browser = await launch()
const { setTimeout: sleep } = await import('node:timers/promises'); void sleep
const page = await newPage(browser)
let projectUrl = ''
const ids = {}

async function setDate(d) {
  await page.getByTestId('current-date').click()
  await page.getByTestId('date-input').fill(d)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
async function gotoSection(seg) { await page.goto(projectUrl + (seg ? '/' + seg : '')); await page.waitForLoadState('networkidle') }
async function createEntity(kind, name, extra) {
  await page.getByTestId(`create-${kind}`).first().click()
  await page.getByTestId('create-entity-name').fill(name)
  if (extra) await extra()
  await page.getByTestId('create-entity-submit').click()
  await page.getByTestId('entity-title').filter({ hasText: name }).waitFor()
  const id = page.url().split('/').pop().split('?')[0]
  ids[name] = id
  return id
}
async function pick(testId, text) {
  await page.getByTestId(testId).last().click()
  await page.keyboard.type(text)
  await page.locator('[cmdk-item]').filter({ hasText: text }).first().click()
  // wait until the value is really set (inline creation is async)
  await page.getByTestId(testId).last().filter({ hasText: text }).waitFor({ timeout: 15000 })
}
async function openTab(name) { await page.getByRole('tab', { name }).click() }
async function temporalFromDate(table, fill) {
  await page.getByTestId(`temporal-from-date-${table}`).click()
  await fill()
  await page.getByTestId('temporal-save').click()
  await page.getByTestId('temporal-save').waitFor({ state: 'detached' })
}
async function temporalAdd(table, fill, from, to) {
  await page.getByTestId(`temporal-add-${table}`).first().click()
  if (from !== undefined) await page.getByTestId('temporal-from').fill(from)
  if (to) await page.getByTestId('temporal-to').fill(to)
  await fill()
  await page.getByTestId('temporal-save').click()
  await page.getByTestId('temporal-save').waitFor({ state: 'detached' })
}
async function paint(country, keys) {
  await page.getByTestId('tool-paint').click()
  await pick('paint-country', country)
  for (const k of keys) {
    await page.locator(`path[data-key="${k}"]`).first().click({ force: true })
    await page.waitForTimeout(150)
  }
  await page.waitForFunction(() => !document.body.innerText.includes('저장 중…'), null, { timeout: 30000 })
  await page.waitForTimeout(800)
}

try {
  await check('1. 로그인', async () => { await login(page, OWNER) })

  await check('2-3. 새 프로젝트 생성 (기본 세계선, 1936-01-01)', async () => {
    await page.getByRole('button', { name: '새 프로젝트' }).click()
    await page.getByPlaceholder('예: 1936 대체역사 세계관').fill(PROJECT)
    await page.getByRole('button', { name: '만들기' }).click()
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/)
    projectUrl = page.url()
    await page.getByTestId('current-date').filter({ hasText: '1936년 1월 1일' }).waitFor()
    await page.getByTestId('branch-select').filter({ hasText: '기본 세계선' }).waitFor()
    await shot(page, '01-dashboard-empty')
  })

  await check('4. 세계지도 가져오기 (1938 historical-basemaps GeoJSON)', async () => {
    assert(MAP_FILE && fs.existsSync(MAP_FILE), 'ATLAS_MAP_FILE missing')
    await gotoSection('map')
    await page.getByTestId('open-map-manager').click()
    await page.getByTestId('new-map').click()
    await page.getByTestId('map-file-input').setInputFiles(MAP_FILE)
    await page.getByText(/개 영역을 인식했습니다/).waitFor({ timeout: 20000 })
    await page.getByTestId('map-name').fill('1938 세계')
    await page.getByTestId('map-create').click()
    await page.locator('path[data-key="Germany"]').waitFor({ timeout: 60000 })
    const n = await page.locator('path.region').count()
    assert(n > 200, `expected >200 regions, got ${n}`)
  })

  await check('5. 국가 A·B 생성', async () => {
    await gotoSection('countries')
    await createEntity('country', '아르카디아 왕국')
    await gotoSection('countries')
    await createEntity('country', '보레알 공화국')
  })

  await check('6. 지도에서 두 국가의 영토 지정 (색칠)', async () => {
    await gotoSection('map')
    await page.locator('path[data-key="Germany"]').waitFor({ timeout: 60000 })
    await paint('아르카디아', ['Germany', 'Czechoslovakia', 'Hungary'])
    await paint('보레알', ['France', 'Belgium'])
    const fill = await page.locator('path[data-key="Germany"]').getAttribute('fill')
    const fillFr = await page.locator('path[data-key="France"]').getAttribute('fill')
    assert(fill && !fill.includes('map-land'), 'Germany should be coloured, got ' + fill)
    assert(fill !== fillFr, 'A and B must have different colours')
    await shot(page, '02-map-painted')
  })

  await check('7. 국가 A 국기·수도·정치체제 설정 (시점 상태)', async () => {
    await page.goto(`${projectUrl}/countries/${ids['아르카디아 왕국']}?tab=history`)
    await temporalFromDate('atlas_country_states', async () => {
      await page.locator('#f-government_form').fill('입헌군주제')
      await page.locator('#f-official_name').fill('아르카디아 연합왕국')
      await pick('picker-capital_id', '카스텔룸')
      await page.locator('input[type=color]').first().fill('#1d4ed8')
    })
    await openTab('개요')
    await page.getByText('입헌군주제').first().waitFor()
    await page.locator('dd').filter({ hasText: '카스텔룸' }).first().waitFor()
  })

  const waitSaved = async () => { await page.waitForTimeout(900); await page.getByTestId('save-ok').waitFor({ timeout: 20000 }) }
  const pickIn = async (scope, text) => {
    await scope.locator('button[aria-haspopup="dialog"]').first().click()
    await page.keyboard.type(text)
    await page.locator('[cmdk-item]').filter({ hasText: text }).first().click()
    await scope.locator('button[aria-haspopup="dialog"]').first().filter({ hasText: text }).waitFor({ timeout: 15000 })
  }
  const createWithCountry = async (buttonName, name, country) => {
    await page.getByRole('button', { name: buttonName }).first().click()
    await page.getByTestId('create-entity-name').fill(name)
    if (country) await pickIn(page.getByRole('dialog'), country)
    await page.getByTestId('create-entity-submit').click()
    await page.getByTestId('entity-title').filter({ hasText: name }).waitFor()
    ids[name] = page.url().split('/').pop().split('?')[0]
  }
  const A = ids['아르카디아 왕국']
  const B = ids['보레알 공화국']

  await check('8-9. 국가 A의 정당 3개 생성 + 이념별 색상', async () => {
    const parties = [['왕당보수당', '보수주의'], ['자유당', '자유주의'], ['사회민주당', '사회주의']]
    for (const [name, ideology] of parties) {
      await gotoSection('politics')
      await createWithCountry('정당 생성', name, '아르카디아')
      await page.locator('#f-ideology_id').selectOption({ label: ideology })
      await waitSaved()
    }
    await gotoSection('politics')
    const dots = await page.locator('span.rounded-full').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))
    assert(new Set(dots.filter((c) => c !== 'rgba(0, 0, 0, 0)')).size >= 3, 'parties should show 3 distinct ideology colours')
  })

  await check('10-12. 300석 의회 생성, 의석 배분, 반원형 의석도', async () => {
    await gotoSection('parliaments')
    await createWithCountry('의회 생성', '아르카디아 국민의회', '아르카디아')
    await openTab('의석·구성')
    await page.getByTestId('add-chamber').click()
    await page.getByTestId('chamber-total').fill('300')
    await page.getByTestId('chamber-save').click()
    await page.getByTestId('edit-seats').click()
    const seats = [['왕당보수당', 160], ['자유당', 90], ['사회민주당', 50]]
    for (let i = 0; i < seats.length; i++) {
      if (i > 0) await page.getByRole('button', { name: '정당 추가' }).click()
      const row = page.getByTestId('seat-row').nth(i)
      await pickIn(row, seats[i][0])
      await row.getByLabel('의석수').fill(String(seats[i][1]))
    }
    await page.getByTestId('seats-save').click()
    await page.getByTestId('seats-save').waitFor({ state: 'detached' })
    await page.getByTestId('seat-chart').waitFor()
    const circles = await page.getByTestId('seat-chart').locator('circle').count()
    assert(circles === 300, `hemicycle should draw 300 seats, got ${circles}`)
    assert(await page.getByTestId('seat-sum-warning').count() === 0, 'seat sum should match 300')
    await shot(page, '03-parliament')
  })

  await check('13. 정당 배치 순서 드래그 변경 (DB 저장)', async () => {
    const order = () => page.getByTestId('party-order').locator('li').evaluateAll((l) => l.map((x) => x.getAttribute('data-party')))
    const before = await order()
    const handle = page.getByTestId('party-order').locator('li').nth(2).getByLabel('순서 이동')
    const target = page.getByTestId('party-order').locator('li').nth(0)
    const hb = await handle.boundingBox(); const tb = await target.boundingBox()
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + 5, hb.y - 10, { steps: 5 })
    await page.mouse.move(tb.x + 20, tb.y + 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(1500)
    await page.reload(); await page.getByTestId('party-order').waitFor()
    const after = await order()
    assert(after[0] === before[2], `party order should persist after reload: ${before} -> ${after}`)
  })

  await check('14-15. 1940년 선거 생성 → 결과를 의회 구성에 반영', async () => {
    await gotoSection('parliaments')
    await page.getByRole('tab', { name: '선거' }).click()
    await createWithCountry('선거 생성', '1940년 총선', '아르카디아')
    await page.getByTestId('entity-start').fill('1940-03-01')
    await page.locator('#f-chamber_id').selectOption({ index: 1 })
    await waitSaved()
    await openTab('선거 결과')
    const results = [['왕당보수당', 110, 36.5], ['자유당', 80, 27.1], ['사회민주당', 110, 36.4]]
    for (let i = 0; i < results.length; i++) {
      await page.getByTestId('add-result').click()
      const row = page.getByTestId('result-row').nth(i)
      await row.waitFor()
      await pickIn(row, results[i][0])
      await page.waitForTimeout(500)
      await row.getByTestId('result-seats').fill(String(results[i][1])); await row.getByTestId('result-seats').blur()
      await page.waitForTimeout(500)
    }
    await page.getByTestId('apply-election').click()
    await page.getByTestId('apply-confirm').click()
    await page.getByText(/의회 구성에 반영됨/).waitFor()
    await page.goto(`${projectUrl}/parliaments/${ids['아르카디아 국민의회']}`)
    await setDate('1940-05-01')
    await page.getByTestId('seat-chart').waitFor()
    const legend = await page.getByTestId('party-order').innerText()
    assert(/110/.test(legend) && /80/.test(legend), 'composition after election should be 110/80/110: ' + legend)
    await setDate('1937-01-01')
    assert(/160/.test(await page.getByTestId('party-order').innerText()), 'pre-election composition must be preserved')
  })

  await check('16. 국가 A 정부 변경 (1936 내각 → 1940 전시내각)', async () => {
    await gotoSection('politics')
    await page.getByRole('tab', { name: '정부' }).click()
    await createWithCountry('정부 생성', '제1차 왕립내각', '아르카디아')
    await page.getByTestId('entity-start').fill('1936-01-01'); await page.getByTestId('entity-end').fill('1940-04-01')
    await waitSaved()
    await gotoSection('politics')
    await page.getByRole('tab', { name: '정부' }).click()
    await createWithCountry('정부 생성', '거국 전시내각', '아르카디아')
    await page.getByTestId('entity-start').fill('1940-04-01')
    await waitSaved()
    await page.goto(`${projectUrl}/countries/${A}?tab=politics`)
    await setDate('1941-01-01')
    await page.locator('li.bg-accent-soft\\/50').filter({ hasText: '거국 전시내각' }).waitFor()
  })

  await check('17-19. 군 편제 트리 (야전군 > 군단 > 사단) + 지휘관 인물 연결', async () => {
    await gotoSection('characters')
    await createEntity('character', '레오폴트 장군')
    await gotoSection('military')
    await page.getByTestId('create-unit').click()
    await page.getByTestId('create-entity-name').fill('제1야전군')
    await page.getByTestId('create-entity-submit').click()
    await page.getByTestId('create-entity-name').waitFor({ state: 'detached' })
    await page.locator('[data-unit="제1야전군"]').waitFor()
    const addChild = async (parent, name) => {
      await page.locator(`[data-unit="${parent}"]`).hover()
      await page.locator(`[data-unit="${parent}"]`).getByLabel('하위부대 추가').click()
      await page.getByTestId('create-entity-name').fill(name)
      await page.getByTestId('create-entity-submit').click()
      await page.locator(`[data-unit="${name}"]`).waitFor({ timeout: 20000 })
    }
    await addChild('제1야전군', '제1군단')
    await addChild('제1군단', '제3보병사단')
    const tree = await page.getByTestId('oob-tree').innerText()
    assert(tree.indexOf('제1야전군') < tree.indexOf('제1군단') && tree.indexOf('제1군단') < tree.indexOf('제3보병사단'), 'hierarchy order')
    const pad = (n) => page.locator(`[data-unit="${n}"]`).evaluate((e) => parseInt(e.style.paddingLeft))
    await page.waitForFunction(() => parseInt(document.querySelector('[data-unit="제3보병사단"]')?.style.paddingLeft ?? '0') > 30, null, { timeout: 15000 })
    assert(await pad('제3보병사단') > await pad('제1군단') && await pad('제1군단') > await pad('제1야전군'), 'nesting depth')
    await page.locator('[data-unit="제1야전군"] a').first().click()
    ids['제1야전군'] = page.url().split('/').pop().split('?')[0]
    await openTab('편제·이력')
    await temporalFromDate('atlas_unit_states', async () => {
      await page.getByTestId('temporal-from').fill('1936-01-01')
      await pick('picker-commander_id', '레오폴트')
      await pick('picker-country_id', '아르카디아')
    })
    await page.getByText('지휘: 레오폴트 장군').first().waitFor()
    await shot(page, '04-unit')
  })

  await check('20. 군부대를 지도에 표시 (마커, 지도 좌표 저장)', async () => {
    await gotoSection('map')
    await page.locator('path[data-key="Germany"]').waitFor({ timeout: 60000 })
    await page.getByTestId('tool-marker').click()
    const box = await page.getByTestId('map-canvas').boundingBox()
    await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.5)
    await page.getByTestId('map-object-label').fill('제1야전군 사령부')
    await page.getByTestId('map-object-save').click()
    await page.locator('[data-marker="제1야전군 사령부"]').waitFor()
    // marker must stay in place (map coordinates) after zooming
    const before = await page.locator('[data-marker="제1야전군 사령부"] circle').boundingBox()
    await page.mouse.move(before.x + 4, before.y + 4)
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(800)
    const after = await page.locator('[data-marker="제1야전군 사령부"] circle').boundingBox()
    assert(Math.abs(after.x - before.x) < 12 && Math.abs(after.y - before.y) < 12, `marker should stay under the cursor while zooming (${before.x},${before.y} -> ${after.x},${after.y})`)
  })

  await check('21. 국가 B와 외교관계 생성', async () => {
    await page.goto(`${projectUrl}/countries/${A}?tab=diplomacy`)
    await setDate('1936-01-01')
    await temporalAdd('atlas_diplomatic_relations', async () => {
      await pick('picker-b_id', '보레알')
      await page.locator('#f-relation_type').selectOption('tension')
    }, '1936-01-01')
    await page.getByText('긴장').first().waitFor()
  })

  await check('22-23. 전쟁 생성 + 진영 구성', async () => {
    await gotoSection('wars')
    await page.getByRole('button', { name: '전쟁 생성' }).first().click()
    await page.getByTestId('create-entity-name').fill('대륙 전쟁')
    await page.getByTestId('create-entity-submit').click()
    await page.getByTestId('entity-title').filter({ hasText: '대륙 전쟁' }).waitFor()
    ids['대륙 전쟁'] = page.url().split('/').pop().split('?')[0]
    await openTab('개요')
    await page.getByTestId('entity-start').fill('1939-09-01'); await page.getByTestId('entity-end').fill('1945-05-08')
    await waitSaved()
    await openTab('전쟁 패널')
    for (const n of ['동맹국', '연합국']) {
      await page.getByTestId('add-war-side').click()
      await page.getByTestId('side-name').fill(n)
      await page.getByTestId('side-save').click()
      await page.getByTestId('war-side').filter({ hasText: n }).waitFor()
    }
    for (const [country, side] of [['아르카디아', '동맹국'], ['보레알', '연합국']]) {
      await temporalAdd('atlas_war_participants', async () => {
        await pick('picker-participant_id', country)
        await page.locator('#f-side_id').selectOption({ label: side })
      }, '1939-09-01')
    }
    await setDate('1940-01-01')
    await page.getByTestId('war-side').filter({ hasText: '아르카디아' }).waitFor()
    await shot(page, '05-war')
  })

  await check('24. 주요 전선과 사건 기록', async () => {
    await gotoSection('map')
    await page.locator('path[data-key="Germany"]').waitFor({ timeout: 60000 })
    await page.getByTestId('tool-line').click()
    const box = await page.getByTestId('map-canvas').boundingBox()
    await page.mouse.click(box.x + box.width * 0.505, box.y + box.height * 0.4)
    await page.waitForTimeout(250)
    await page.mouse.click(box.x + box.width * 0.51, box.y + box.height * 0.45)
    await page.waitForTimeout(250)
    await page.mouse.dblclick(box.x + box.width * 0.515, box.y + box.height * 0.5)
    await page.getByTestId('map-object-label').fill('서부 전선')
    await pick('map-object-entity', '대륙 전쟁')
    await page.getByTestId('map-object-save').click()
    await page.getByTestId('map-object-save').waitFor({ state: 'detached' })
    await gotoSection('events')
    await createEntity('event', '국경 사건')
    await page.getByTestId('entity-start').fill('1939-09-01')
    await waitSaved()
    await openTab('관계·연결')
    await temporalAdd('atlas_entity_relations', async () => {
      await page.locator('#f-relation_type').selectOption('cause')
      await pick('picker-to_id', '대륙 전쟁')
    }, '')
    await page.goto(`${projectUrl}/wars/${ids['대륙 전쟁']}?tab=war`)
    await page.getByText('1개 전선').waitFor()
  })

  await check('25-26. 평화조약 생성 + 영토 변경 조항 확정 반영', async () => {
    await gotoSection('treaties')
    await page.getByTestId('create-treaty').click()
    await page.getByTestId('create-entity-name').fill('카스텔룸 평화조약')
    await page.getByTestId('create-entity-submit').click()
    await page.getByTestId('entity-title').filter({ hasText: '카스텔룸 평화조약' }).waitFor()
    ids['카스텔룸 평화조약'] = page.url().split('/').pop().split('?')[0]
    await page.getByTestId('entity-start').fill('1945-05-08')
    await page.locator('#f-treaty_type').selectOption('peace')
    await waitSaved()
    await openTab('서명국·조항')
    for (const c of ['아르카디아', '보레알']) { await pick('treaty-party-picker', c); await page.getByTestId('treaty-add-party').click(); await page.waitForTimeout(600) }
    await page.getByTestId('add-clause').click()
    await page.getByTestId('clause-body').fill('아르카디아는 Czechoslovakia 지역을 보레알 공화국에 할양한다.')
    await page.getByTestId('clause-effect').selectOption('territory_transfer')
    await pick('clause-region-picker', 'Czechoslovakia')
    await page.getByTestId('clause-add-region').click()
    await pick('clause-to-picker', '보레알')
    await page.getByTestId('clause-save').click()
    await page.getByTestId('clause').waitFor()
    assert(await page.getByText('미반영').count() > 0, 'clause effect must not apply automatically')
    await page.getByTestId('apply-clause').click()
    await page.getByTestId('apply-clause-confirm').click()
    await page.getByText(/반영됨/).first().waitFor()
  })

  const controllerOf = async (regionName, d, expect) => {
    await page.goto(`${projectUrl}/search?q=${encodeURIComponent(regionName)}`)
    const hits = page.getByTestId('search-results').locator('a').filter({ hasText: regionName })
    await hits.first().waitFor()
    await page.waitForTimeout(300)
    assert(await hits.count() === 1, `exactly one region named ${regionName} expected, got ${await hits.count()}`)
    await hits.first().click()
    await setDate(d)
    await openTab('지배·영유권')
    const dl = page.locator('dl').first()
    try { await dl.filter({ hasText: expect }).waitFor({ timeout: 10000 }) } catch { /* reported below */ }
    return dl.innerText()
  }

  await check('27. 1936년으로 돌아가 정치·영토 상황 확인', async () => {
    const t = await controllerOf('Czechoslovakia', '1936-06-01', '아르카디아')
    assert(t.includes('아르카디아'), 'Czechoslovakia controlled by A in 1936: ' + t)
    await page.goto(`${projectUrl}/countries/${A}`)
    await page.getByText('입헌군주제').first().waitFor()
    await page.goto(`${projectUrl}/countries/${A}?tab=politics`)
    await page.locator('li.bg-accent-soft\\/50').filter({ hasText: '제1차 왕립내각' }).waitFor()
  })

  await check('28. 1945년(조약 이후)으로 이동해 변화 확인', async () => {
    const t = await controllerOf('Czechoslovakia', '1945-06-01', '보레알')
    assert(t.includes('보레알'), 'Czechoslovakia transferred to B after treaty: ' + t)
    await page.goto(`${projectUrl}/countries/${A}?tab=politics`)
    await page.locator('li.bg-accent-soft\\/50').filter({ hasText: '거국 전시내각' }).waitFor()
    await gotoSection('map')
    await page.locator('path[data-key="Czechoslovakia"]').waitFor({ timeout: 60000 })
    await shot(page, '06-map-1945')
  })

  await check('29-30. 1939-01-01 분기 생성 → 분기에서는 전쟁이 없는 역사', async () => {
    await gotoSection('branches')
    await page.getByTestId('new-branch').click()
    await page.getByTestId('branch-name').fill('분기 A — 전쟁 회피')
    await page.getByTestId('branch-fork').fill('1939-01-01')
    await page.getByTestId('branch-save').click()
    await page.getByTestId('branch-select').filter({ hasText: '분기 A' }).waitFor()
    await gotoSection('wars')
    await page.waitForTimeout(800)
    assert(await page.getByText('대륙 전쟁').count() === 0, 'war (started 1939-09-01) must not exist in branch forked 1939-01-01')
    // in the branch, write a peace accord instead
    await gotoSection('events')
    await createEntity('event', '뮌스터 평화회담')
    await page.getByTestId('entity-start').fill('1939-08-20')
    await waitSaved()
    const t = await controllerOf('Czechoslovakia', '1945-06-01', '아르카디아')
    assert(t.includes('아르카디아'), 'without the war/treaty, Czechoslovakia stays with A in the branch: ' + t)
  })

  await check('31. 원래 세계선에는 분기 변경이 반영되지 않음', async () => {
    await page.getByTestId('branch-select').click()
    await page.getByRole('menuitem', { name: /기본 세계선/ }).click()
    await gotoSection('wars')
    await page.getByText('대륙 전쟁').first().waitFor()
    await gotoSection('events')
    await page.waitForTimeout(600)
    assert(await page.getByText('뮌스터 평화회담').count() === 0, 'branch-only event must not appear in main line')
    const t = await controllerOf('Czechoslovakia', '1945-06-01', '보레알')
    assert(t.includes('보레알'), 'main line still has the treaty transfer')
  })

  let backupFile = ''
  await check('32. 프로젝트 JSON 내보내기', async () => {
    await gotoSection('settings')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()])
    backupFile = path.join(SHOTS, 'backup.atlas.json')
    await dl.saveAs(backupFile)
    const j = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
    assert(j.format === 'atlas-backup' && j.tables.atlas_entities.length >= 15, 'backup contents')
  })

  await check('33. JSON 가져오기 → 데이터·관계 보존 확인', async () => {
    await page.goto(BASE + '/projects')
    page.once('dialog', (d) => d.accept())
    await page.locator('input[type=file]').setInputFiles(backupFile)
    await page.getByRole('button', { name: '가져오기' }).click()
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 120000 })
    assert(!page.url().startsWith(projectUrl), 'import must create a new project')
    const imported = page.url()
    await page.goto(imported + '/countries')
    await page.getByText('아르카디아 왕국').waitFor()
    await page.goto(imported + '/parliaments')
    await page.getByText('아르카디아 국민의회').click()
    await setDate('1940-05-01')
    await page.getByTestId('seat-chart').waitFor()
    assert(/110/.test(await page.getByTestId('party-order').innerText()), 'seat allocations & relations preserved after import')
    ids.imported = imported
  })

  await check('34. 새로고침 후 데이터 유지', async () => {
    await page.goto(`${projectUrl}/countries/${A}`)
    await page.reload()
    await page.getByTestId('entity-title').filter({ hasText: '아르카디아 왕국' }).waitFor()
    await page.locator('dd').filter({ hasText: '카스텔룸' }).first().waitFor()
  })

  await check('35. 다른 계정은 권한 없는 프로젝트에 접근 불가', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const p2 = await ctx2.newPage()
    await login(p2, OTHER)
    await p2.goto(projectUrl)
    await p2.getByText('접근할 수 없는 프로젝트입니다').waitFor({ timeout: 20000 })
    const list = await p2.locator('body').innerText()
    await p2.goto(BASE + '/projects')
    await p2.waitForTimeout(1500)
    assert(!(await p2.locator('body').innerText()).includes(PROJECT), 'project must not be listed for other user')
    await ctx2.close()
    void list
  })

  fs.writeFileSync(path.join(SHOTS, 'state.json'), JSON.stringify({ projectUrl, ids }, null, 1))
  console.log('\nALL STEPS PASSED', projectUrl)
} catch (e) {
  await shot(page, 'failure').catch(() => {})
  console.log('URL at failure:', page.url())
  process.exitCode = 1
} finally {
  await browser.close()
}
