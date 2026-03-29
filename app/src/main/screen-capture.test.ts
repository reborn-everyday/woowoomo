import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import { ScreenshotCapture } from './screen-capture'

const RECORD_INSTALL_HINT = "record CLI is not installed. Install it with 'brew install atacan/tap/record'."
const LIVE_RECORD_PATH = '/opt/homebrew/bin/record'
const RUN_LIVE_CAPTURE_QA = process.env.WOOWOOMO_LIVE_CAPTURE_QA === '1'
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z9lEAAAAASUVORK5CYII='

const createdDirectories: string[] = []
const createdFiles: string[] = []

afterEach(async () => {
  await Promise.all(createdFiles.map(async (filePath) => rm(filePath, { force: true })))
  createdFiles.length = 0

  await Promise.all(createdDirectories.map(async (directory) => rm(directory, { recursive: true, force: true })))
  createdDirectories.length = 0
})

async function createFakeRecordCommand(): Promise<{ commandPath: string; outputDirectory: string }> {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'woowoomo-screen-capture-test-'))
  const outputDirectory = join(rootDirectory, 'output')
  const commandPath = join(rootDirectory, 'record')

  createdDirectories.push(rootDirectory)

  const script = `#!/usr/bin/env node
const { Buffer } = require('node:buffer')
const { writeFileSync } = require('node:fs')

const args = process.argv.slice(2)

if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('record help')
  process.exit(0)
}

if (args[0] === 'screen' && args[1] === '--list-displays' && args.includes('--json')) {
  process.stdout.write(JSON.stringify([{ id: 1, width: 2560, height: 1440, frame: { x: 0, y: 0, width: 2560, height: 1440 } }]))
  process.exit(0)
}

if (args[0] === 'screen' && args[1] === '--screenshot') {
  const outputIndex = args.indexOf('--output')
  const displayIndex = args.indexOf('--display')

  if (outputIndex === -1 || outputIndex + 1 >= args.length) {
    process.stderr.write('missing --output argument')
    process.exit(1)
  }

  const outputPath = args[outputIndex + 1]
  const displayId = displayIndex !== -1 && displayIndex + 1 < args.length ? Number(args[displayIndex + 1]) : 1

  writeFileSync(outputPath, Buffer.from('${PNG_1X1_BASE64}', 'base64'))
  process.stdout.write(JSON.stringify({ format: 'png', path: outputPath, width: 1, height: 1, displayId }))
  process.exit(0)
}

process.stderr.write('unexpected arguments: ' + args.join(' '))
process.exit(1)
`

  await writeFile(commandPath, script)
  await chmod(commandPath, 0o755)

  return { commandPath, outputDirectory }
}

describe('ScreenshotCapture', () => {
  it('checks record installation and lists displays', async () => {
    const fakeRecord = await createFakeRecordCommand()
    const capture = new ScreenshotCapture({
      recordCommand: fakeRecord.commandPath,
      outputDirectory: fakeRecord.outputDirectory
    })

    await expect(capture.checkRecordInstalled()).resolves.toBe(true)

    const displays = await capture.listDisplays()
    expect(displays).toHaveLength(1)
    expect(displays[0]?.id).toBe(1)
    expect(displays[0]?.width).toBe(2560)
    expect(displays[0]?.height).toBe(1440)
  })

  it('captures all displays and returns JPEG buffers within width constraints', async () => {
    const fakeRecord = await createFakeRecordCommand()
    const capture = new ScreenshotCapture({
      recordCommand: fakeRecord.commandPath,
      outputDirectory: fakeRecord.outputDirectory
    })

    const results = await capture.captureAllDisplays()
    expect(results.length).toBeGreaterThan(0)

    for (const result of results) {
      createdFiles.push(result.pngPath, result.screenshotPath)

      expect(typeof result.displayId).toBe('number')
      expect(Buffer.isBuffer(result.image)).toBe(true)
      expect(result.image.byteLength).toBeGreaterThan(0)
      expect(result.image[0]).toBe(0xff)
      expect(result.image[1]).toBe(0xd8)

      const metadata = await sharp(result.image).metadata()

      expect(metadata.format).toBe('jpeg')
      expect((metadata.width ?? 0) <= 1280).toBe(true)
    }
  })

  it('returns a clear install message when record CLI is missing', async () => {
    const capture = new ScreenshotCapture({ recordCommand: join(tmpdir(), `missing-record-${Date.now()}`) })

    await expect(capture.checkRecordInstalled()).rejects.toThrow(RECORD_INSTALL_HINT)
  })

  const liveIt = RUN_LIVE_CAPTURE_QA ? it : it.skip

  liveIt('passes live record capture QA against installed CLI', async () => {
    const capture = new ScreenshotCapture({ recordCommand: LIVE_RECORD_PATH })

    await expect(capture.checkRecordInstalled()).resolves.toBe(true)

    const displays = await capture.listDisplays()
    expect(displays.length).toBeGreaterThan(0)

    const results = await capture.captureAllDisplays()
    expect(results.length).toBeGreaterThan(0)

    for (const result of results) {
      createdFiles.push(result.pngPath, result.screenshotPath)

      expect(typeof result.displayId).toBe('number')
      expect(Buffer.isBuffer(result.image)).toBe(true)
      expect(result.image.byteLength).toBeGreaterThan(0)
      expect(result.image[0]).toBe(0xff)
      expect(result.image[1]).toBe(0xd8)

      const metadata = await sharp(result.image).metadata()

      expect(metadata.format).toBe('jpeg')
      expect((metadata.width ?? 0) <= 1280).toBe(true)
    }
  })
})
