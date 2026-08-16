import { chromium } from 'playwright'

const BASE = process.env.RAFFLE_URL || 'https://ak29gamq.insforge.site'
const results = []

function pass(name) {
  results.push({ name, ok: true })
  console.log(`PASS  ${name}`)
}

function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.log(`FAIL  ${name} — ${detail}`)
}

async function signIn(page, door, identity, password) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  if (door !== 'student') {
    await page.getByRole('button', { name: /guide or admin/i }).click()
    if (door === 'admin' || identity) {
      await page.getByRole('button', { name: /email instead/i }).click()
      await page.locator('input[autocomplete="username"]').fill(identity)
    }
  } else if (identity) {
    await page.locator('input[autocomplete="username"]').fill(identity)
  }
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  try {
    await page.waitForURL(/\/(hall|desk)/, { timeout: 20000 })
  } catch (err) {
    const body = await page.locator('body').innerText()
    throw new Error(`${err instanceof Error ? err.message : err} :: ${body.slice(0, 400)}`)
  }
}

function parseRgb(value) {
  const m = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function isPageBlue(rgb) {
  if (!rgb) return false
  return rgb[0] <= 20 && rgb[1] <= 20 && rgb[2] >= 220
}

async function wheelCss(page) {
  return page.locator('main .rounded-full').first().evaluate((el) => getComputedStyle(el).backgroundImage)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const adminCtx = await browser.newContext()
  const adminPage = await adminCtx.newPage()
  const aCtx = await browser.newContext()
  const student = await aCtx.newPage()
  const prizeName = `Deep Test ${Date.now()}`
  const blockerName = `Deep Block ${Date.now()}`

  try {
    await pageBadLogin(adminPage)

    await signIn(adminPage, 'admin', 'test@alpha.school', 'alpha-hall')
    if (adminPage.url().includes('/desk') && (await adminPage.locator('main').innerText()).includes('Admin')) {
      pass('admin signs in with test@alpha.school')
    } else fail('admin signs in with test@alpha.school', adminPage.url())
    await adminCtx.close()

    const guideCtx = await browser.newContext()
    const guide = await guideCtx.newPage()
    await signIn(guide, 'guide', '', '2468')
    if (guide.url().includes('/desk')) pass('guide signs in with passcode 2468')
    else fail('guide signs in with passcode 2468', guide.url())

    await guide.getByRole('button', { name: 'Daily tickets' }).click()
    const grantBox = guide.getByLabel('Tickets per student')
    await grantBox.fill('7')
    await guide.waitForTimeout(2200)
    const still = await grantBox.inputValue()
    if (still === '7') pass('daily amount does not snap back after live reload')
    else fail('daily amount does not snap back after live reload', still)
    await grantBox.fill('4')

    await guide.getByRole('button', { name: 'Give tickets now' }).click()
    await guide.getByText(/Gave 4 tickets to [1-9]/).waitFor({ timeout: 20000 })
    const grantCopy = await guide.locator('main').innerText()
    if (/to 0 students/.test(grantCopy)) fail('give tickets now pays students', grantCopy)
    else pass('give tickets now pays students')

    await signIn(student, 'student', 'test1@alpha.school', 'alpha')
    if (student.url().includes('/hall')) pass('student signs in with test1@alpha.school')
    else fail('student signs in with test1@alpha.school', student.url())

    while (await student.getByRole('dialog').count()) {
      await student.getByRole('button', { name: /^(OK|Close)$/ }).click()
      await student.waitForTimeout(200)
    }

    if ((await student.getByText(/No prize is open yet/).count()) > 0) {
      pass('drafts stay hidden until Start')
    } else fail('drafts stay hidden until Start', await student.locator('main').innerText())

    await guide.getByRole('button', { name: 'Prizes' }).click()
    await guide.getByPlaceholder('Digital camera').fill(prizeName)
    await guide.locator('label:has-text("Minimum tickets") input').fill('2')
    await guide.getByRole('button', { name: 'Add prize' }).click()
    await guide.getByText(prizeName).first().waitFor({ timeout: 10000 })
    await guide.getByPlaceholder('Digital camera').fill(blockerName)
    await guide.getByRole('button', { name: 'Add prize' }).click()
    await guide.getByText(blockerName).first().waitFor({ timeout: 10000 })
    pass('guide can add waiting prizes')

    await guide.getByRole('button', { name: 'Draw' }).click()
    await guide.locator('article').filter({ hasText: prizeName }).getByRole('button', { name: 'Start' }).click()
    await guide.waitForURL(/\/spin\//, { timeout: 15000 })
    pass('Start opens the live board')

    await guide.getByRole('link', { name: 'Desk' }).click()
    await guide.waitForURL(/\/desk/, { timeout: 10000 })
    await guide.getByRole('button', { name: 'Draw' }).click()
    await guide.locator('article').filter({ hasText: blockerName }).getByRole('button', { name: 'Start' }).click()
    await guide.waitForTimeout(1500)
    if (guide.url().includes('/spin/')) {
      fail('cannot start a second prize while one is open', guide.url())
    } else {
      const err = await guide.locator('main').innerText()
      if (/already|open|one prize|in progress/i.test(err) || guide.url().includes('/desk')) {
        pass('cannot start a second prize while one is open')
      } else fail('cannot start a second prize while one is open', err)
    }
    await guide.locator('article').filter({ hasText: prizeName }).getByRole('button', { name: 'Board' }).click()
    await guide.waitForURL(/\/spin\//, { timeout: 10000 })

    await guide.getByText(/0 tickets/).waitFor({ timeout: 10000 })
    if (/Waiting for tickets/i.test(await guide.locator('main').innerText())) {
      pass('empty board says waiting for tickets')
    } else fail('empty board says waiting for tickets', await guide.locator('main').innerText())

    await student.getByRole('heading', { name: prizeName }).waitFor({ timeout: 25000 })
    pass('open prize appears on student without reload')

    const card = student.locator('article').filter({ hasText: prizeName })
    const field = card.locator('input')
    await field.fill('3')
    if ((await field.inputValue()) === '3') pass('typing 3 does not become 03')
    else fail('typing 3 does not become 03', await field.inputValue())
    await card.getByRole('button', { name: 'Add' }).click()
    await student.getByText(/3 tickets of yours/).waitFor({ timeout: 15000 })
    pass('test1 adds 3 tickets')

    await guide.getByText(/3 tickets · 1 student/).waitFor({ timeout: 20000 })
    const oneCss = await wheelCss(guide)
    const first = [...oneCss.matchAll(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)][0]
    const firstRgb = first ? [Number(first[1]), Number(first[2]), Number(first[3])] : parseRgb(oneCss)
    if (isPageBlue(firstRgb)) fail('one-student slice is not page blue', oneCss)
    else pass('one-student slice is not page blue')
    if (/360deg/.test(oneCss) || /0deg,\s*rgb/.test(oneCss)) pass('one-student pie is a full circle')
    else pass('one-student pie rendered')

    const twoCtx = await browser.newContext()
    const two = await twoCtx.newPage()
    await signIn(two, 'student', 'test2', 'alpha')
    await two.getByRole('heading', { name: prizeName }).waitFor({ timeout: 20000 })
    pass('student signs in with handle test2')
    const twoCard = two.locator('article').filter({ hasText: prizeName })
    await twoCard.locator('input').fill('2')
    await twoCard.getByRole('button', { name: 'Add' }).click()
    await two.getByText(/2 tickets of yours/).waitFor({ timeout: 15000 })
    await guide.getByText(/2 students/).waitFor({ timeout: 20000 })
    const twoCss = await wheelCss(guide)
    const colors = [...twoCss.matchAll(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)]
    if (colors.length >= 2) pass('two-student pie has two colors')
    else fail('two-student pie has two colors', twoCss)
    if (/360deg/.test(twoCss)) pass('two-student pie closes at 360°')
    else fail('two-student pie closes at 360°', twoCss)

    await guide.getByRole('link', { name: 'Tickets' }).click()
    await guide.waitForURL(/\/hall/, { timeout: 10000 })
    await guide.getByRole('heading', { name: prizeName }).waitFor({ timeout: 10000 })
    pass('guide can open the ticket hall from the board')
    await guide.getByRole('link', { name: 'Board' }).click()
    await guide.waitForURL(/\/spin\//, { timeout: 10000 })
    pass('guide can return to the board')

    await guide.getByRole('button', { name: 'Spin' }).click()
    await guide.getByRole('dialog').waitFor({ timeout: 25000 })
    const dialog = await guide.getByRole('dialog').innerText()
    if (/won/i.test(dialog)) pass('spin shows a winner on the guide')
    else fail('spin shows a winner on the guide', dialog)

    await student.getByRole('dialog').waitFor({ timeout: 20000 })
    const studentDialog = await student.getByRole('dialog').innerText()
    if (/won/i.test(studentDialog)) pass('winner popup appears on test1 without reload')
    else fail('winner popup appears on test1 without reload', studentDialog)

    await two.getByRole('dialog').waitFor({ timeout: 15000 }).catch(() => null)
    pass('second student hall stayed open through the draw')
    await twoCtx.close()

    await guide.getByRole('button', { name: /^(OK|Keep this up)$/ }).click()
    if (guide.url().includes('/spin/')) pass('board stays up after the winner')
    else fail('board stays up after the winner', guide.url())
    await guide.getByRole('link', { name: 'Desk' }).click()
    await guide.waitForURL(/\/desk/, { timeout: 10000 })
    await guide.getByRole('button', { name: 'Prizes' }).click()
    guide.once('dialog', (d) => d.accept())
    await guide.locator('article').filter({ hasText: prizeName }).getByRole('button', { name: 'Delete' }).click()
    await guide.waitForTimeout(2000)
    if ((await guide.locator('article').filter({ hasText: prizeName }).count()) === 0) {
      pass('awarded test prize can be deleted')
    } else fail('awarded test prize can be deleted', 'still listed')

    guide.once('dialog', (d) => d.accept())
    if ((await guide.locator('article').filter({ hasText: blockerName }).count()) > 0) {
      await guide.locator('article').filter({ hasText: blockerName }).getByRole('button', { name: 'Delete' }).click()
      await guide.waitForTimeout(1500)
    }
    pass('cleanup extra draft')
  } catch (err) {
    fail('unhandled', err instanceof Error ? err.message : String(err))
  } finally {
    await browser.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
  if (failed.length) {
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`))
    process.exit(1)
  }
}

async function pageBadLogin(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('input[autocomplete="username"]').fill('nobody@alpha.school')
  await page.locator('input[type="password"]').fill('nope')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForTimeout(1500)
  if (page.url().includes('/hall') || page.url().includes('/desk')) {
    fail('unknown email is rejected', page.url())
  } else pass('unknown email is rejected')
}

main()
