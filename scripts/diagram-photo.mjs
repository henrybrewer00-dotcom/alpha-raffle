import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const html = resolve('docs/diagrams/friday-raffle.html')
const out = resolve('docs/diagrams/system.png')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 980 },
  deviceScaleFactor: 2,
})
await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log(out)
