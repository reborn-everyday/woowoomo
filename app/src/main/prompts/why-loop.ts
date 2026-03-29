export interface WhyLoopPromptOptions {
  goalText: string
  deviationPatterns: string[]
  serializedContext?: string
}

export function buildWhyLoopPrompt(options: WhyLoopPromptOptions): { system: string; user: string } {
  return {
    system:
      '당신은 목표-행동 괴리의 원인 가설을 정리합니다. 관찰 가능한 행동 근거만 사용하고, 출력은 JSON 배열 문자열만 반환하세요.',
    user: [
      `목표: ${options.goalText}`,
      `괴리 패턴: ${JSON.stringify(options.deviationPatterns)}`,
      options.serializedContext ? `맥락 데이터: ${options.serializedContext}` : '맥락 데이터: 없음',
      '반환 형식: ["작업 시작 직후 검색으로 이탈", "불확실한 과제에서 소비형 브라우징으로 전이"]'
    ].join('\n')
  }
}
