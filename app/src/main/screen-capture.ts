import { execFile, type ExecFileException } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { getScreenshotTempDir, processScreenshot, saveScreenshotToTemp } from './utils/image'

const DEFAULT_RECORD_COMMAND = 'record'
const DEFAULT_RECORD_TIMEOUT_MS = 10_000
const RECORD_INSTALL_HINT = 'brew install atacan/tap/record'
const RECORD_OUTPUT_MAX_BUFFER = 1024 * 1024

type DisplayIdentifier = number | 'primary'

interface JsonObject {
  [key: string]: unknown
}

export interface ScreenshotCaptureOptions {
  recordCommand?: string
  outputDirectory?: string
  timeoutMs?: number
}

export interface ScreenshotDisplayFrame {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotDisplay {
  id: number
  width: number
  height: number
  frame: ScreenshotDisplayFrame
}

export interface DisplayCaptureResult {
  displayId: DisplayIdentifier
  pngPath: string
  width: number
  height: number
  format: string
}

export interface PreparedDisplayCapture {
  displayId: number
  image: Buffer
  screenshotPath: string
  pngPath: string
  width: number
  height: number
  bytes: number
  format: 'jpeg'
}

interface RecordScreenshotPayload {
  format: string
  path: string
  width: number
  height: number
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isScreenshotDisplayFrame(value: unknown): value is ScreenshotDisplayFrame {
  return (
    isJsonObject(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  )
}

function isScreenshotDisplay(value: unknown): value is ScreenshotDisplay {
  return (
    isJsonObject(value) &&
    isFiniteNumber(value.id) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    isScreenshotDisplayFrame(value.frame)
  )
}

function isRecordScreenshotPayload(value: unknown): value is RecordScreenshotPayload {
  return (
    isJsonObject(value) &&
    typeof value.format === 'string' &&
    typeof value.path === 'string' &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  )
}

export class ScreenshotCapture {
  private readonly outputDirectory: string
  private readonly recordCommand: string
  private readonly timeoutMs: number

  constructor(options: ScreenshotCaptureOptions = {}) {
    const resolvedOutputDirectory = options.outputDirectory ?? getScreenshotTempDir()

    mkdirSync(resolvedOutputDirectory, { recursive: true })

    this.recordCommand = options.recordCommand ?? DEFAULT_RECORD_COMMAND
    this.outputDirectory = resolvedOutputDirectory
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RECORD_TIMEOUT_MS
  }

  async checkRecordInstalled(): Promise<boolean> {
    await this.executeRecord(['--help'])

    return true
  }

  async listDisplays(): Promise<ScreenshotDisplay[]> {
    const stdout = await this.executeRecord(['screen', '--list-displays', '--json'])
    const payload = this.parseRecordJson(stdout, 'display listing')

    if (!Array.isArray(payload) || !payload.every(isScreenshotDisplay)) {
      throw new Error('record CLI returned an unexpected display listing payload.')
    }

    return payload
  }

  async captureDisplay(displayId: DisplayIdentifier): Promise<DisplayCaptureResult> {
    const outputPath = this.createOutputPath(displayId)
    const stdout = await this.executeRecord([
      'screen',
      '--screenshot',
      '--display',
      String(displayId),
      '--output',
      outputPath,
      '--overwrite',
      '--json'
    ])
    const payload = this.parseRecordJson(stdout, 'display screenshot')

    if (!isRecordScreenshotPayload(payload)) {
      throw new Error('record CLI returned an unexpected screenshot payload.')
    }

    return {
      displayId,
      pngPath: payload.path,
      width: payload.width,
      height: payload.height,
      format: payload.format
    }
  }

  async captureAllDisplays(): Promise<PreparedDisplayCapture[]> {
    const displays = await this.listDisplays()

    if (displays.length === 0) {
      throw new Error('record CLI did not report any displays to capture.')
    }

    const captures: PreparedDisplayCapture[] = []

    for (const display of displays) {
      const rawCapture = await this.captureDisplay(display.id)
      const pngBuffer = await readFile(rawCapture.pngPath)
      const processed = await processScreenshot(pngBuffer)
      const screenshotPath = await saveScreenshotToTemp(processed.buffer)

      captures.push({
        displayId: display.id,
        image: processed.buffer,
        screenshotPath,
        pngPath: rawCapture.pngPath,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
        format: processed.format
      })
    }

    return captures
  }

  private createOutputPath(displayId: DisplayIdentifier): string {
    return join(this.outputDirectory, `record-display-${displayId}-${randomUUID()}.png`)
  }

  private parseRecordJson(stdout: string, context: string): unknown {
    try {
      return JSON.parse(stdout)
    } catch (error) {
      throw new Error(`record CLI returned invalid JSON for ${context}.`, { cause: error })
    }
  }

  private async executeRecord(args: string[]): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      execFile(
        this.recordCommand,
        args,
        {
          timeout: this.timeoutMs,
          maxBuffer: RECORD_OUTPUT_MAX_BUFFER
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(this.toRecordError(error, stderr))
            return
          }

          resolve(stdout.trim())
        }
      )
    })
  }

  private toRecordError(error: ExecFileException, stderr: string): Error {
    const nodeError = error as NodeJS.ErrnoException

    if (nodeError.code === 'ENOENT') {
      return new Error(`record CLI is not installed. Install it with '${RECORD_INSTALL_HINT}'.`, { cause: error })
    }

    if (error.killed) {
      return new Error(`record CLI timed out after ${this.timeoutMs}ms.`, { cause: error })
    }

    const stderrMessage = stderr.trim()

    if (stderrMessage.length > 0) {
      return new Error(`record CLI failed: ${stderrMessage}`, { cause: error })
    }

    return new Error(`record CLI failed: ${error.message}`, { cause: error })
  }
}
