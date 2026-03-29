export interface OpenClawDelegateInput {
  prompt: string
}

export interface OpenClawDelegateResponse {
  status: 'simulated'
  accepted: true
  dispatched: false
  prompt: string
  requestId: string
  createdAt: string
  message: string
  simulation: {
    source: 'docs/SIMULATION_REGISTER.md'
    capability: 'OpenClaw delegation bridge'
    liveIntegrationAvailable: false
    reason: string
    realPathExpectation: string
  }
}

export async function delegateToOpenClaw(
  input: OpenClawDelegateInput,
  now: () => Date = () => new Date()
): Promise<OpenClawDelegateResponse> {
  const prompt = input.prompt.trim()

  if (prompt.length === 0) {
    throw new Error('delegate prompt cannot be empty.')
  }

  const createdAt = now().toISOString()

  return {
    status: 'simulated',
    accepted: true,
    dispatched: false,
    prompt,
    requestId: `openclaw-sim-${createdAt}`,
    createdAt,
    message: 'OpenClaw delegation is simulated in this live-safe MVP. No external CLI or HTTP bridge was invoked.',
    simulation: {
      source: 'docs/SIMULATION_REGISTER.md',
      capability: 'OpenClaw delegation bridge',
      liveIntegrationAvailable: false,
      reason: 'External OpenClaw integration is intentionally simulated because the live spec is still uncertain.',
      realPathExpectation: 'Replace the simulation only when the live spec is verified pre-launch.'
    }
  }
}
