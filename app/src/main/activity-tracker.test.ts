import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActivityEvent } from '../shared/types'

import { WindowWatcher, type WindowWatcherSample, type WindowWatcherWindowInfo } from './activity-tracker'

function createNowClock(startIso: string): () => Date {
  let tick = 0
  const startMs = Date.parse(startIso)

  return () => {
    const value = new Date(startMs + tick * 1000)
    tick += 1
    return value
  }
}

function createSequenceReader(sequence: WindowWatcherWindowInfo[]): () => Promise<WindowWatcherWindowInfo> {
  let index = 0

  return async () => {
    const value = sequence[Math.min(index, sequence.length - 1)]

    index += 1
    return value ?? { appName: null, windowTitle: null }
  }
}

describe('WindowWatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls every interval and supports pause/resume without writing while paused', async () => {
    vi.useFakeTimers()

    const events: ActivityEvent[] = []
    const reader = vi.fn(async () => ({ appName: 'Google Chrome', windowTitle: '조코딩 - YouTube' }))
    const watcher = new WindowWatcher({
      pollIntervalMs: 1_000,
      readWindow: reader,
      now: createNowClock('2026-03-29T00:00:00.000Z'),
      persistence: {
        persistActivityEvent(event): void {
          events.push(event)
        }
      }
    })

    await watcher.start()
    await vi.advanceTimersByTimeAsync(3_000)
    const rowsAfterThreeSeconds = events.length

    expect(rowsAfterThreeSeconds).toBeGreaterThanOrEqual(2)

    await watcher.pause()
    const rowsWhilePaused = events.length

    await vi.advanceTimersByTimeAsync(3_000)
    expect(events).toHaveLength(rowsWhilePaused)

    await watcher.resume()
    expect(events.length).toBeGreaterThan(rowsWhilePaused)

    await watcher.stop()
  })

  it('records a new activity event when the window title changes', async () => {
    vi.useFakeTimers()

    const events: ActivityEvent[] = []
    const samples: WindowWatcherSample[] = []
    const watcher = new WindowWatcher({
      pollIntervalMs: 1_000,
      readWindow: createSequenceReader([
        { appName: 'Google Chrome', windowTitle: '조코딩 - YouTube' },
        { appName: 'Google Chrome', windowTitle: '조코딩 - YouTube' },
        { appName: 'Google Chrome', windowTitle: 'Stack Overflow - useEffect' }
      ]),
      now: createNowClock('2026-03-29T00:10:00.000Z'),
      persistence: {
        persistActivityEvent(event, sample): void {
          events.push(event)
          samples.push(sample)
        }
      }
    })

    await watcher.start()
    await vi.advanceTimersByTimeAsync(2_000)
    await watcher.stop()

    expect(events.length).toBeGreaterThanOrEqual(3)
    expect(events.some((event) => event.window_title === 'Stack Overflow - useEffect')).toBe(true)

    const titleChangedSample = samples.find(
      (sample) =>
        sample.previous !== null &&
        sample.previous.appName === sample.appName &&
        sample.previous.windowTitle !== sample.windowTitle
    )

    if (titleChangedSample === undefined) {
      throw new Error('Expected title-change sample to be recorded.')
    }

    expect(titleChangedSample.hasChanged).toBe(true)
  })
})
