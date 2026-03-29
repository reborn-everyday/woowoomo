import { useCallback, useEffect, useRef, useState } from 'react'

import {
  checkFfmpeg,
  importVideo,
  selectVideoFile,
  subscribeVideoProgress,
  type VideoImportResult,
  type VideoProgressEvent
} from '../lib/electron-api'

type VideoImportPhase = 'idle' | 'checking' | 'selected' | 'extracting' | 'analyzing' | 'complete' | 'error'

interface VideoImportProps {
  apiKeyConfigured: boolean
  onComplete: () => void
  onOpenSettings: () => void
  onOpenReport: () => void
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

function extractFileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

export function VideoImport({
  apiKeyConfigured,
  onComplete,
  onOpenSettings,
  onOpenReport
}: VideoImportProps): JSX.Element {
  const [phase, setPhase] = useState<VideoImportPhase>('idle')
  const [ffmpegInstalled, setFfmpegInstalled] = useState<boolean | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [progress, setProgress] = useState<VideoProgressEvent | null>(null)
  const [result, setResult] = useState<VideoImportResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void (async () => {
      setPhase('checking')
      const check = await checkFfmpeg()

      if (check.error !== null) {
        setFfmpegInstalled(false)
      } else {
        setFfmpegInstalled(check.data?.installed ?? false)
      }

      setPhase('idle')
    })()
  }, [])

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current !== null) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [])

  const handleSelectFile = useCallback(async () => {
    const fileResult = await selectVideoFile()

    if (fileResult.error !== null) {
      setErrorMessage(fileResult.error)
      setPhase('error')
      return
    }

    const filePath = fileResult.data?.filePath ?? null

    if (filePath !== null) {
      setSelectedFile(filePath)
      setPhase('selected')
      setErrorMessage(null)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const files = e.dataTransfer.files

    if (files.length === 0) {
      return
    }

    const file = files[0]

    if (file === undefined) {
      return
    }

    // In Electron, the File object has a `path` property
    const filePath = (file as File & { path?: string }).path

    if (filePath === undefined || filePath.length === 0) {
      setErrorMessage('Could not get file path. Please use the file selector button instead.')
      setPhase('error')
      return
    }

    const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    const supported = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv'])

    if (!supported.has(extension)) {
      setErrorMessage(`Unsupported format: ${extension}. Supported: .mp4, .mov, .webm, .avi, .mkv`)
      setPhase('error')
      return
    }

    setSelectedFile(filePath)
    setPhase('selected')
    setErrorMessage(null)
  }, [])

  const handleStartAnalysis = useCallback(async () => {
    if (selectedFile === null) {
      return
    }

    setPhase('extracting')
    setProgress(null)
    setResult(null)
    setErrorMessage(null)

    const unsub = subscribeVideoProgress((event) => {
      setProgress(event)

      if (event.phase === 'analyzing') {
        setPhase('analyzing')
      }
    })

    unsubscribeRef.current = unsub

    const importResult = await importVideo(selectedFile)

    unsub()
    unsubscribeRef.current = null

    if (importResult.error !== null) {
      setErrorMessage(importResult.error)
      setPhase('error')
      return
    }

    setResult(importResult.data)
    setPhase('complete')
    onComplete()
  }, [selectedFile, onComplete])

  const handleReset = useCallback(() => {
    setPhase('idle')
    setSelectedFile(null)
    setProgress(null)
    setResult(null)
    setErrorMessage(null)
  }, [])

  const isProcessing = phase === 'extracting' || phase === 'analyzing'
  const progressPercent =
    progress !== null && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  if (ffmpegInstalled === false) {
    return (
      <section className="card video-import-card stack-md" id="video-import-section">
        <div className="stack-sm">
          <p className="eyebrow">Video Import</p>
          <h2 className="section-title">Video File Analysis</h2>
        </div>
        <div className="panel-subtle stack-sm">
          <p className="video-import-warning">
            ⚠️ <strong>ffmpeg is not installed.</strong>
          </p>
          <p>ffmpeg is required for video file analysis. Install it with:</p>
          <code className="video-import-code">brew install ffmpeg</code>
          <p className="video-import-hint">Restart the app after installation.</p>
        </div>
      </section>
    )
  }

  if (!apiKeyConfigured) {
    return (
      <section className="card video-import-card stack-md" id="video-import-section">
        <div className="stack-sm">
          <p className="eyebrow">Video Import</p>
          <h2 className="section-title">Video File Analysis</h2>
        </div>
        <div className="panel-subtle stack-sm">
          <p>Please configure your Claude API key to enable video analysis.</p>
          <button className="button button--secondary" type="button" onClick={onOpenSettings}>
            Configure API Key in Settings
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card video-import-card stack-md" id="video-import-section">
      <div className="stack-sm">
        <p className="eyebrow">Video Import</p>
        <h2 className="section-title">Video File Analysis</h2>
      </div>

      {phase === 'idle' || phase === 'checking' ? (
        <div
          className={`drop-zone ${dragOver ? 'drop-zone--active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onClick={() => void handleSelectFile()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              void handleSelectFile()
            }
          }}
        >
          <div className="drop-zone-content">
            <span className="drop-zone-icon">🎬</span>
            <p className="drop-zone-text">
              {phase === 'checking' ? 'Checking…' : 'Drop a video file here or click to browse'}
            </p>
            <p className="drop-zone-hint">.mp4, .mov, .webm, .avi, .mkv</p>
          </div>
        </div>
      ) : null}

      {phase === 'selected' && selectedFile !== null ? (
        <div className="stack-sm">
          <div className="video-file-info">
            <span className="video-file-icon">📄</span>
            <span className="video-file-name">{extractFileName(selectedFile)}</span>
          </div>
          <div className="cluster">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleStartAnalysis()}
            >
              Start Analysis
            </button>
            <button className="button button--ghost" type="button" onClick={handleReset}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {isProcessing ? (
        <div className="stack-sm">
          <div className="video-file-info">
            <span className="video-file-icon">📄</span>
            <span className="video-file-name">{selectedFile !== null ? extractFileName(selectedFile) : ''}</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="video-progress-label">
            {phase === 'extracting'
              ? 'Extracting frames…'
              : progress !== null
                ? `Analyzing frames (${progress.current}/${progress.total}) — ${progress.currentTimestamp}`
                : 'Preparing analysis…'}
          </p>
        </div>
      ) : null}

      {phase === 'complete' && result !== null ? (
        <div className="panel-subtle stack-sm video-import-complete">
          <p className="video-import-success">
            ✅ <strong>Analysis Complete</strong>
          </p>
          <div className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">Frames Processed</span>
              <strong>{result.framesProcessed}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Duration</span>
              <strong>{formatDuration(result.durationSec)}</strong>
            </article>
          </div>
          <div className="cluster">
            <button className="button button--primary" type="button" onClick={onOpenReport}>
              View Report
            </button>
            <button className="button button--ghost" type="button" onClick={handleReset}>
              Analyze Another Video
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'error' && errorMessage !== null ? (
        <div className="panel-subtle stack-sm video-import-error">
          <p className="video-import-warning">
            ❌ <strong>An error occurred</strong>
          </p>
          <p>{errorMessage}</p>
          <button className="button button--ghost" type="button" onClick={handleReset}>
              Try Again
          </button>
        </div>
      ) : null}
    </section>
  )
}
