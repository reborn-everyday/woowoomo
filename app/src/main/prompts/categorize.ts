export interface CategorizePromptOptions {
  description: string
}

export function buildCategorizePrompt(
  options: CategorizePromptOptions
): { system: string; user: string } {
  return {
    system:
      '당신은 activity categorization 단계만 담당합니다. 이전 Vision 설명을 다시 해석하지 말고, 허용된 enum으로 category와 tags만 JSON으로 반환하세요.',
    user: [
      '설명:',
      options.description,
      '',
      'category는 coding | writing | designing | reading | media | browsing | messaging | meeting | admin | other 중 하나만 사용하세요.',
      '반환 형식: {"category":"coding","tags":["react","vscode"]}'
    ].join('\n')
  }
}
