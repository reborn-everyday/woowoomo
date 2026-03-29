import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const anthropicCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => {
  class AnthropicMock {
    public messages = {
      create: anthropicCreateMock
    }
  }

  return {
    default: AnthropicMock
  }
})

import type { AIProvider, DailyData } from '../../shared/types'

import { ClaudeProvider } from './claude'

function textResponse(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text }]
  }
}

function createDailyData(): DailyData {
  return {
    goals: [],
    activity_events: [],
    screenshot_analyses: [],
    prev_report: null
  }
}

describe('ClaudeProvider', () => {
  beforeEach(() => {
    anthropicCreateMock.mockReset()
  })

  it('implements AIProvider interface contract', () => {
    const provider: AIProvider = new ClaudeProvider({ apiKey: 'test-key' })

    expect(typeof provider.analyzeScreenshot).toBe('function')
    expect(typeof provider.categorize).toBe('function')
    expect(typeof provider.structureGoal).toBe('function')
    expect(typeof provider.generateReport).toBe('function')
  })

  it('parses analyzeScreenshot response with tool_in_video', async () => {
    anthropicCreateMock.mockResolvedValueOnce(
      textResponse(
        JSON.stringify({
          current_task: 'Implementing React component',
          tool_in_video: 'VS Code',
          category: 'coding',
          focus_score: 88,
          task_state: 'in_progress',
          notes: 'Focused coding session'
        })
      )
    )

    const provider = new ClaudeProvider({ apiKey: 'test-key' })
    const result = await provider.analyzeScreenshot([Buffer.from('jpeg-bytes')])

    expect(result).toHaveLength(1)
    expect(result[0]?.tool_in_video).toBe('VS Code')
    expect(result[0]?.focus_score).toBe(88)
  })

  it('falls back to focus_score 0 when vision payload is malformed', async () => {
    anthropicCreateMock.mockResolvedValueOnce(textResponse('not-a-json-response'))

    const provider = new ClaudeProvider({ apiKey: 'test-key' })
    const result = await provider.analyzeScreenshot([Buffer.from('placeholder-image')])

    expect(result).toHaveLength(1)
    expect(result[0]?.focus_score).toBe(0)
    expect(result[0]?.tool_in_video).toBe('Other')
  })

  it('categorizes coding descriptions correctly', async () => {
    anthropicCreateMock.mockResolvedValueOnce(
      textResponse(
        JSON.stringify({
          category: 'coding',
          tags: ['react', 'vscode']
        })
      )
    )

    const provider = new ClaudeProvider({ apiKey: 'test-key' })
    const result = await provider.categorize('VS Code에서 React 작업')

    expect(result.category).toBe('coding')
    expect(result.tags).toContain('react')
  })

  it('falls back to other categorization when schema parsing fails', async () => {
    anthropicCreateMock.mockResolvedValueOnce(textResponse('{"category":"invalid"}'))

    const provider = new ClaudeProvider({ apiKey: 'test-key' })
    const result = await provider.categorize('ambiguous text')

    expect(result).toEqual({ category: 'other', tags: [] })
  })

  it('structures writing goals with target_behaviors including writing', async () => {
    anthropicCreateMock.mockResolvedValueOnce(
      textResponse(
        JSON.stringify({
          goal_text: 'PRD 작성 2시간',
          target_behaviors: ['writing'],
          anti_behaviors: ['media'],
          success_metric: { focused_minutes: 120 }
        })
      )
    )

    const provider = new ClaudeProvider({ apiKey: 'test-key' })
    const result = await provider.structureGoal('PRD 작성 2시간')

    expect(result.target_behaviors).toContain('writing')
    expect(result.success_metric.focused_minutes).toBe(120)
  })

  it('uses heuristic goal fallback when goal payload is malformed', async () => {
    anthropicCreateMock.mockResolvedValueOnce(textResponse('malformed-goal-json'))

    const provider = new ClaudeProvider({ apiKey: 'test-key' })
    const result = await provider.structureGoal('PRD 작성 2시간')

    expect(result.goal_text).toBe('PRD 작성 2시간')
    expect(result.target_behaviors).toContain('writing')
    expect(result.success_metric.focused_minutes).toBe(120)
  })

  it('throws clear error immediately for invalid API key without retry', async () => {
    anthropicCreateMock.mockRejectedValueOnce({ status: 401, message: 'invalid key' })

    const provider = new ClaudeProvider({ apiKey: 'bad-key', initialRetryDelayMs: 1, maxRetries: 3 })

    await expect(provider.categorize('VS Code에서 React 작업')).rejects.toThrow('Invalid Claude API key.')
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 and succeeds with exponential backoff flow', async () => {
    anthropicCreateMock
      .mockRejectedValueOnce({ status: 429, message: 'rate limit' })
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify({
            category: 'coding',
            tags: ['retry-success']
          })
        )
      )

    const provider = new ClaudeProvider({ apiKey: 'test-key', initialRetryDelayMs: 1, maxRetries: 2 })
    const result = await provider.categorize('VS Code에서 React 작업')

    expect(result.category).toBe('coding')
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to empty report shape when report payload is malformed', async () => {
    anthropicCreateMock.mockResolvedValueOnce(textResponse('invalid-report-json'))

    const provider = new ClaudeProvider({ apiKey: 'test-key' })
    const report = await provider.generateReport(createDailyData())

    expect(report.focus_curve).toEqual([])
    expect(report.nudges).toEqual([])
    expect(report.goal_alignment_score).toBeNull()
  })
})
