export interface VisionAnalyzePromptOptions {
  imageCount: number
}

export function buildVisionAnalyzePrompt(
  options: VisionAnalyzePromptOptions
): { system: string; user: string } {
  const responseShape =
    options.imageCount > 1
      ? '[{"current_task":"...","tool_in_video":"VS Code","category":"coding","focus_score":72,"task_state":"in_progress","notes":"..."}]'
      : '{"current_task":"...","tool_in_video":"VS Code","category":"coding","focus_score":72,"task_state":"in_progress","notes":"..."}'

  return {
    system:
      '당신은 macOS 데스크톱 앱의 Vision 분석기입니다. 이 화면은 브라우저 UI 자체가 아니라, 유튜브 영상 안에 보이는 발표자 화면을 분석해야 합니다. 출력은 설명 없이 JSON만 반환하세요.',
    user: [
      `입력 이미지 수: ${options.imageCount}장.`,
      '브라우저 크롬이 아니라 영상 안 발표자가 지금 무엇을 하고 있는지 판단하세요.',
      '영상이 보이지 않거나 로딩/placeholder 상태라면 focus_score는 반드시 0으로 두세요.',
      'category는 coding | writing | designing | reading | media | browsing | messaging | meeting | admin | other 중 하나만 사용하세요.',
      'tool_in_video는 VS Code | Terminal | Browser | Slides | Other 중 하나만 사용하세요.',
      'task_state는 starting | in_progress | switching | explaining 중 하나만 사용하세요.',
      `반환 형식: ${responseShape}`
    ].join('\n')
  }
}
