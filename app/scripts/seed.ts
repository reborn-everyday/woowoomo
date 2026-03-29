import { StoreService, type ActivityCategory } from '../src/main/db'

const DEFAULT_GOAL_TEXT = '코딩 2시간 집중하기'

interface SeedOptions {
  date: string
  dbPath: string | undefined
}

interface SeedCounts {
  goals: number
  activityEvents: number
  screenshotAnalyses: number
  dailyReports: number
}

interface SeedResult {
  date: string
  start: string
  end: string
  counts: SeedCounts
}

interface SeedScreenshotFixture {
  minuteOffset: number
  category: ActivityCategory
  focusScore: number
  appName: string
  toolInVideo: 'VS Code' | 'Browser' | 'Terminal'
  tags: string[]
  taskState: 'starting' | 'in_progress' | 'switching' | 'explaining'
  task: string
}

function toLocalDateString(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseArgs(argv: string[]): SeedOptions {
  let date: string | undefined
  let dbPath: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--date') {
      date = argv[index + 1]
      index += 1
      continue
    }

    if (token === '--db-path') {
      dbPath = argv[index + 1]
      index += 1
    }
  }

  const resolvedDate = date ?? toLocalDateString(new Date())

  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
    throw new Error('Seed date must use YYYY-MM-DD format. Example: --date 2026-03-29')
  }

  return {
    date: resolvedDate,
    dbPath
  }
}

function getDayBounds(date: string): { start: string; end: string } {
  const [yearText, monthText, dayText] = date.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const start = new Date(year, month - 1, day, 9, 0, 0, 0)
  const end = new Date(year, month - 1, day, 9, 59, 59, 999)

  return {
    start: start.toISOString(),
    end: end.toISOString()
  }
}

function getScreenshotFixtures(): SeedScreenshotFixture[] {
  return [
    {
      minuteOffset: 0,
      category: 'coding',
      focusScore: 82,
      appName: 'Visual Studio Code',
      toolInVideo: 'VS Code',
      tags: ['react', 'feature'],
      taskState: 'starting',
      task: 'ReportWindow 상태 흐름 점검'
    },
    {
      minuteOffset: 5,
      category: 'coding',
      focusScore: 87,
      appName: 'Visual Studio Code',
      toolInVideo: 'VS Code',
      tags: ['typescript', 'ipc'],
      taskState: 'in_progress',
      task: 'IPC handler 경로 확인'
    },
    {
      minuteOffset: 10,
      category: 'browsing',
      focusScore: 58,
      appName: 'Google Chrome',
      toolInVideo: 'Browser',
      tags: ['docs', 'research'],
      taskState: 'switching',
      task: '문서 참고 탭 탐색'
    },
    {
      minuteOffset: 15,
      category: 'coding',
      focusScore: 90,
      appName: 'Visual Studio Code',
      toolInVideo: 'VS Code',
      tags: ['tests', 'vitest'],
      taskState: 'in_progress',
      task: 'scheduler 테스트 보강'
    },
    {
      minuteOffset: 20,
      category: 'reading',
      focusScore: 61,
      appName: 'Google Chrome',
      toolInVideo: 'Browser',
      tags: ['spec', 'acceptance'],
      taskState: 'explaining',
      task: 'TASKS.md acceptance 재확인'
    },
    {
      minuteOffset: 25,
      category: 'coding',
      focusScore: 86,
      appName: 'Visual Studio Code',
      toolInVideo: 'VS Code',
      tags: ['db', 'seed'],
      taskState: 'in_progress',
      task: 'deterministic seeder 작성'
    },
    {
      minuteOffset: 30,
      category: 'messaging',
      focusScore: 44,
      appName: 'Slack',
      toolInVideo: 'Browser',
      tags: ['sync', 'status'],
      taskState: 'switching',
      task: '진행 상황 공유'
    },
    {
      minuteOffset: 35,
      category: 'coding',
      focusScore: 88,
      appName: 'Visual Studio Code',
      toolInVideo: 'VS Code',
      tags: ['tray', 'main-process'],
      taskState: 'in_progress',
      task: 'Tray 연결 마무리'
    },
    {
      minuteOffset: 40,
      category: 'meeting',
      focusScore: 49,
      appName: 'Google Meet',
      toolInVideo: 'Browser',
      tags: ['review'],
      taskState: 'explaining',
      task: '짧은 리뷰 미팅'
    },
    {
      minuteOffset: 45,
      category: 'coding',
      focusScore: 91,
      appName: 'Visual Studio Code',
      toolInVideo: 'VS Code',
      tags: ['integration', 'smoke-test'],
      taskState: 'in_progress',
      task: 'integration smoke test 작성'
    },
    {
      minuteOffset: 50,
      category: 'admin',
      focusScore: 55,
      appName: 'Terminal',
      toolInVideo: 'Terminal',
      tags: ['pnpm', 'verification'],
      taskState: 'switching',
      task: '검증 명령 실행'
    },
    {
      minuteOffset: 55,
      category: 'coding',
      focusScore: 84,
      appName: 'Visual Studio Code',
      toolInVideo: 'VS Code',
      tags: ['report', 'polish'],
      taskState: 'in_progress',
      task: '리포트 데이터 점검'
    }
  ]
}

function clearSeedWindow(storeService: StoreService, date: string, start: string, end: string): void {
  for (const goal of storeService.getGoalsByDateRange(date, date)) {
    storeService.deleteGoal(goal.id)
  }

  for (const activityEvent of storeService.getActivityEventsByDateRange(start, end)) {
    storeService.deleteActivityEvent(activityEvent.id)
  }

  for (const analysis of storeService.getScreenshotAnalysesByDateRange(start, end)) {
    storeService.deleteScreenshotAnalysis(analysis.id)
  }

  for (const report of storeService.getDailyReportsByDateRange(date, date)) {
    storeService.deleteDailyReport(report.id)
  }
}

function toIsoAtMinute(date: string, minuteOffset: number): string {
  const [yearText, monthText, dayText] = date.split('-')
  const value = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 9, minuteOffset, 0, 0)

  return value.toISOString()
}

function insertSeedData(storeService: StoreService, date: string): SeedCounts {
  const fixtures = getScreenshotFixtures()
  const createdAt = toIsoAtMinute(date, 0)

  storeService.insertGoal({
    date,
    goal_text: DEFAULT_GOAL_TEXT,
    target_behaviors: ['coding', 'writing'],
    anti_behaviors: ['media', 'browsing'],
    success_metric: { focused_minutes: 120 },
    created_at: createdAt
  })

  for (const fixture of fixtures) {
    const timestamp = toIsoAtMinute(date, fixture.minuteOffset)

    storeService.insertActivityEvent({
      timestamp,
      app_name: fixture.appName,
      window_title: fixture.task,
      category: fixture.category,
      duration_sec: 300
    })

    storeService.insertScreenshotAnalysis({
      timestamp,
      screenshot_path: `/tmp/seed-${fixture.minuteOffset}.jpg`,
      application: fixture.appName,
      description: fixture.task,
      category: fixture.category,
      tags: fixture.tags,
      focus_score: fixture.focusScore,
      task_state: fixture.taskState,
      tool_in_video: fixture.toolInVideo,
      full_response: JSON.stringify({
        source: 'seed',
        task: fixture.task,
        tags: fixture.tags
      }),
      display_id: 1
    })
  }

  storeService.insertDailyReport({
    date,
    focus_curve_data: [
      { time: '09:00', score: 82 },
      { time: '09:10', score: 58 },
      { time: '09:20', score: 86 },
      { time: '09:30', score: 44 },
      { time: '09:40', score: 91 },
      { time: '09:50', score: 84 }
    ],
    tomorrow_nudges: [
      { when: '09:00', what: '핵심 구현 50분 먼저 진행', why: '집중 점수 최고 구간이 오전 초반에 나타남' },
      { when: '10:30', what: '문서 탐색은 15분 제한', why: '탐색 길어지면 coding 흐름이 끊김' },
      { when: '14:00', what: '중단 작업 먼저 재시작', why: '오후 재개 지연이 누적됨' }
    ],
    bottlenecks: [
      {
        bottleneck: '브라우저 문서 탐색 시간이 길어짐',
        recommendation: '탐색용 타이머를 15분으로 제한하고 바로 구현으로 복귀',
        delegate_prompt: '문서 요약 후 구현 체크리스트 3개로 압축해줘.'
      },
      {
        bottleneck: '리뷰/메시징 전환이 잦음',
        recommendation: '메시징 확인 시간을 정시 1회로 고정',
        delegate_prompt: '메시지 확인 루틴을 1시간 단위로 제안해줘.'
      }
    ],
    interrupted_tasks: [
      {
        task: 'scheduler 테스트 보강',
        interrupted_at: '09:30',
        context: '메시지 응답으로 중단',
        suggested_next_step: 'skip-idle branch assertion부터 다시 실행'
      },
      {
        task: 'integration smoke test 작성',
        interrupted_at: '09:40',
        context: '리뷰 미팅으로 전환',
        suggested_next_step: 'pipeline→report→cleanup 순서로 단일 시나리오 고정'
      }
    ],
    goal_alignment_score: 0.67,
    deviation_patterns: ['문서 탐색이 15분 이상 길어질 때 coding 점수 급락', '메시징 직후 재집중까지 평균 10분 필요'],
    why_analysis: ['정보 탐색 단계의 종료 기준이 모호해서 전환 타이밍이 늦어짐'],
    how_suggestions: ['탐색 시작 시 종료 기준 1개를 먼저 정의', '중단 후 재시작 체크리스트를 task 카드에 고정'],
    summary: '1시간 동안 coding 중심 흐름을 유지했지만 탐색/메시징 전환 구간에서 집중 하락이 확인되었습니다.'
  })

  return {
    goals: 1,
    activityEvents: fixtures.length,
    screenshotAnalyses: fixtures.length,
    dailyReports: 1
  }
}

function runSeed(options: SeedOptions): SeedResult {
  const storeService = new StoreService({ dbPath: options.dbPath })

  try {
    storeService.runMigrations()

    const { start, end } = getDayBounds(options.date)

    clearSeedWindow(storeService, options.date, start, end)
    const counts = insertSeedData(storeService, options.date)

    return {
      date: options.date,
      start,
      end,
      counts
    }
  } finally {
    storeService.close()
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const result = runSeed(options)

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        seededDate: result.date,
        window: {
          start: result.start,
          end: result.end
        },
        counts: result.counts
      },
      null,
      2
    )
  )
}

main()
