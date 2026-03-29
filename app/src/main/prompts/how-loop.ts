export interface HowLoopPromptOptions {
  goalText: string
  whyAnalysis: string[]
  serializedContext?: string
}

export function buildHowLoopPrompt(options: HowLoopPromptOptions): { system: string; user: string } {
  return {
    system:
      '당신은 행동 교정 제안을 작성합니다. 실행 가능한 제안만 작성하고, 출력은 JSON 배열 문자열만 반환하세요.',
    user: [
      `목표: ${options.goalText}`,
      `원인 분석: ${JSON.stringify(options.whyAnalysis)}`,
      options.serializedContext ? `맥락 데이터: ${options.serializedContext}` : '맥락 데이터: 없음',
      '반환 형식: ["25분 집중 블록 뒤에 메신저 확인 5분을 배치", "목표를 45분 단위로 다시 분해"]'
    ].join('\n')
  }
}
