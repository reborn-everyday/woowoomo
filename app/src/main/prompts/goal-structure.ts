export interface GoalStructurePromptOptions {
  goalText: string
}

export function buildGoalStructurePrompt(
  options: GoalStructurePromptOptions
): { system: string; user: string } {
  return {
    system:
      '당신은 자연어 목표를 행동 모델로 구조화합니다. 출력은 JSON만 허용되며, target_behaviors와 anti_behaviors는 허용된 category enum 배열이어야 합니다.',
    user: [
      '오늘의 목표:',
      options.goalText,
      '',
      'category enum: coding | writing | designing | reading | media | browsing | messaging | meeting | admin | other',
      '반환 형식: {"goal_text":"PRD 작성 2시간","target_behaviors":["writing"],"anti_behaviors":["media"],"success_metric":{"focused_minutes":120}}'
    ].join('\n')
  }
}
