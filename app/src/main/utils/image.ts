import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'

const MAX_WIDTH = 1280
const JPEG_QUALITY = 80

export interface ProcessedScreenshot {
  buffer: Buffer
  format: 'jpeg'
  width: number
  height: number
  bytes: number
}

export async function processScreenshot(input: Buffer): Promise<ProcessedScreenshot> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: MAX_WIDTH,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true
    })
    .toBuffer({ resolveWithObject: true })

  if (typeof info.width !== 'number' || typeof info.height !== 'number') {
    throw new Error('Unable to determine processed screenshot dimensions.')
  }

  return {
    buffer: data,
    format: 'jpeg',
    width: info.width,
    height: info.height,
    bytes: data.byteLength
  }
}

export function getScreenshotTempDir(): string {
  const directory = join(tmpdir(), 'woowoomo', 'screenshots')

  mkdirSync(directory, { recursive: true })

  return directory
}

export async function saveScreenshotToTemp(input: Buffer): Promise<string> {
  const filePath = join(getScreenshotTempDir(), `screenshot-${randomUUID()}.jpg`)

  await writeFile(filePath, input)

  return filePath
}
