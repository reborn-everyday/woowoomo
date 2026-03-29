import { readFile, rm, stat } from 'node:fs/promises'

import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import { getScreenshotTempDir, processScreenshot, saveScreenshotToTemp } from './image'

const MAX_OUTPUT_BYTES = 500 * 1024

const createdFiles: string[] = []

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value))
}

async function createPatternPng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3
      const stripe = Math.floor(x / 160)
      const band = Math.floor(y / 120)
      const shade = ((x % 160) < 80 ? 20 : -20) + ((y % 120) < 60 ? 12 : -12)
      const redBase = 32 + stripe * 14
      const greenBase = 48 + band * 12
      const blueBase = 96 + ((stripe + band) % 4) * 24

      pixels[index] = clampChannel(redBase + shade)
      pixels[index + 1] = clampChannel(greenBase + shade)
      pixels[index + 2] = clampChannel(blueBase + shade)
    }
  }

  return await sharp(pixels, {
    raw: {
      width,
      height,
      channels: 3
    }
  })
    .png()
    .toBuffer()
}

afterEach(async () => {
  await Promise.all(createdFiles.map(async (filePath) => rm(filePath, { force: true })))
  createdFiles.length = 0
})

describe('image utils', () => {
  it('resizes large screenshots to 1280px wide JPEGs while preserving aspect ratio and size budget', async () => {
    const input = await createPatternPng(2560, 1440)
    const processed = await processScreenshot(input)
    const metadata = await sharp(processed.buffer).metadata()

    expect(processed.buffer[0]).toBe(0xff)
    expect(processed.buffer[1]).toBe(0xd8)
    expect(processed.bytes).toBeLessThan(MAX_OUTPUT_BYTES)
    expect(metadata.format).toBe('jpeg')
    expect(metadata.width).toBe(1280)
    expect(metadata.height).toBe(720)
    expect(processed.width).toBe(1280)
    expect(processed.height).toBe(720)
  })

  it('does not upscale smaller screenshots', async () => {
    const input = await createPatternPng(640, 480)
    const processed = await processScreenshot(input)
    const metadata = await sharp(processed.buffer).metadata()

    expect(metadata.width).toBe(640)
    expect(metadata.height).toBe(480)
    expect(processed.width).toBe(640)
    expect(processed.height).toBe(480)
  })

  it('creates the screenshot temp directory and saves JPEG buffers into it', async () => {
    const input = await createPatternPng(800, 600)
    const processed = await processScreenshot(input)
    const directory = getScreenshotTempDir()
    const savedPath = await saveScreenshotToTemp(processed.buffer)
    const directoryStats = await stat(directory)
    const savedBuffer = await readFile(savedPath)

    createdFiles.push(savedPath)

    expect(directoryStats.isDirectory()).toBe(true)
    expect(savedPath.startsWith(`${directory}/screenshot-`)).toBe(true)
    expect(savedPath.endsWith('.jpg')).toBe(true)
    expect(savedBuffer.equals(processed.buffer)).toBe(true)
    expect(savedBuffer[0]).toBe(0xff)
    expect(savedBuffer[1]).toBe(0xd8)
  })
})
