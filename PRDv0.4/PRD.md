# PRD — 우리는 우리를 모른다 (We Don't Know Ourselves)

> **Source of Truth.**
> AI Agents는 스코프·동작 결정 전 반드시 이 파일을 먼저 참조한다.
> 코딩 규칙은 `AGENTS.md`, 실행 태스크는 `TASKS.md` 참조.

---

## 0. 핵심 문제 (팀 공통 정의)

> **사람은 자신이 무엇을 했는지, 왜 그런 선택을 했는지, 목표대로 살고 있는지를 스스로 정확히 인식하지 못한다.**

결과적으로 반복되는 현상:
- 비효율적인 행동과 후회하는 결정을 반복한다
- 집중이 깨지는 패턴을 모르고 같은 하루를 반복한다
- 목표를 세우지만 실제 행동은 이를 따르지 않는다
- 시작했지만 끝내지 못한 작업이 쌓인다
- 반복 병목을 스스로 인식하지 못한다

---

## 1. 해결책 (팀 공통 정의)

> **화면 기록을 AI가 자동 분석해 사용자가 몰랐던 패턴을 발견하고, 더 나은 선택을 대신 제안한다.**

**관찰 → 해석 → 판단 → 제안** 흐름으로 동작하는 의사결정 대리 도구.

AI가 행동 데이터에서 목표와 패턴을 스스로 추론한다. 목표는 선택적으로 직접 입력할 수도 있다.

---

## 2. 제품 정의

macOS 데스크톱 앱 (Electron + React):
화면 활동을 백그라운드에서 자동 기록 → Claude AI가 분석 → 하루 마감 인사이트 리포트 생성

핵심 가치: 단순 요약이 아니라 **의사결정 대리** — AI가 다음 행동을 판단해서 제안한다.

### 입력 소스 (Dual-Input)

두 가지 입력 모드를 지원한다. 분석 파이프라인은 동일하다.

| 모드 | 입력 | 캡처 방식 | Window Watcher |
|------|------|----------|----------------|
| **Live Capture** | 사용자의 실시간 데스크톱 화면 | `record screen --screenshot` (설정 주기마다) | 활성 |
| **Video File** | 녹화된 영상 파일 (.mp4, .mov 등) | `ffmpeg`로 설정 주기 간격마다 프레임 추출 | 비활성 (영상에서 추출 불가) |

**Video File 모드 동작:**
1. 사용자가 영상 파일을 드래그앤드롭 또는 파일 선택으로 로드
2. `ffmpeg`로 영상 길이 조회 (`ffprobe`)
3. 설정된 스크린샷 주기(기본 5분)에 맞춰 프레임 추출: `ffmpeg -i video.mp4 -vf "fps=1/<interval_sec>" frame_%04d.png`
4. 추출된 프레임을 동일한 Vision 분석 파이프라인에 투입
5. 타임스탬프는 영상 내 시간 기준으로 생성 (0:00:00부터)
6. 모든 프레임 처리 완료 후 자동으로 리포트 생성 가능

---

## 2-1. 데모 환경 정의 (Ralphthon 전용)

> **이 섹션은 Ralphthon 시연 전용이다. AI Agents는 아래 환경을 전제로 구현해야 한다.**

### 데모 화면 구성
- 시연 화면: **유튜버 조코딩의 라이브 녹화 영상** (YouTube)을 브라우저에 띄워둠
- Screen Recording 대상: 해당 브라우저 화면 전체
- 분석 대상: **영상 안에서 조코딩이 어떤 작업을 하고 있는지**

### 데이터 소스 전략

Window Watcher는 앱 이름("Chrome")은 고정이지만 **탭 전환 시 윈도우 타이틀이 변한다.** Chrome 내 탭 전환은 Window Watcher로 감지 가능하다. 단, 영상 탭에서 벗어나지 않는 구간의 **영상 안 작업 전환**은 Vision으로 보완한다.

| 상황 | 감지 방법 |
|------|----------|
| Chrome 탭 전환 (YouTube → Stack Overflow 등) | Window Watcher 윈도우 타이틀 변화 |
| 영상 안에서 VS Code → Browser 전환 | Vision category 변화 |
| 영상 안에서 작업 중단 패턴 | Vision task_state 변화 |
| 집중도 측정 | Vision focus_score |

---

## 3. MVP 범위 (Ralphthon 시연 기준)

### 3.1 포함 기능

#### A. 백그라운드 행동 관찰

- **앱 활동 추적 (Window Watcher)**: 30초마다 현재 포커스 앱 이름 + 윈도우 타이틀 기록
  - 탭 전환 시 윈도우 타이틀 변화 → context switching 감지
  - 예: "조코딩 - YouTube" → "Stack Overflow - useEffect" → "GitHub - my-repo"
  - **Video File 모드에서는 비활성** (영상에서 앱 타이틀 추출 불가)
- **스크린샷/프레임 분석 (Vision)**: 설정 가능한 주기(기본 5분, 범위 1~15분)마다 이미지 → Claude Vision 분석
  - **Live Capture 모드**: `record` CLI 사용 (`record screen --screenshot`). Electron `desktopCapturer` 직접 사용 금지
  - **Video File 모드**: `ffmpeg`로 프레임 추출 (`ffmpeg -i video.mp4 -vf "fps=1/<interval_sec>" frame_%04d.png`)
  - 캡처/추출 형식: PNG → sharp로 JPEG 1280px 리사이즈 후 Vision API 전송
  - **멀티모니터** (Live만 해당): `record screen --list-displays --json`으로 디스플레이 목록 조회 → 각 디스플레이 별도 캡처
  - **2-step pipeline 필수**: Step1 Vision 설명 → Step2 별도 Categorization call (절대 합치지 않음)
  - **데모 환경**: 브라우저 화면이 아니라 **영상 안의 조코딩 화면** 분석
  - 카테고리 enum: `coding | writing | designing | reading | media | browsing | messaging | meeting | admin | other`
  - 2-3장 배치 처리로 API 비용 절감 (batch reads)
- **Context Switching 감지**:
  - Live 모드: Window Watcher 타이틀 변화 + Vision category 변화 (이중 소스)
  - Video 모드: Vision category 변화만 (단일 소스)
  - 둘 다 activity_events에 기록
- **미완성 작업 감지**: Vision task_state 변화로 감지 (Live 모드에서는 Window Watcher 보완)
- **Skip-idle**: 윈도우 타이틀 변화 없고 Vision category도 동일하면 스크린샷 생략 (Live 모드만)

#### B. 하루 마감 인사이트 리포트 (4개 고정 섹션)

**섹션 1 — 집중도 커브 (Focus Curve)**
- 목적: 사용자가 언제 중요한 일을 배치해야 하는지 판단하게 돕는 것
- 시간대별 집중/분산 점수 그래프 (0–100)
- 집중 블록과 분산 순간 시각화, 오늘의 피크 집중 시간 표시

**섹션 2 — 내일을 위한 제안 (Tomorrow's Nudge)**
- 목적: AI가 내일의 행동 우선순위를 대신 제안하는 것 (팁 제공 아님)
- 3가지 구체적 제안, "언제/무엇을/왜" 수준까지 구체화
- 예: "내일 오전 9-11시를 Deep Work 블록으로 설정하세요 — 오늘 이 시간대 집중도 최고"

**섹션 3 — 병목 해결사 (Bottleneck Solver)**
- 목적: AI가 무엇을 해결 우선순위에 두고 무엇을 위임할지 판단하는 것
- 반복 병목 목록 + 도구 추천 + 자동화 제안
- **OpenClaw 위임 버튼**: 클릭 시 OpenClaw 퍼스널 에이전트에 작업 전달

**섹션 4 — 미완성 작업 추적 (Interrupted Tasks)**
- 목적: AI가 무엇을 다시 시작하고 무엇을 버릴지 판단하게 돕는 것
- 중단된 작업 목록 + 중단 시점 + 이탈 맥락
- 내일 계속할지 여부 제안
- 예: "14:23 README.md 편집 시작 → 15분 후 Slack 이탈, 미완성"

#### C. MenuBar 앱
- 상단 메뉴바 상태 아이콘 (모니터링 중 / 일시정지)
- 클릭 시 오늘의 간단 요약 팝업
- "리포트 생성" 버튼
- **Auto-briefing**: 설정한 시각(기본 오후 6시)에 자동으로 리포트 생성 + 트레이 알림

#### D. 초경량 피드백 (선택형, 필수 아님)
- thumbs up / thumbs down
- 피드백은 다음 리포트 프롬프트에 반영

#### E. 목표 입력 (Daily Goal Input) — Yeonjeong
- 앱 시작 시 오늘의 목표를 자연어로 입력 (선택 사항, 미입력 시 앱 정상 동작)
- 예: "PRD 작성 2시간", "논문 읽기 1시간"
- AI가 자연어 목표를 자동으로 구조화:
  ```json
  {
    "goal_text": "PRD 작성 2시간",
    "target_behaviors": ["writing", "reading"],
    "anti_behaviors": ["browsing", "media"],
    "success_metric": { "focused_minutes": 120 }
  }
  ```

#### F. 목표-행동 괴리 분석 (Goal-Behavior Gap Analysis) — Yeonjeong
- 목표 입력 시에만 활성화 (미입력 시 "목표를 입력하면 분석됩니다" 안내)
- **섹션 5 — 목표 정렬 리포트 (Goal Alignment Report)**
  - `alignment_score`: 0.0~1.0 (target_behaviors 해당 시간 / 전체 추적 시간)
  - `deviation_patterns`: 괴리 패턴 목록
    - 예: "작업 시작 직후 distraction 발생"
    - 예: "검색 → 소비로 전이"
  - **Why 분석**: 괴리의 원인 가설 (행동 데이터 기반)
  - **How 제안**: 행동 교정 전략 + 목표 재설정 제안
    - 예: "25분 집중 후 메신저 확인으로 루틴 변경"
    - 예: "목표를 45분 단위로 분해"

#### G. Preferences UI
- 스크린샷 캡처 주기 (1~15분), Window Watcher 폴링 주기 (10~120초) 설정
- Auto-briefing 시각 설정 (기본 18:00) + 활성화/비활성화 토글
- 데이터 보관 기간 설정 (스크린샷: 기본 30일, activity: 기본 90일)
- API key 관리 (마스킹 표시 + 변경)
- 설정 변경 즉시 scheduler에 반영

---

### 3.2 제외 기능 (스코프 아웃 — 추가 금지)

- 멀티 디바이스 동기화
- 팀/조직 분석
- 푸시 알림
- Day over Day 비교
- App blocklist / Cost estimator UI
- Cloud sync / Analytics / 자동 업데이트
- Vector embeddings
- 실시간 개입 (알림/차단)
- 감정/심리 상태 추정
- 키 입력 원문 저장

---

## 4. 기술 아키텍처

### 4.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| App shell | Electron (electron-vite) |
| Screen capture (Live) | `record` CLI (`brew install atacan/tap/record`) — 외부 프로세스로 스크린샷 캡처 |
| Video processing | `ffmpeg` (`brew install ffmpeg`) — 영상 프레임 추출 + 메타데이터 조회 |
| UI | React 18 + TypeScript strict |
| Package manager | pnpm |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Charts | Recharts |
| Database | SQLite via better-sqlite3 (WAL mode) |
| AI (기본) | Anthropic Claude `claude-opus-4-6` |
| AI (인터페이스) | Swappable `AIProvider` interface — 향후 모델 교체 가능 |
| Validation | Zod — 모든 AI 응답에 필수 적용 |
| Test | Vitest (jsdom renderer / node main) |
| Linter | ESLint + eslint-plugin-import |
| Formatter | Prettier (2-space, single quotes) |

### 4.2 AIProvider 인터페이스 (Yongrae)

모든 AI 호출은 `AIProvider` 인터페이스를 통해 이루어진다. 기본 구현체는 `ClaudeProvider`이며, 인터페이스를 교체하면 다른 모델로 전환 가능하다.

```typescript
// src/shared/types.ts
interface AIProvider {
  analyzeScreenshot(images: Buffer[]): Promise<VisionResponse[]>
  categorize(description: string): Promise<CategorizationResponse>
  structureGoal(goalText: string): Promise<GoalStructure>
  generateReport(data: DailyData): Promise<ReportPayload>
}

// src/main/providers/claude.ts — 기본 구현체
class ClaudeProvider implements AIProvider { ... }
```

### 4.3 프로세스 구조

```text
src/
  main/                      # Electron main process (Node.js)
    screen-capture.ts        # record CLI wrapper (record screen --screenshot)
    video-processor.ts       # ffmpeg wrapper — 프레임 추출, 영상 메타데이터 조회
    activity-tracker.ts      # active-win, 30초 폴링
    scheduler.ts             # self-rescheduling setTimeout, skip-idle
    db.ts                    # 모든 SQLite 쿼리 (타 파일 raw SQL 금지)
    claude-analyzer.ts       # AIProvider 오케스트레이션 + 파이프라인 + 리포트 생성
    openclaw-bridge.ts       # OpenClaw CLI/API 연동
    ipc-handlers.ts          # 모든 IPC 핸들러 등록
    providers/
      claude.ts              # ClaudeProvider (AIProvider 기본 구현체)
    migrations/              # 001_init.sql, 002_... (번호 순)
    prompts/                 # 프롬프트 템플릿 (TS 함수로 export)
      vision-analyze.ts      # 데모 환경 전용 Vision 프롬프트
      categorize.ts
      report-generate.ts
      goal-structure.ts      # 목표 구조화 프롬프트 (Yeonjeong)
      why-loop.ts            # 괴리 원인 분석 프롬프트 (Yeonjeong)
      how-loop.ts            # 행동 교정 제안 프롬프트 (Yeonjeong)
  renderer/                  # React
    components/
      MenuBarPopup.tsx
      ReportWindow.tsx
      FocusCurveChart.tsx
      TomorrowNudge.tsx
      BottleneckSolver.tsx
      InterruptedTasks.tsx
      GoalInput.tsx
      GoalAlignmentReport.tsx
      VideoImport.tsx         # 영상 파일 임포트 UI (드래그앤드롭 + 파일 선택)
    pages/
      report.tsx
      settings.tsx
  shared/
    ipc-channels.ts
    types.ts
    schemas/
skills/                      # 외부 CLI 스킬 레퍼런스
  record/                    # record CLI (화면 캡처)
  electron-record-capture/   # Electron + record 연동 패턴
  ffmpeg/                    # ffmpeg (영상 프레임 추출)
scripts/
  seed.ts
docs/
  PRD.md
  SKILLS.md
```

### 4.4 데이터 모델 (SQLite)

```sql
-- 앱 활동 이벤트
CREATE TABLE activity_events (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,     -- ISO 8601 UTC
  app_name TEXT,
  window_title TEXT,
  category TEXT,
  duration_sec INTEGER
);

-- 오늘의 목표
CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  goal_text TEXT NOT NULL,
  target_behaviors TEXT,       -- JSON array
  anti_behaviors TEXT,         -- JSON array
  success_metric TEXT,         -- JSON object
  created_at TEXT NOT NULL
);

-- 스크린샷 Vision 분석 결과
CREATE TABLE screenshot_analyses (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  screenshot_path TEXT,        -- 바이너리 저장 금지, 경로만
  application TEXT,
  description TEXT,
  category TEXT,
  tags TEXT,                   -- JSON array
  focus_score INTEGER,         -- 0-100
  task_state TEXT,
  tool_in_video TEXT,
  full_response TEXT,
  display_id INTEGER
);

-- 일일 리포트
CREATE TABLE daily_reports (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  focus_curve_data TEXT,       -- JSON array
  tomorrow_nudges TEXT,        -- JSON array
  bottlenecks TEXT,            -- JSON array
  interrupted_tasks TEXT,      -- JSON array
  goal_alignment_score REAL,   -- nullable
  deviation_patterns TEXT,     -- JSON array, nullable
  why_analysis TEXT,           -- JSON array, nullable
  how_suggestions TEXT,        -- JSON array, nullable
  summary TEXT
);

-- 피드백
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY,
  report_id INTEGER,
  item_type TEXT,
  rating INTEGER,
  created_at TEXT NOT NULL
);
```

### 4.5 AI 분석 파이프라인

#### Live Capture 모드
```text
매 설정된 스크린샷 주기(`config.snapshotIntervalMinutes`, 기본 5분):
  `record screen --screenshot --display <id> --output <path>` 실행 (각 디스플레이)
  → sharp로 JPEG 1280px 리사이즈
  → [2-3장 배치]
  → AIProvider.analyzeScreenshot() — Step 1: 영상 안의 작업 분석
  → AIProvider.categorize()        — Step 2: 카테고리 분류 (반드시 별도 call)
  → 직전 스냅샷과 category 비교 → 변화 있으면 context_switch activity_events 기록
  → Zod 검증
  → SQLite 저장
```

#### Video File 모드
```text
영상 파일 로드 시:
  1. ffprobe로 영상 길이 조회:
     `ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4`
  2. 설정된 주기(`config.snapshotIntervalMinutes`)로 프레임 추출:
     `ffmpeg -i video.mp4 -vf "fps=1/<interval_sec>" -q:v 2 <tmpdir>/frame_%04d.png`
  3. 추출된 프레임 목록 순회:
     → sharp로 JPEG 1280px 리사이즈
     → [2-3장 배치]
     → AIProvider.analyzeScreenshot() — Step 1
     → AIProvider.categorize()        — Step 2
     → 직전 프레임과 category 비교 → context_switch activity_events 기록
     → Zod 검증
     → SQLite 저장 (timestamp = 영상 내 시간, source = 'video')
  4. 전체 프레임 처리 완료 → 자동 리포트 생성 가능
```

#### 하루 마감 (공통)
```text
  goals + activity_events + screenshot_analyses 집계
  → (목표 있을 시) Goal Modeling 로드
  → (목표 있을 시) Gap Analysis 계산
  → AIProvider.generateReport()
  → daily_reports 저장
  → ReportWindow 렌더링
```

**데모 환경 Vision 프롬프트 (vision-analyze.ts):**
```text
이 화면은 유튜브 영상(조코딩 라이브)을 재생 중인 브라우저 화면입니다.
브라우저 UI가 아니라 영상 안의 발표자 화면을 분석하세요.

발표자가 현재 어떤 작업을 하고 있는지 JSON으로 응답하세요:
{
  "current_task": "발표자가 현재 하고 있는 작업 (1줄)",
  "tool_in_video": "VS Code | Terminal | Browser | Slides | Other",
  "category": "coding|writing|...",
  "focus_score": 0~100,
  "task_state": "starting|in_progress|switching|explaining",
  "notes": "특이사항"
}
영상이 보이지 않거나 로딩 중이면 focus_score는 0으로 반환하세요.
```

**Context Switch 감지 로직 (두 소스 병행):**
```typescript
// 소스 1 — Window Watcher 타이틀 변화
if (prev?.window_title !== currentTitle) {
  storeService.insertActivityEvent({ app_name: currentApp, window_title: currentTitle, ... })
}

// 소스 2 — Vision category 변화
if (prev?.category !== currentAnalysis.category) {
  storeService.insertActivityEvent({
    app_name: 'YouTube (조코딩)',
    window_title: `영상 내 전환: ${prev.category} → ${currentAnalysis.category}`, ...
  })
}
```

### 4.6 IPC 채널 목록

| 채널 | 설명 |
|------|------|
| `collect:start` | 수집 시작 (Live 모드) |
| `collect:stop` | 수집 중단 |
| `collect:state` | 현재 수집 상태 |
| `video:import` | 영상 파일 임포트 (Video 모드) — 파일 경로 전달 |
| `video:progress` | 영상 처리 진행률 (Main → Renderer) |
| `video:check-ffmpeg` | ffmpeg 설치 여부 확인 |
| `activity:get-today` | 오늘 activity 조회 |
| `goals:save` | 오늘 목표 저장 |
| `goals:get` | 오늘 목표 조회 |
| `report:generate` | 리포트 생성 요청 |
| `report:get` | 저장된 리포트 조회 |
| `prefs:read` | 설정 읽기 |
| `prefs:write` | 설정 저장 |
| `today:summary` | 오늘 요약 (트레이 팝업) |
| `feedback:submit` | 피드백 저장 |
| `openclaw:delegate` | OpenClaw 위임 |
| `error:*` | 에러 이벤트 |

---

## 5. OpenClaw 연동

- OpenClaw = Opencode CLI가 아닌 **별도 퍼스널 에이전트 프레임워크** (구 clawdbot/moltbot)
- `openclaw-bridge.ts`에서 CLI 또는 HTTP API 연동
- **스펙 불명확 시**: 인터페이스만 정의, 버튼 클릭 → "위임됨" 시뮬레이션 허용

---

## 6. macOS 권한 및 외부 의존성

1. **Screen Recording** — `record` CLI가 내부적으로 필요 (Live 모드). 터미널 앱(또는 Electron 앱)에 Screen Recording 권한 부여 필수
2. **Accessibility** — 앱/타이틀 폴링 필수 (Live 모드)

- `entitlements.mac.plist`에 선언 필수
- 앱 실행 시마다 권한 확인 → 거부 시 안내 다이얼로그
- **외부 CLI 사전 설치 필수**:
  - `record`: `brew install atacan/tap/record` — Live 모드에 필수
  - `ffmpeg`: `brew install ffmpeg` — Video File 모드에 필수
  - 앱 시작 시 양쪽 모두 설치 확인, 미설치 시 해당 모드 비활성화 + 안내 다이얼로그
- **Target: macOS only.** MVP 코드에 Windows/Linux 분기 추가 금지

---

## 7. Acceptance Criteria (시연 기준)

- [ ] 앱 실행 후 백그라운드 활동 추적 시작 (Live 모드)
- [ ] 영상 파일(.mp4) 임포트 시 ffmpeg로 프레임 추출 + 분석 실행 (Video 모드)
- [ ] Video 모드에서 처리 진행률 표시
- [ ] 오늘의 목표를 자연어로 입력할 수 있다
- [ ] 입력된 목표가 target_behaviors / anti_behaviors로 자동 구조화된다
- [ ] 설정된 스크린샷 주기마다 스크린샷/프레임 분석 결과가 SQLite에 저장된다
- [ ] Settings 페이지에서 API key를 저장할 수 있다
- [ ] "리포트 생성" 클릭 시 4개 섹션 리포트 창 열림 (목표 입력 시 5개)
- [ ] Focus Curve 차트 렌더링
- [ ] Tomorrow's Nudge 3개 이상 구체적 제안 표시
- [ ] Bottleneck Solver OpenClaw 위임 버튼 동작
- [ ] Interrupted Tasks 오늘 중단 작업 표시
- [ ] 목표 입력 시 Goal Alignment Report에 alignment_score + deviation_patterns + why/how 표시
- [ ] Preferences에서 캡처 주기·보관 기간·briefing 시각 설정 가능
- [ ] 보관 기간 초과 데이터 자동 삭제 동작
- [ ] 앱 크래시 없이 시연 전 과정 수행

---

## 8. 리스크 대응

| 리스크 | 대응 |
|--------|------|
| macOS 권한 거부 | 시작 시 안내 다이얼로그 |
| Claude Vision 지연 | 로딩 상태 표시 + fallback 카드 |
| 시연 당일 데이터 부족 | `pnpm seed` mock data seeder |
| OpenClaw 스펙 불명확 | 버튼 동작 시뮬레이션 |
| Electron 빌드 시간 | dev mode 시연 가능 |
| 영상 내 화면 인식 실패 | focus_score 0 처리 + skip-idle로 해당 스냅샷 제외 |
| Window Watcher 타이틀 고정 구간 | Vision category 변화로 context switch 감지 보완 |
| 영상 1시간 → 스냅샷 12개뿐 | seed 데이터로 보완 |
| 목표 미입력 시 Gap Analysis 빈 결과 | 해당 섹션 "목표를 입력하면 분석됩니다" 안내 표시 |
| T14 이전에는 Settings/API key UI가 없음 | live API 검증은 T14 이후에만 수행 |
| `record` CLI 미설치 | 앱 시작 시 `checkRecordInstalled()` → Live 모드 비활성화 + `brew install atacan/tap/record` 안내 |
| `ffmpeg` 미설치 | 앱 시작 시 `checkFfmpegInstalled()` → Video 모드 비활성화 + `brew install ffmpeg` 안내 |
| 영상 파일이 너무 큼 (수 시간) | 프레임 추출 전 예상 프레임 수 + 예상 API 비용 표시, 사용자 확인 후 진행 |
| ffmpeg 프레임 추출 실패 | 에러 로그 + 안내 다이얼로그, 앱 크래시 금지 |

---

## 9. 시연 시나리오 (5분)

1. **(0:00)** 앱 실행 → 오늘의 목표 입력 ("코딩 2시간 집중")
2. **(0:30)** 백그라운드 모니터링 시작 + 필요 시 Settings에서 스크린샷 주기를 데모용으로 1분으로 조정
3. **(1:30)** "리포트 생성" 클릭 → 리포트 창 오픈
4. **(2:00)** Focus Curve: "오전 집중, 오후 분산 패턴" 설명
5. **(2:30)** Goal Alignment: "목표 달성률 61% — 검색→소비 전이 패턴 발견"
6. **(3:00)** Bottleneck Solver: OpenClaw 위임 버튼 클릭
7. **(3:30)** Interrupted Tasks: 중단 작업 확인
8. **(3:50)** Tomorrow's Nudge: 3가지 제안 확인
9. **(4:20)** Feedback 입력 확인
10. **(5:00)** Q&A
