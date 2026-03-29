export interface ReportGeneratePromptOptions {
  includeGoalSection: boolean
  serializedDailyData: string
}

export function buildReportGeneratePrompt(
  options: ReportGeneratePromptOptions
): { system: string; user: string } {
  return {
    system:
      '당신은 하루 마감 인사이트 리포트를 생성합니다. 4개 고정 섹션(focus curve, tomorrow nudges, bottlenecks, interrupted tasks)을 반드시 채우고, 목표가 있으면 goal alignment 관련 필드도 채우세요. 설명 없이 JSON만 반환하세요.',
    user: [
      `목표 섹션 포함 여부: ${options.includeGoalSection ? 'yes' : 'no'}`,
      '입력 데이터(JSON):',
      options.serializedDailyData,
      '',
      '반드시 아래 JSON shape와 item field 이름을 그대로 지키세요:',
      '{',
      '  "focus_curve": [{"time":"09:00","score":82}],',
      '  "nudges": [{"when":"09:00-11:00","what":"deep work를 배치하세요","why":"오늘 이 시간대 집중도가 높았습니다"}],',
      '  "bottlenecks": [{"bottleneck":"검색 후 소비형 브라우징으로 전이","recommendation":"검색 시간을 10분으로 제한하세요","delegate_prompt":null}],',
      '  "interrupted_tasks": [{"task":"README 초안 작성","interrupted_at":"14:23","context":"Slack 전환 직후 중단","suggested_next_step":"초안 한 문단부터 재개"}],',
      '  "goal_alignment_score": null,',
      '  "deviation_patterns": [],',
      '  "why_analysis": [],',
      '  "how_suggestions": []',
      '}'
    ].join('\n')
  }
}
