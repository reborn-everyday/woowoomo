import { execFile, type ExecFileException } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const DEFAULT_FFMPEG_COMMAND = 'ffmpeg'
const DEFAULT_FFPROBE_COMMAND = 'ffprobe'
const DEFAULT_BASE_TIMEOUT_MS = 60_000
const DEFAULT_PER_FRAME_TIMEOUT_MS = 10_000
const EXEC_MAX_BUFFER = 10 * 1024 * 1024

const FFMPEG_INSTALL_HINT = 'brew install ffmpeg'

const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv'])

export interface VideoProcessorOptions {
  ffmpegCommand?: string
  ffprobeCommand?: string
  baseTimeoutMs?: number
  perFrameTimeoutMs?: number
}

export interface ExtractedFrame {
  index: number
  path: string
  videoTimestampSec: number
}

export interface ExtractFramesResult {
  frames: ExtractedFrame[]
  outputDirectory: string
  durationSec: number
  intervalSec: number
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function toProcessorError(error: ExecFileException, stderr: string, command: string): Error {
  const nodeError = error as NodeJS.ErrnoException

  if (nodeError.code === 'ENOENT') {
    return new Error(`${command} is not installed. Install it with '${FFMPEG_INSTALL_HINT}'.`, { cause: error })
  }

  if (error.killed) {
    return new Error(`${command} timed out.`, { cause: error })
  }

  const stderrMessage = stderr.trim()

  if (stderrMessage.length > 0) {
    return new Error(`${command} failed: ${stderrMessage}`, { cause: error })
  }

  return new Error(`${command} failed: ${error.message}`, { cause: error })
}

export function isSupportedVideoExtension(filePath: string): boolean {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()

  return SUPPORTED_EXTENSIONS.has(extension)
}

export function createVideoTempDir(): string {
  const directory = join(tmpdir(), 'woowoomo', 'video-frames', randomUUID())

  mkdirSync(directory, { recursive: true })

  return directory
}

export class VideoProcessor {
  private readonly ffmpegCommand: string
  private readonly ffprobeCommand: string
  private readonly baseTimeoutMs: number
  private readonly perFrameTimeoutMs: number

  constructor(options: VideoProcessorOptions = {}) {
    this.ffmpegCommand = options.ffmpegCommand ?? DEFAULT_FFMPEG_COMMAND
    this.ffprobeCommand = options.ffprobeCommand ?? DEFAULT_FFPROBE_COMMAND
    this.baseTimeoutMs = options.baseTimeoutMs ?? DEFAULT_BASE_TIMEOUT_MS
    this.perFrameTimeoutMs = options.perFrameTimeoutMs ?? DEFAULT_PER_FRAME_TIMEOUT_MS
  }

  async checkFfmpegInstalled(): Promise<boolean> {
    try {
      await this.execute(this.ffmpegCommand, ['-version'], this.baseTimeoutMs)
      return true
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false
      }

      if (error instanceof Error && error.message.includes('not installed')) {
        return false
      }

      return true
    }
  }

  async getVideoDuration(filePath: string): Promise<number> {
    const stdout = await this.execute(
      this.ffprobeCommand,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      this.baseTimeoutMs
    )

    const duration = parseFloat(stdout.trim())

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`ffprobe returned an invalid duration for '${filePath}'.`)
    }

    return duration
  }

  async extractFrames(filePath: string, intervalSec: number, outputDirectory?: string): Promise<ExtractFramesResult> {
    const directory = outputDirectory ?? createVideoTempDir()

    mkdirSync(directory, { recursive: true })

    const durationSec = await this.getVideoDuration(filePath)
    const expectedFrameCount = Math.max(1, Math.ceil(durationSec / intervalSec))
    const timeoutMs = this.baseTimeoutMs + expectedFrameCount * this.perFrameTimeoutMs

    const outputPattern = join(directory, 'frame_%04d.png')

    await this.execute(
      this.ffmpegCommand,
      ['-i', filePath, '-vf', `fps=1/${intervalSec}`, '-q:v', '2', outputPattern],
      timeoutMs
    )

    const files = await readdir(directory)
    const framePaths = files
      .filter((file) => file.startsWith('frame_') && file.endsWith('.png'))
      .sort()

    const frames: ExtractedFrame[] = framePaths.map((file, index) => ({
      index,
      path: join(directory, file),
      videoTimestampSec: index * intervalSec
    }))

    return {
      frames,
      outputDirectory: directory,
      durationSec,
      intervalSec
    }
  }

  private async execute(command: string, args: string[], timeoutMs: number): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      execFile(
        command,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: EXEC_MAX_BUFFER
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(toProcessorError(error, stderr, command))
            return
          }

          resolve(stdout.trim())
        }
      )
    })
  }
}
