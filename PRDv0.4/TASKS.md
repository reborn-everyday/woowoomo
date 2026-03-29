# TASKS.md — Ralphthon 실행 플랜

> **참조 순서**: 스코프 판단 → `PRD.md`, 코딩 규칙 → `AGENTS.md`, 실행 순서 → 이 파일
>
> **검증 원칙**: ZERO HUMAN INTERVENTION — 모든 QA는 agent가 직접 실행.
> Evidence 저장: `.sisyphus/evidence/task-{N}-{slug}.txt`

---

## PART 1 — 1시간 30분 구간 실행 스크립트 (사람이 직접)

> **이 구간의 목표**:
> 1) Wave 1을 안정적으로 완료하고  
> 2) Wave 2 → FINAL 자율 실행을 가능한 빨리 걸어두고  
> 3) T14 완료 후 Settings 페이지에서 API key를 입력한 뒤  
> 4) live Vision 저장 + seed 기반 report 생성까지 확인하는 것.
>
> Ralphthon에서는 **사람이 초반 1시간 30분 안에 agent가 혼자 달릴 수 있는 상태를 만들어 주는 것**이 핵심이다.
> 따라서 기존처럼 Wave 1~3 전체를 사람이 순차 확인하는 구조를 사용하지 않는다.

---

### 0:00 — 사전 수동 작업 (코드 실행 전)

**반드시 먼저 수행:**

1. 조코딩 라이브 녹화 영상을 YouTube에서 브라우저로 열어둠 (시연용 화면 준비)
2. macOS 시스템 환경설정 → 개인 정보 보호 → **화면 기록** → 앱 허용
3. macOS 시스템 환경설정 → 개인 정보 보호 → **손쉬운 사용** → 앱 허용
4. Anthropic Console에서 Claude API key 준비

> ⚠️ 이 수동 작업을 먼저 하지 않으면 T7, T8이 실행 중 막힌다.

---

### 0:05 — Opencode 시작 + Wave 1 실행

Opencode를 열고 아래 프롬프트를 입력:

```text
docs/PRD.md, AGENTS.md, TASKS.md 세 파일을 읽어.
읽은 후 TASKS.md의 Wave 1 태스크 T1~T6을 병렬로 실행해.
각 태스크 완료 시 TASKS.md의 QA 시나리오를 직접 실행하고 evidence를 저장해.
Wave 1이 끝나면 멈추고 보고해.
```

**확인 포인트:**
- T1 완료 → `pnpm build` 성공 확인
- T4 완료 → `sqlite_master`에 5개 테이블 존재 확인
- T5 완료 → ClaudeProvider가 AIProvider interface를 구현하는지 `pnpm tsc --noEmit` 확인

---

### 0:30 전후 — Wave 2 → FINAL 자율 실행 프롬프트 투입

Wave 1이 끝나면 바로 아래 프롬프트를 입력한다.

```text
Wave 1 완료를 확인했다.
지금부터 Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave FINAL 순서로 자율 실행해.

중요 규칙:
1. PRD에 없는 추가 기능은 구현하지 마.
2. T14가 완료되기 전에는 Settings/API key UI가 없다고 가정해.
3. T14 전까지는 mock provider, unit test, non-live 검증으로 진행 가능한 부분을 최대한 먼저 끝내.
4. T14 완료 후 Settings 페이지가 실제로 렌더링되면 반드시 정확히 `API_KEY_READY`라고만 출력하고 잠깐 멈춰.
5. 나는 그 시점에 Settings 페이지에서 API key를 입력할 것이다.
6. API key 입력 완료 후 내가 `API key 입력 완료. 계속 진행해.` 라고 보내면,
   live Vision 1회 저장 확인 → pnpm seed → generateDailyReport() → ReportWindow 렌더링 확인 →
   나머지 Wave 4/5/FINAL까지 계속 진행해.
7. 각 태스크 완료마다 QA 시나리오를 직접 실행하고 evidence를 저장해.
8. REJECT이 나오면 스스로 수정 후 재검증해. 나에게 묻지 말고 판단해서 진행해.
9. Wave FINAL의 F1~F4가 모두 APPROVE일 때만 완료를 보고해.
```

**왜 이렇게 바꾸는가:**
- Wave 3 범위는 T11~T14로 재정의했고, T15 ReportWindow는 Wave 4로 이동했다
- 기존 문서의 API key 입력 시점은 T1 직후로 되어 있었지만, 실제 UI는 T14 이후에야 생긴다
- Ralphthon에서는 1시간 30분 안에 agent가 장시간 자율 실행 가능한 상태로 넘어가는 것이 더 중요하다

---

### T14 완료 시 — API key 입력

Opencode가 `API_KEY_READY`를 출력하고 Settings 페이지가 보이면:

1. `pnpm dev` 또는 현재 실행 중인 앱에서 Settings 페이지를 연다
2. Claude API key를 입력한다 (safeStorage 저장)
3. 필요하면 스크린샷 간격을 데모 검증용으로 1분으로 조정한다
4. 아래 문장을 그대로 보낸다

```text
API key 입력 완료. 계속 진행해.
```

---

### 1:20 전후 — 필수 live 검증 확인

이 시점에 아래 3가지는 반드시 확인한다.

1. `screenshot_analyses` 테이블에 현재 설정된 캡처 주기 기준으로 live Vision 분석 row가 1개 이상 생겼는지
2. `pnpm seed` 실행 후 `daily_reports` row가 생성됐는지
3. 앱에서 ReportWindow가 실제로 렌더링되는지

**확인 포인트:**
- `category`, `focus_score` 필드가 null이 아닌지
- `focus_curve_data`, `tomorrow_nudges`, `bottlenecks`, `interrupted_tasks`가 비어 있지 않은지
- 목표가 있을 경우 `goal_alignment_score`가 표시되는지

> ⚠️ 이 검증이 되지 않으면 5시간 동안 UI만 돌아가고 핵심 시연 가치가 무너진다.

---

### 1:25 — 손 떼기

여기까지 됐으면 더 이상 세부 개입하지 않는다.

- 이후 5시간은 agent가 자율 진행
- ask가 뜨면 내용 검토 없이 승인만 한다
- 가재옷을 입지 않는 한 추가 지시하지 않는다

---

### 개입이 필요한 경우 (가재옷 착용 후)

| 상황 | 할 말 |
|------|-------|
| OpenClaw 스펙 공개 | "openclaw-bridge.ts를 이 스펙으로 교체해: [스펙]" |
| Wave FINAL REJECT 반복 | "REJECT 이유를 읽고 수정 후 재검증해" |
| 빌드 에러 멈춤 | "에러 로그 읽고 AGENTS.md 컨벤션 지키면서 수정해" |
| 1:15까지 `API_KEY_READY`가 안 뜸 | "T12~T14를 우선해 Settings 페이지부터 띄워. 그 다음 나머지 진행해." |

---

## PART 2 — 5시간 자율 실행 플랜 (AI Agent 전용)

> **이 파트는 Agent가 읽는다. 사람은 위의 PART 1만 보면 된다.**
>
> **검증 원칙**: ZERO HUMAN INTERVENTION — 모든 QA는 agent가 직접 실행.

---

## 실행 전략 요약

```text
Wave 1 (기반 — 모두 병렬, 의존성 없음):
  T1: 프로젝트 scaffold
  T2: Shared types + AIProvider interface + IPC 채널
  T3: Zod 스키마
  T4: SQLite schema + StoreService
  T5: ClaudeProvider (AIProvider 구현체)
  T6: Image processing utility

Wave 2 (캡처 파이프라인 — Wave 1 완료 후):
  T7: Window Watcher                                  [depends: T2, T4]
  T8: Screenshot Capture                              [depends: T2, T6]
  T9: Scheduler + skip-idle + auto-briefing          [depends: T2, T7, T8]
  T10: AI Pipeline (2-step)                           [depends: T3, T4, T5, T8]

Wave 3 (리포트 엔진 + 앱 껍데기 — Wave 2 완료 후):
  T11: 리포트 생성 서비스 + Gap Analysis             [depends: T4, T5]
  T12: Electron main + tray + IPC handlers           [depends: T2, T4, T5, T11]
  T13: React renderer shell                          [depends: T1]
  T14: Onboarding + Goal Input + Settings/API key UI [depends: T12, T13]

Wave 4 (Hero — 리포트 UI — Wave 3 완료 후):
  T15: ReportWindow + 섹션 레이아웃                  [depends: T11, T12, T13]
  T16: FocusCurveChart (Recharts)                    [depends: T15]
  T17: TomorrowNudge + BottleneckSolver + InterruptedTasks + GoalAlignmentReport [depends: T15]
  T18: MenuBarPopup (트레이 팝업)                    [depends: T12, T13]
  T19: Feedback (thumbs up/down)                     [depends: T15, T4]

Wave 5 (연동 + 안정화 — Wave 4 완료 후):
  T20: openclaw-bridge.ts
  T21: mock data seeder (seed.ts)
  T22: Error handling + graceful degradation
  T23: Preferences UI (intervals, retention, briefing time, API key)
  T24: Cleanup Service (retention enforcement)
  T25: 단위 테스트 (StoreService, AIProvider, Pipeline, Cleanup)
  T26: Integration smoke test

Wave FINAL (병렬 검증 — 전체 완료 후):
  F1: Plan compliance audit
  F2: Code quality (tsc + lint + test)
  F3: Manual QA (Playwright)
  F4: Scope fidelity check
  → 4개 모두 APPROVE 후 사용자에게 보고
```

**Critical Path**: T1 → T4 → T10 → T11 → T12/T13 → T14 → T15 → T16/T17 → T26 → F1-F4

---

## Wave 1 — 기반 (모두 병렬)

### T1. 프로젝트 Scaffold

**What**:
- `pnpm create @electron-vite` React + TypeScript 템플릿으로 초기화
- 디렉토리 구조: `src/main/`, `src/preload/`, `src/renderer/src/`, `src/shared/`, `src/main/providers/`
- 의존성 설치: `better-sqlite3`, `sharp`, `zod`, `recharts`, `@anthropic-ai/sdk`
- UI: `tailwindcss v4`, shadcn/ui 컴포넌트 CLI로 설치
- Vitest workspace config: jsdom (renderer), node (main)
- `electron-builder` macOS 패키징 설정

**Must NOT**:
- 애플리케이션 로직 추가 금지 (빈 shell만)
- CI/CD, 자동 업데이트 설정 금지

**QA**:
```text
1. pnpm install → exit 0
2. pnpm build → exit 0, 에러 없음
3. pnpm tsc --noEmit → exit 0
4. ls src/main src/preload src/renderer/src src/shared src/main/providers → 모두 존재
5. which record → record CLI 경로 출력 (사전 설치 전제: brew install atacan/tap/record)
```
Evidence: `task-1-scaffold-build.txt`

**Commit**: `chore: scaffold electron-vite project with React+TS+pnpm`

---

### T2. Shared Types + AIProvider Interface + IPC 채널

**What**:
- `src/shared/ipc-channels.ts` — PRD §4.6의 모든 IPC 채널명 `const` export
- `src/shared/types.ts` — 공용 TypeScript 인터페이스:
  - **`AIProvider` interface**
    ```typescript
    interface AIProvider {
      analyzeScreenshot(images: Buffer[]): Promise<VisionResponse[]>
      categorize(description: string): Promise<CategorizationResponse>
      structureGoal(goalText: string): Promise<GoalStructure>
      generateReport(data: DailyData): Promise<ReportPayload>
    }
    ```
  - `VisionResponse`: current_task, tool_in_video, category, focus_score, task_state, notes
  - `CategorizationResponse`: category (enum), tags (string array)
  - `GoalStructure`: goal_text, target_behaviors, anti_behaviors, success_metric
  - `DailyData`: goals, activity_events, screenshot_analyses, prev_report
  - `ReportPayload`: focus_curve, nudges, bottlenecks, interrupted_tasks, goal_alignment_score, deviation_patterns, why_analysis, how_suggestions
  - `ActivityEvent`, `ScreenshotAnalysis`, `DailyReport`, `Feedback`, `Goal`

**Must NOT**:
- 런타임 로직 금지 (타입 정의만)
- 특정 AI 모델명을 타입에 하드코딩 금지
- query 관련 타입 추가 금지

**QA**:
```text
1. pnpm tsc --noEmit → exit 0
2. grep "interface AIProvider" src/shared/types.ts → 존재
3. grep "analyzeScreenshot\|categorize\|structureGoal\|generateReport" src/shared/types.ts → 4개 모두 존재
4. grep "goals:save\|report:generate\|openclaw:delegate" src/shared/ipc-channels.ts → 모두 존재
```
Evidence: `task-2-types-compile.txt`

**Commit**: `feat(shared): AIProvider interface, IPC channels, shared types`

---

### T3. Zod 스키마

**What**:
- `src/shared/schemas/vision.ts`
- `src/shared/schemas/categorization.ts`
- `src/shared/schemas/goal.ts`
- `src/shared/schemas/report.ts`
- `src/shared/schemas/index.ts`

**Must NOT**:
- AI provider 특정 타입 import 금지 (provider-agnostic)
- query schema 추가 금지

**QA**:
```text
1. VisionSchema.parse(valid_example) → 성공
2. VisionSchema.parse({invalid: true}) → ZodError throw
3. CategorySchema.parse({category: "invalid"}) → ZodError throw
4. GoalSchema.parse({goal_text: "PRD 작성", target_behaviors: ["writing"]}) → 성공
5. ReportSchema.parse(valid_report) → 성공
```
Evidence: `task-3-zod-schemas.txt`

**Commit**: `feat(shared): Zod validation schemas`

---

### T4. SQLite Schema + StoreService

**What**:
- `src/main/db.ts` — StoreService class
- `src/main/migrations/001_init.sql`
- PRD §4.4의 5개 테이블 생성:
  - `activity_events`, `goals`, `screenshot_analyses`, `daily_reports`, `feedback`
- 각 테이블 CRUD: insert, getById, getByDateRange, update, delete
- `getLatestScreenshotAnalysis()`
- `getLatestActivityEvent()`

**Must NOT**:
- async 래퍼 금지
- renderer process에서 접근 금지
- raw SQL을 다른 파일에 두는 것 금지
- PRD에 없는 추가 테이블 생성 금지

**QA**:
```text
1. StoreService 인스턴스화 + runMigrations() 실행
2. sqlite_master 조회 → 5개 테이블 존재
3. PRAGMA journal_mode → "wal"
4. goals insert → getById 성공
5. getLatestScreenshotAnalysis() → 최신 row 반환
6. grep "fts" src/main/migrations/001_init.sql src/main/db.ts → 결과 없음
```
Evidence: `task-4-sqlite-schema.txt`

**Commit**: `feat(db): SQLite schema, migrations, StoreService`

---

### T5. ClaudeProvider (AIProvider 구현체)

**What**:
- `src/main/providers/claude.ts` — ClaudeProvider class
  - `analyzeScreenshot()`
  - `categorize()`
  - `structureGoal()`
  - `generateReport()`
- `src/main/prompts/`
  - `vision-analyze.ts`
  - `categorize.ts`
  - `goal-structure.ts`
  - `why-loop.ts`
  - `how-loop.ts`
  - `report-generate.ts`

**Must NOT**:
- `claude-analyzer.ts`에서 `ClaudeProvider` 직접 참조 금지 — `AIProvider` 인터페이스만 참조
- Vision + Categorization을 한 번의 API call로 합치기
- query-answer prompt 추가 금지

**QA**:
```text
1. analyzeScreenshot([유튜브 화면 이미지]) → tool_in_video 필드 포함
2. 영상 로딩 중 이미지 → focus_score: 0
3. categorize("VS Code에서 React 작업") → category: "coding"
4. structureGoal("PRD 작성 2시간") → target_behaviors에 "writing" 포함
5. invalid API key → 즉시 명확한 에러 throw
6. ClaudeProvider가 AIProvider interface를 완전히 구현하는지 tsc 검증
7. `src/main/providers/claude.ts`와 `src/shared/types.ts`에 AIProvider 4개 메서드만 남아 있는지 확인
```
Evidence: `task-5-claude-provider.txt`, `task-5-goal-structure.txt`

**Commit**: `feat(ai): ClaudeProvider implementing AIProvider interface + prompts`

---

### T6. Image Processing Utility

**What**:
- `src/main/utils/image.ts`
  - `processScreenshot()`
  - `saveScreenshotToTemp()`
  - `getScreenshotTempDir()`

**QA**:
```text
1. 2560x1440 → resize → 1280px wide, aspect ratio 유지
2. 640x480 → 그대로 (업스케일 금지)
3. 출력 파일 크기 < 500KB
4. magic bytes: 0xFF 0xD8 (JPEG)
```
Evidence: `task-6-image-resize.txt`

**Commit**: `feat(utils): image processing (JPEG 1280px)`

---

## Wave 2 — 캡처 파이프라인

### T7. Window Watcher Service

**What**:
- `src/main/activity-tracker.ts` — WindowWatcher class

**QA**:
```text
1. 1초 간격 3초 실행 → activity_events에 ≥2 rows
2. pause() → row 수 변화 없음
3. resume() → row 수 증가
4. 타이틀 변화 시 → 새 activity_event 기록
```
Evidence: `task-7-watcher-polling.txt`

**Commit**: `feat(capture): window watcher`

---

### T8. Screenshot Capture Service (`record` CLI wrapper)

**What**:
- `src/main/screen-capture.ts` — ScreenshotCapture class
  - `record` CLI를 `child_process.execFile`로 호출하여 스크린샷 캡처
  - `listDisplays()`: `record screen --list-displays --json` 실행 → 디스플레이 목록 반환
  - `captureDisplay(displayId)`: `record screen --screenshot --display <id> --output <path> --json` 실행 → PNG 파일 경로 반환
  - `captureAllDisplays()`: 전체 디스플레이 순회 캡처 → `sharp`로 JPEG 1280px 리사이즈 후 반환
  - `checkRecordInstalled()`: `record --help` 실행으로 CLI 설치 확인
  - 10초 타임아웃 적용
  - Electron `desktopCapturer` 사용 금지

**Must NOT**:
- `desktopCapturer` import 또는 사용 금지
- `record` CLI 없이 직접 캡처 금지

**QA**:
```text
1. checkRecordInstalled() → true (미설치 시 명확한 에러 메시지)
2. listDisplays() → 디스플레이 목록 (1개 이상)
3. captureAllDisplays() → 비어있지 않은 array
4. 각 item: displayId + image Buffer
5. image: JPEG magic bytes, width ≤ 1280px
6. grep "desktopCapturer" src/main/screen-capture.ts → 결과 없음
```
Evidence: `task-8-capture-displays.txt`

**Commit**: `feat(capture): screenshot capture via record CLI`

---

### T9. Scheduler + Skip-Idle + Auto-Briefing

**What**:
- `src/main/scheduler.ts` — Scheduler class
  - 스크린샷 루프는 하드코딩된 5분이 아니라 `prefs` / `config`의 스크린샷 간격 값을 사용
  - 기본값은 5분이지만 데모/검증 시 1~15분 범위 내에서 변경 가능

**QA**:
```text
1. poll=1s, snapshot=3s, 5초 실행 → watcher ≥4번, capture ≥1번
2. snapshot 값을 변경하면 다음 루프부터 새 설정이 반영되는지 확인
3. 동일 타이틀 3회 연속 → capture 호출 안 됨
4. stop() → 두 루프 모두 중단
5. briefingTime 도달 mock → generateDailyReport() 자동 호출 확인
6. 트레이 알림 표시 확인
```
Evidence: `task-9-scheduler.txt`, `task-9-skip-idle.txt`, `task-9-auto-briefing.txt`

**Commit**: `feat(capture): scheduler + skip-idle + auto-briefing`

---

### T10. AI Pipeline (2-step Vision → Store)

**What**:
- `src/main/claude-analyzer.ts` — AIPipeline class
  - Step 1: `aiProvider.analyzeScreenshot()`
  - Step 2: `aiProvider.categorize()`
  - category 변화 감지 시 activity_events 기록
  - `screenshot_analyses` insert

**Must NOT**:
- Vision + Categorization 한 번에 합치기 절대 금지
- `ClaudeProvider` 직접 import 금지
- Zod 검증 없이 저장 금지

**QA**:
```text
1. processScreenshots([{displayId: "main", image: buf}]) → screenshot_analyses에 1 row
2. category 변화 감지 → activity_events에 context switch 기록
3. mock AIProvider로 테스트 가능
```
Evidence: `task-10-pipeline.txt`, `task-10-context-switch.txt`

**Commit**: `feat(pipeline): Vision→Categorization 2-step via AIProvider`

---

## Wave 3 — 리포트 엔진 + 앱 껍데기

### T11. 리포트 생성 서비스 + Gap Analysis

**What**:
- `src/main/claude-analyzer.ts`에 `generateDailyReport(date: string)` 추가
- 목표 있을 때 Goal Modeling / Gap Analysis 수행
- 목표 없을 때 4개 섹션만 생성

**QA**:
```text
1. 목표 있는 경우 → goal_alignment_score 0.0~1.0
2. 목표 없는 경우 → goal_alignment_score: null, 4개 섹션 정상 생성
```
Evidence: `task-11-report.txt`, `task-11-gap-analysis.txt`

**Commit**: `feat(report): daily report generation + goal gap analysis`

---

### T12. Electron Main + Tray + IPC Handlers

**What**:
- `src/main/ipc-handlers.ts`
  - `collect:start/stop/state`
  - `goals:save`
  - `goals:get`
  - `report:generate`
  - `report:get`
  - `today:summary`
  - `prefs:read/write`
  - `feedback:submit`
  - `openclaw:delegate`
- Tray 아이콘
- `preload.ts` — `window.electronAPI` 노출

**Must NOT**:
- renderer에서 `electron` 직접 import 금지

**QA**:
```text
1. 앱 실행 → tray 아이콘 표시
2. goals:save IPC → structureGoal() 호출 + goals 저장
3. collect:start IPC → scheduler.start() 호출
4. window.electronAPI 객체 renderer에서 접근 가능
```
Evidence: `task-12-tray.txt`, `task-12-ipc.txt`

**Commit**: `feat(shell): Electron main, tray, IPC handlers`

---

### T13. React Renderer Shell

**What**:
- `src/renderer/` React 앱 기본 구조
- React Router 설정: `/report`, `/settings`
- shadcn/ui + Tailwind 테마
- `window.electronAPI` 타입 선언

**QA**:
```text
1. pnpm build → exit 0
2. 라우트 렌더링 → 에러 없음
3. shadcn/ui Button 렌더링 → 정상
```
Evidence: `task-13-renderer.txt`

**Commit**: `feat(shell): React renderer shell`

---

### T14. Onboarding + Goal Input + Settings/API key UI

**What**:
- 앱 실행 시마다 Screen Recording + Accessibility 권한 확인
- `src/renderer/pages/settings.tsx` — API key 입력/저장 (safeStorage)
- `src/renderer/components/GoalInput.tsx`
- **이 태스크 완료 시점부터만 사람이 API key를 UI에 입력할 수 있다**

**QA**:
```text
1. 앱 실행 → 권한 체크
2. 권한 없을 경우 → 다이얼로그 표시
3. Settings 페이지에서 API key 입력 → safeStorage 저장
4. 목표 "코딩 2시간" 입력 → goals 저장 + target_behaviors 구조화 확인
5. 목표 미입력 → 앱 정상 동작
6. Settings 페이지가 실제 렌더링되면 `API_KEY_READY` 출력
```
Evidence: `task-14-onboarding.txt`, `task-14-goal-input.txt`, `task-14-settings-api-key.txt`

**Commit**: `feat(onboarding): permissions + settings api key + goal input UI`

---

## Wave 4 — Hero Feature (리포트 UI)

### T15. ReportWindow + 섹션 레이아웃

**What**:
- `src/renderer/components/ReportWindow.tsx`
  - 목표 없을 때: 4개 섹션
  - 목표 있을 때: 5개 섹션
  - "리포트 생성" 버튼
  - 로딩 상태 / 에러 상태

**QA**:
```text
1. "리포트 생성" 클릭 → spinner 표시
2. 리포트 데이터 수신 → 섹션 렌더링
3. 에러 상태 → fallback 카드
```
Evidence: `task-15-report-window.txt`

**Commit**: `feat(ui): ReportWindow layout`

---

### T16. FocusCurveChart (Recharts)

**What**:
- `src/renderer/components/FocusCurveChart.tsx`

**QA**:
```text
1. mock focus_curve_data → 차트 표시
2. ResponsiveContainer 정상 동작
3. 데이터 없음 → 빈 상태
```
Evidence: `task-16-focus-curve.txt`

**Commit**: `feat(ui): FocusCurveChart`

---

### T17. TomorrowNudge + BottleneckSolver + InterruptedTasks + GoalAlignmentReport

**What**:
- `TomorrowNudge.tsx`
- `BottleneckSolver.tsx`
- `InterruptedTasks.tsx`
- `GoalAlignmentReport.tsx`

**QA**:
```text
1. mock nudges 3개 → 카드 3개 렌더링
2. "OpenClaw에 위임" 클릭 → IPC 호출 + "위임됨" 상태 변경
3. InterruptedTasks → 체크 토글 동작
4. 목표 없음 → GoalAlignmentReport 안내 표시
5. alignment_score 0.61 → 61% 표시
```
Evidence: `task-17-nudge.txt`, `task-17-bottleneck.txt`, `task-17-interrupted.txt`, `task-17-goal-alignment.txt`

**Commit**: `feat(ui): TomorrowNudge, BottleneckSolver, InterruptedTasks, GoalAlignmentReport`

---

### T18. MenuBarPopup

**What**:
- `src/renderer/components/MenuBarPopup.tsx`

**QA**:
```text
1. 팝업 열기 → 오늘 요약 표시
2. 토글 → collect:start/stop IPC 호출
3. "리포트 생성" → ReportWindow 열림
```
Evidence: `task-18-menubar.txt`

**Commit**: `feat(ui): MenuBarPopup`

---

### T19. Feedback (thumbs up/down)

**What**:
- 각 리포트 섹션 하단에 선택형 thumbs up / thumbs down
- `feedback` 테이블에 저장

**QA**:
```text
1. thumbs up 클릭 → feedback insert
2. 다시 클릭 → 취소 또는 변경
3. UI 상태 반영
```
Evidence: `task-19-feedback.txt`

**Commit**: `feat(ui): feedback thumbs up/down`

---

## Wave 5 — 연동 + 안정화

### T20. OpenClaw Bridge

**What**:
- `src/main/openclaw-bridge.ts`

**QA**:
```text
1. delegateToOpenClaw({title: "test"}) → success: true
2. CLI/API 없을 시 → 시뮬레이션 응답
```
Evidence: `task-20-openclaw.txt`

**Commit**: `feat(openclaw): OpenClaw bridge`

---

### T21. Mock Data Seeder

**What**:
- `scripts/seed.ts`
- 조코딩 라이브 영상 시청 패턴 1시간 분량 mock 데이터 생성

**QA**:
```text
1. pnpm seed → exit 0
2. screenshot_analyses → 12 rows
3. activity_events → context switch 기록 포함
4. goals → 1 row
5. generateDailyReport() → 5개 섹션 모두 비어있지 않음
```
Evidence: `task-21-seed.txt`

**Commit**: `feat(scripts): mock data seeder`

---

### T22. Error Handling + Graceful Degradation

**What**:
- 모든 async 함수 try/catch 보강
- AI API 오류 → fallback 카드
- DB 오류 → DatabaseError 래핑
- 권한 거부 → 안내 다이얼로그

**QA**:
```text
1. API key 없이 리포트 생성 → fallback 카드
2. DB 파일 삭제 후 실행 → 재생성
3. 권한 없이 실행 → 안내 다이얼로그
```
Evidence: `task-22-error-handling.txt`

**Commit**: `fix(resilience): error handling + graceful degradation`

---

### T23. Preferences UI

**What**:
- `src/renderer/pages/settings.tsx` 확장
  - 스크린샷 간격 (기본 5분, 범위 1~15분)
  - Window Watcher 폴링
  - Auto-briefing 시각
  - 보관 기간
  - API key 관리
- 저장 시 scheduler에 즉시 반영
- 스크린샷 캡처 주기는 fixed constant가 아니라 사용자 설정값으로 유지

**QA**:
```text
1. 스크린샷 간격 변경 → scheduler.config 업데이트
2. 스크린샷 간격 1분↔5분 변경 시 다음 캡처 루프에 반영
3. briefingTime 변경 → 다음 auto-briefing 시각 변경
4. API key 변경 → safeStorage 저장
5. 앱 재시작 후 설정 유지
```
Evidence: `task-23-preferences.txt`

**Commit**: `feat(prefs): Preferences UI (intervals, retention, briefing time, API key)`

---

### T24. Cleanup Service

**What**:
- `src/main/cleanup.ts` — CleanupService class
- 보관 기간 초과 데이터 삭제
- `daily_reports`는 영구 보관

**QA**:
```text
1. 31일 전 screenshot_analyses 10개 insert → retention 30일 → 삭제
2. 실제 파일 삭제 확인
3. daily_reports는 삭제 안 됨
4. 앱 시작 시 자동 실행 확인
```
Evidence: `task-24-cleanup.txt`

**Commit**: `feat(cleanup): retention enforcement + file pruning`

---

### T25. 단위 테스트

**What**:
- `src/main/db.test.ts`
- `src/main/providers/claude.test.ts`
- `src/main/cleanup.test.ts`
- `src/main/scheduler.test.ts`
- `src/main/claude-analyzer.test.ts`

**QA**:
```text
1. pnpm test → 모든 테스트 pass
2. pnpm tsc --noEmit → 0 errors
3. ClaudeProvider가 AIProvider를 완전히 구현하는지 타입 체크
4. grep "query" src/main/*.test.ts src/test/**/*.ts → 결과 없음
```
Evidence: `task-25-unit-tests.txt`

**Commit**: `test: unit tests (DB, AIProvider, pipeline, cleanup, scheduler)`

---

### T26. Integration Smoke Test

**What**:
- `src/test/integration/smoke.test.ts`
  - mock 스크린샷 → pipeline → DB 저장
  - 리포트 생성
  - Goal + Gap Analysis
  - Cleanup 검증
  - 실행 시간 < 30초

**QA**:
```text
1. pnpm test -- --run src/test/integration/smoke.test.ts → exit 0
2. ≥5 테스트 pass
3. 실행 시간 < 30초
4. mock AIProvider 교체 → 동일 파이프라인 동작
```
Evidence: `task-26-smoke-test.txt`

**Commit**: `test(integration): full pipeline smoke test`

---

## Wave FINAL — 검증 (4개 병렬)

### F1. Plan Compliance Audit

PRD의 모든 Acceptance Criteria 항목에 대해:
- 구현 파일 실제 존재 확인
- AIProvider 인터페이스 구현 확인
- PRD §3.2 제외 기능이 코드베이스에 없음 확인

출력: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

---

### F2. Code Quality Review

```bash
pnpm tsc --noEmit
pnpm lint
pnpm test
```

추가 확인:
- `as any`
- `@ts-ignore`
- ClaudeProvider 직접 참조
- Vision+Categorization 합치기

출력: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass] | VERDICT`

---

### F3. Real Manual QA (Playwright)

1. 앱 실행 → tray 아이콘
2. 목표 입력 "코딩 2시간" → 구조화 확인
3. Settings 페이지에서 API key 입력 확인
4. `pnpm seed` → mock 데이터 주입
5. "리포트 생성" → 5개 섹션 렌더링 확인
6. Focus Curve 차트 확인
7. Goal Alignment: alignment_score + deviation_patterns 확인
8. Tomorrow's Nudge 3개 확인
9. Bottleneck "OpenClaw에 위임" → "위임됨" 상태 변경
10. Interrupted Tasks 체크 토글
11. thumbs up → feedback 저장

출력: `Scenarios [N/N pass] | VERDICT`

---

### F4. Scope Fidelity Check

- 각 태스크 명세 vs 실제 구현 1:1 확인
- PRD §3.2 제외 기능이 구현되지 않았음 확인
- `AIProvider` 인터페이스 없이 모델 직접 참조하는 곳 없음 확인
- Wave 3 범위가 T11~T14인지 확인
- T15가 ReportWindow인지 확인

출력: `Tasks [N/N compliant] | Scope [CLEAN/issues] | VERDICT`

---

> **Wave FINAL 완료 후**: 4개 모두 APPROVE 시 사용자에게 결과 보고.
> 하나라도 REJECT이면 해당 문제 수정 후 재검증.
> **사용자 명시적 확인 전까지 "완료" 선언 금지.**

---

## 커밋 전략

| 태스크 | 커밋 메시지 |
|--------|------------|
| T1 | `chore: scaffold electron-vite project` |
| T2, T3 | `feat(shared): AIProvider interface, IPC channels, Zod schemas` |
| T4 | `feat(db): SQLite schema, StoreService` |
| T5, T6 | `feat(ai): ClaudeProvider + AIProvider interface + prompts + image util` |
| T7, T8, T9 | `feat(capture): watcher, screenshot, scheduler` |
| T10 | `feat(pipeline): Vision→Categorization 2-step via AIProvider` |
| T11 | `feat(report): daily report + goal gap analysis` |
| T12, T13, T14 | `feat(shell): Electron main, tray, React shell, onboarding, settings, goal input` |
| T15 | `feat(ui): ReportWindow layout` |
| T16 | `feat(ui): FocusCurveChart` |
| T17 | `feat(ui): TomorrowNudge, BottleneckSolver, InterruptedTasks, GoalAlignmentReport` |
| T18 | `feat(ui): MenuBarPopup` |
| T19 | `feat(ui): feedback thumbs up/down` |
| T20 | `feat(openclaw): OpenClaw bridge` |
| T21 | `feat(scripts): mock data seeder` |
| T22 | `fix(resilience): error handling` |
| T23 | `feat(prefs): Preferences UI (intervals, retention, briefing time, API key)` |
| T24 | `feat(cleanup): retention enforcement + file pruning` |
| T25 | `test: unit tests (DB, AIProvider, pipeline, cleanup, scheduler)` |
| T26 | `test(integration): smoke test` |
