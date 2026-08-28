import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/** Node-side sample type. The function passed to page.evaluate is compiled JS only. */
type FrameSample = { fill: number; mean: number }

async function waitForCyx(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'CYX', exact: true }).click()
  await expect(page.getByText('synthetic-cyx')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.mm-image-viewer-stage canvas')).toBeVisible()
  await page.waitForTimeout(1500)
}

async function startRafCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('.mm-image-viewer-stage canvas')
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('no canvas')
    const samples: { fill: number; mean: number }[] = []
    const copy = document.createElement('canvas')
    const read = () => {
      copy.width = canvas.width
      copy.height = canvas.height
      const context = copy.getContext('2d')
      if (!context) return { fill: 0, mean: 0 }
      context.drawImage(canvas, 0, 0)
      const pixels = context.getImageData(0, 0, copy.width, copy.height).data
      let lit = 0
      let sum = 0
      for (let index = 0; index < pixels.length; index += 16) {
        const red = pixels[index] ?? 0
        const green = pixels[index + 1] ?? 0
        const blue = pixels[index + 2] ?? 0
        const luma = (red + green + blue) / 3
        sum += luma
        if (luma > 16) lit += 1
      }
      const sampled = Math.ceil(pixels.length / 16)
      return { fill: lit / sampled, mean: sum / sampled }
    }
    const run = (deadline: number) => {
      samples.push(read())
      if (performance.now() < deadline) requestAnimationFrame(() => run(deadline))
    }
    Object.assign(window, {
      __flashSamples: samples,
      __flashStart: (ms: number) => {
        samples.length = 0
        requestAnimationFrame(() => run(performance.now() + ms))
      },
    })
  })
}

async function takeSamples(page: Page, ms: number): Promise<FrameSample[]> {
  await page.evaluate((duration) => {
    ;(window as unknown as { __flashStart: (ms: number) => void }).__flashStart(duration)
  }, ms)
  await page.waitForTimeout(ms + 50)
  return page.evaluate(() => {
    return (window as unknown as { __flashSamples: FrameSample[] }).__flashSamples
  })
}

function summarize(label: string, samples: FrameSample[]): void {
  const fills = samples.map((sample) => sample.fill)
  const means = samples.map((sample) => sample.mean)
  console.log(
    JSON.stringify({
      label,
      frames: samples.length,
      fillMin: Number(Math.min(...fills).toFixed(4)),
      fillMax: Number(Math.max(...fills).toFixed(4)),
      meanMin: Number(Math.min(...means).toFixed(2)),
      meanMax: Number(Math.max(...means).toFixed(2)),
      emptyFrames: samples.filter((sample) => sample.fill < 0.01).length,
      darkFrames: samples.filter((sample) => sample.mean < 4).length,
      fills: fills.map((value) => Number(value.toFixed(3))),
      means: means.map((value) => Number(value.toFixed(1))),
    }),
  )
}

test('CYX rAF fill around wheel then double-click home', async ({ page }, testInfo) => {
  await waitForCyx(page)
  await startRafCapture(page)

  summarize('idle-home', await takeSamples(page, 400))

  const stage = page.locator('.mm-image-viewer-stage').first()
  const box = await stage.boundingBox()
  if (!box) throw new Error('stage has no box')
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.wheel(0, -800)
  await page.waitForTimeout(400)

  await page.evaluate((duration) => {
    ;(window as unknown as { __flashStart: (ms: number) => void }).__flashStart(duration)
  }, 800)
  const outDir = join(import.meta.dirname, 'output')
  await mkdir(outDir, { recursive: true })
  await stage.dblclick({ position: { x: box.width * 0.5, y: box.height * 0.5 } })
  for (const delay of [0, 50, 100, 200]) {
    if (delay > 0) await page.waitForTimeout(delay)
    const png = await page.locator('.mm-image-viewer-stage canvas').first().screenshot()
    await writeFile(join(outDir, `home-${delay}ms.png`), png)
    await testInfo.attach(`home-${delay}ms.png`, { body: png, contentType: 'image/png' })
  }
  await page.waitForTimeout(500)
  const afterHome = await page.evaluate(() => {
    return (window as unknown as { __flashSamples: FrameSample[] }).__flashSamples
  })
  summarize('wheel-then-dblclick-home', afterHome)

  const fillMin = Math.min(...afterHome.map((sample) => sample.fill))
  // Background coverage after home. ~0.26 was missing Viv ImageLayer (single-level CYX).
  // If this fails near 0.26 again: stop. Do not patch goHome / viewState / applyingView.
  expect(fillMin).toBeGreaterThan(0.42)
  expect(afterHome.length).toBeGreaterThan(5)
})

test('CYX side layout creates two independent pane canvases', async ({ page }) => {
  await waitForCyx(page)
  await expect(page.locator('.mm-image-viewer-stage canvas')).toHaveCount(1)
  await page.getByRole('radio', { name: 'Side by side' }).click()
  await expect(page.locator('.mm-image-pane')).toHaveCount(2)
  await expect(page.locator('.mm-image-viewer-stage canvas')).toHaveCount(2)
})
