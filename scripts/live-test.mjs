import { chromium } from 'playwright'

const BASE = 'https://ak29gamq.insforge.site'
const results = []

function pass(name) {
  results.push({ name, ok: true })
  console.log(`PASS  ${name}`)
}

function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.log(`FAIL  ${name} — ${detail}`)
}

async function signIn(page, door, handle, password) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  if (door !== 'student') {
    await page.getByRole('button', { name: /guide or admin/i }).click()
    if (door === 'admin' || handle) {
      await page.getByRole('button', { name: /email instead/i }).click()
      await page.locator('input[autocomplete="username"]').fill(handle)
    }
  } else if (handle) {
    await page.locator('input[autocomplete="username"]').fill(handle)
  }
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/(hall|desk)/, { timeout: 15000 })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const guideCtx = await browser.newContext()
  const studentCtx = await browser.newContext()
  const guide = await guideCtx.newPage()
  const student = await studentCtx.newPage()
  const prizeName = `Live Test ${Date.now()}`

  try {
    await signIn(guide, 'guide', '', '2468')
    if (guide.url().includes('/desk')) pass('guide signs in with passcode')
    else fail('guide signs in with passcode', guide.url())

    await guide.getByRole('button', { name: 'Daily tickets' }).click()
    await guide.getByRole('button', { name: 'Give tickets now' }).click()
    await guide.getByText(/Gave 4 tickets to [1-9]/).waitFor({ timeout: 15000 })
    pass('give tickets now pays out to students')

    await signIn(student, 'student', 'mia', 'alpha')
    if (student.url().includes('/hall')) pass('student signs in')
    else fail('student signs in', student.url())

    while (await student.getByRole('dialog').count()) {
      await student.getByRole('button', { name: /^(OK|Close)$/ }).click()
      await student.waitForTimeout(300)
    }

    const emptyCopy = await student.getByText(/No prize is open yet/).count()
    if (emptyCopy > 0) pass('student sees no open prize before start')
    else fail('student sees no open prize before start', await student.locator('main').innerText())

    await guide.getByRole('button', { name: 'Prizes' }).click()
    await guide.getByPlaceholder('Digital camera').fill(prizeName)
    await guide.locator('label:has-text("Minimum tickets") input').fill('2')
    await guide.getByRole('button', { name: 'Add prize' }).click()
    await guide.getByText(prizeName).first().waitFor({ timeout: 10000 })
    pass('guide can add a waiting prize')

    await guide.getByRole('button', { name: 'Draw' }).click()
    const row = guide.locator('article').filter({ hasText: prizeName })
    await row.getByRole('button', { name: 'Start' }).click()
    await guide.waitForURL(/\/spin\//, { timeout: 15000 })
    pass('start opens the live board')

    await guide.getByRole('heading', { name: prizeName }).waitFor({ timeout: 10000 })
    const boardText = await guide.locator('main').innerText()
    if (boardText.includes('0 tickets')) pass('board starts at 0 tickets')
    else fail('board starts at 0 tickets', boardText)

    const beforeSpinNames = await guide.locator('main p.text-3xl, main .text-3xl.font-bold').allInnerTexts()
    const leaked = beforeSpinNames.some((t) => /mia|leo|jules|nora|kai|chen/i.test(t))
    if (!leaked) pass('no student name under wheel before spin')
    else fail('no student name under wheel before spin', beforeSpinNames.join(' | '))

    await student.getByRole('heading', { name: prizeName }).waitFor({ timeout: 25000 })
    pass('student prize appears without reload')

    const amount = student.locator('article').filter({ hasText: prizeName }).locator('input')
    await amount.fill('3')
    const typed = await amount.inputValue()
    if (typed === '3') pass('typing 3 does not become 03')
    else fail('typing 3 does not become 03', typed)

    const card = student.locator('article').filter({ hasText: prizeName })
    student.once('console', (msg) => {
      if (msg.type() === 'error') console.log('STUDENT CONSOLE', msg.text())
    })
    await card.getByRole('button', { name: 'Add' }).click()
    try {
      await student.getByText(/3 tickets of yours/).waitFor({ timeout: 12000 })
      pass('student add shows 3 tickets, not 03')
    } catch {
      const body = await student.locator('main').innerText()
      fail('student add shows 3 tickets, not 03', body)
      throw new Error(`add did not stick: ${body}`)
    }

    await guide.getByText('3 tickets').waitFor({ timeout: 20000 })
    const afterAdd = await guide.locator('main').innerText()
    if (afterAdd.includes('1 student') && afterAdd.includes('Mia')) pass('board pie live-updates when tickets are added')
    else fail('board pie live-updates when tickets are added', afterAdd)

    await amount.fill('2')
    await student.locator('article').filter({ hasText: prizeName }).getByRole('button', { name: 'Add' }).click()
    await student.getByText('5 tickets of yours').waitFor({ timeout: 15000 })
    await guide.getByText('5 tickets').waitFor({ timeout: 20000 })
    pass('slice grows when more tickets are added')

    await amount.fill('2')
    await student.locator('article').filter({ hasText: prizeName }).getByRole('button', { name: 'Remove' }).click()
    await student.getByText('3 tickets of yours').waitFor({ timeout: 15000 })
    await guide.getByText('3 tickets').waitFor({ timeout: 20000 })
    pass('slice shrinks when tickets are removed')

    await guide.getByRole('link', { name: 'Tickets' }).click()
    await guide.waitForURL(/\/hall/, { timeout: 10000 })
    await guide.getByRole('heading', { name: prizeName }).waitFor({ timeout: 10000 })
    pass('guide can open the ticket screen')

    await guide.getByRole('link', { name: 'Board' }).click()
    await guide.waitForURL(/\/spin\//, { timeout: 10000 })
    pass('guide can return to the board from tickets')

    const leoCtx = await browser.newContext()
    const leo = await leoCtx.newPage()
    await signIn(leo, 'student', 'leo', 'alpha')
    await leo.getByRole('heading', { name: prizeName }).waitFor({ timeout: 20000 })
    const leoAmount = leo.locator('article').filter({ hasText: prizeName }).locator('input')
    await leoAmount.fill('2')
    await leo.locator('article').filter({ hasText: prizeName }).getByRole('button', { name: 'Add' }).click()
    await leo.getByText('2 tickets of yours').waitFor({ timeout: 15000 })
    await guide.getByText('2 students').waitFor({ timeout: 20000 })
    pass('second student slice appears live on the board')
    await leoCtx.close()

    await guide.getByRole('button', { name: 'Spin' }).click()
    await guide.getByRole('dialog').waitFor({ timeout: 20000 })
    const dialog = await guide.getByRole('dialog').innerText()
    if (/won/i.test(dialog)) pass('spin shows a winner popup')
    else fail('spin shows a winner popup', dialog)

    await student.getByRole('dialog').waitFor({ timeout: 20000 })
    const studentDialog = await student.getByRole('dialog').innerText()
    if (/won/i.test(studentDialog)) pass('winner popup appears on student without reload')
    else fail('winner popup appears on student without reload', studentDialog)

    await guide.getByRole('button', { name: /^(OK|Keep this up)$/ }).click()
    await guide.getByRole('link', { name: 'Desk' }).click()
    await guide.waitForURL(/\/desk/, { timeout: 10000 })
    await guide.getByRole('button', { name: 'Prizes' }).click()
    guide.once('dialog', (d) => d.accept())
    await guide.locator('article').filter({ hasText: prizeName }).getByRole('button', { name: 'Delete' }).click()
    await guide.waitForTimeout(2000)
    const gone = await guide.locator('article').filter({ hasText: prizeName }).count()
    if (gone === 0) pass('awarded test prize can be deleted')
    else fail('awarded test prize can be deleted', 'still listed')
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

main()
