# AGENTS.md — We Don't Know Ourselves

> **Authoritative product spec: `docs/PRD.md`**
> 스코프·동작 결정 시 PRD 먼저 참조. 이 파일은 코딩 컨벤션·아키텍처·에이전트 실행 규칙을 다룬다.
> 실행 태스크 순서는 `TASKS.md` 참조.

---

## 1. 에이전트 실행 원칙

- **반드시 plan 먼저, execute 후** (`opencode.json` → `"default_agent": "plan"`)
- 스코프 결정 전 `docs/PRD.md` 필수 참조
- MVP 스코프 경계: PRD §3 (포함 기능) + §7 (Acceptance Criteria)
- 실제 활동 데이터 없을 시: `pnpm seed` 실행 (PRD §8 리스크 대응)
- OpenClaw 스펙 없을 시: 인터페이스 정의 후 버튼 동작 시뮬레이션
- **ZERO HUMAN INTERVENTION**: 모든 검증은 agent가 직접 실행
- **Ralphthon 운영 제약 준수**:
  - 초기 1시간 30분에는 사람이 프롬프트를 구조화해 넣고, 그 이후 5시간은 agent가 스스로 진행해야 한다
  - T14 완료 전에는 Settings/API key UI가 없다고 가정해야 한다
  - live Anthropic 검증은 T14 이후에만 수행한다
  
---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| App shell | Electron (electron-vite) |
| Screen capture (Live) | `record` CLI (`brew install atacan/tap/record`) |
| Video processing | `ffmpeg` / `ffprobe` (`brew install ffmpeg`) |
| UI | React 18 + TypeScript strict |
| Package manager | pnpm |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Charts | Recharts |
| Database | SQLite via better-sqlite3 (WAL mode) |
| AI (기본) | Anthropic Claude `claude-opus-4-6` |
| AI (인터페이스) | Swappable `AIProvider` interface |
| Validation | Zod (모든 AI 응답 필수) |
| Test | Vitest |
| Linter | ESLint + eslint-plugin-import |
| Formatter | Prettier (2-space indent, single quotes) |

---

## 3. Build / Dev / Test Commands

```bash
pnpm dev              # Electron + Vite watch mode
pnpm build            # tsc + Vite + Electron package (macOS)
pnpm typecheck        # tsc --noEmit

pnpm lint             # ESLint
pnpm lint:fix
pnpm format           # Prettier --write src/

pnpm test             # 전체 Vitest
pnpm test -- --run src/main/services/store   # 단일 파일
pnpm test -- --reporter=verbose

pnpm seed             # mock data seeder
```

---

## 4. TypeScript Conventions

- `"strict": true` in `tsconfig.json` — 필수
- 모든 exported function에 **명시적 반환 타입** 선언
- 객체 형태 → `interface`, 유니온/교차/원시 별칭 → `type`
- `any` 절대 금지 — 불확실한 타입은 `unknown` + 타입 가드
- non-null assertion (`!`) 금지 — `null`/`undefined` 명시적 처리
- `enum` 대신 string-literal union
- 공용 타입은 `src/shared/types.ts`에만 위치

---

## 5. Import Ordering

그룹 사이 빈 줄 필수:

```ts
// 1. Node built-ins (node: protocol)
import path from 'node:path'

// 2. Electron
import { ipcMain, BrowserWindow } from 'electron'

// 3. Third-party
import Anthropic from '@anthropic-ai/sdk'
import Database from 'better-sqlite3'
import { z } from 'zod'

// 4. Internal aliases
import { IPC } from '@shared/ipc-channels'
import type { ActivityEvent } from '@shared/types'

// 5. Relative
import { buildFocusScore } from './focus-scorer'
```

`src/main/` 내 barrel `index.ts` re-export 금지 — 파일 직접 import.

---

## 6. Naming Conventions

| Target | Convention | Example |
|--------|-----------|---------|
| Main-process files | `kebab-case.ts` | `activity-tracker.ts` |
| React component files | `PascalCase.tsx` | `FocusCurveChart.tsx` |
| React components | `PascalCase` | `function FocusCurveChart()` |
| Props interface | `{Name}Props` | `interface FocusCurveProps` |
| Functions & variables | `camelCase` | `getFocusScore()` |
| Constants | `SCREAMING_SNAKE` | `CAPTURE_INTERVAL_MS` |
| DB tables & columns | `snake_case` plural | `activity_events`, `app_name` |
| IPC channel strings | `domain:action` | `'activity:get-today'` |
| AI Provider class | `{Name}Provider` | `ClaudeProvider` |

---

## 7. React & UI Conventions

- 함수형 컴포넌트만 — class component 금지
- 상태: `useState` local 우선, sibling 공유 시에만 lifting — global store 없음
- Tailwind utility class만 — inline `style={{}}` 금지
- shadcn/ui primitives 우선
- 모든 차트: Recharts `ResponsiveContainer` + `LineChart` / `AreaChart`
- **로딩 상태 필수**: 모든 async AI API 호출 중 spinner 또는 skeleton
- AI 오류 시: 리포트 섹션에 fallback 카드, 앱 크래시 금지
- Settings 페이지는 반드시 API key 입력/변경 UI를 포함해야 한다

---

## 8. Error Handling

- 모든 `async` 함수에 `try/catch` — 에러 무시 금지
- `throw new Error('message')` — `throw 'string'` 금지
- Main process 에러: ISO timestamp 로그 → IPC error event를 renderer에 emit
- AI API 에러: fallback 카드 표시, 앱 크래시 금지
- DB 에러: `DatabaseError` 클래스 래핑, 트랜잭션 실패 시 rollback
- Screen capture / Accessibility 권한 거부: 안내 다이얼로그
- `record` CLI 미설치: Live 모드 비활성화 + 안내 다이얼로그 ("brew install atacan/tap/record")
- `ffmpeg` 미설치: Video 모드 비활성화 + 안내 다이얼로그 ("brew install ffmpeg")
- ffmpeg 프레임 추출 실패: 에러 로그 + 안내, 앱 크래시 금지
- 지원하지 않는 영상 형식: 안내 메시지, 앱 크래시 금지
- Vision 응답 파싱 실패: Zod catch → graceful degradation (해당 스냅샷/프레임 건너뜀)
- IPC 핸들러: throw 대신 `{ error: string }` 객체 반환
- **Auto-briefing 실패 시**: 에러 로그 + 트레이 알림 "리포트 생성 실패, 수동으로 생성해주세요" — 앱 크래시 금지

---

## 8-1. Scheduler Conventions

- Window Watcher 폴링: 기본 30초, 범위 10초~120초 (설정 가능)
- 스크린샷 주기: 기본 5분, 범위 1분~15분 (설정 가능)
- **Auto-briefing**: `config.briefingTime` (기본 "18:00") — 매일 설정 시각 도달 시 자동 `generateDailyReport()` 호출
  - 완료 시 트레이 알림 표시
  - 당일 이미 생성된 리포트가 있으면 재생성 안 함
  - 앱이 실행 중이 아니면 다음 실행 시 생성
- setInterval 대신 self-rescheduling setTimeout 사용
- `powerMonitor` suspend/lock-screen → auto-pause, resume/unlock → auto-resume

---

## 8-2. Screen Capture Conventions (`record` CLI)

> **스크린샷 캡처는 Electron `desktopCapturer`가 아니라 `record` CLI 외부 프로세스를 사용한다.**

- **설치 전제**: `brew install atacan/tap/record` — 앱 시작 시 `which record` 또는 `record --help`로 설치 확인
- **캡처 호출**: `child_process.execFile('record', ['screen', '--screenshot', '--display', displayId, '--output', outputPath, '--json'])` 사용
- **멀티모니터**: `record screen --list-displays --json`으로 디스플레이 목록 조회 후 각각 별도 캡처
- **출력 형식**: `record`는 PNG를 기본 출력. 캡처 후 `sharp`로 JPEG 1280px 리사이즈하여 Vision API 전송
- **에러 처리**: `record` 프로세스 exit code ≠ 0 → 해당 스냅샷 건너뜀 + 에러 로그
- **타임아웃**: `record` 프로세스가 10초 내 응답 없으면 kill + 건너뜀
- **`desktopCapturer` 사용 금지** — 모든 화면 캡처는 반드시 `record` CLI를 통해 수행

---

## 8-3. Video Processing Conventions (`ffmpeg`)

> **영상 파일 처리는 `ffmpeg` / `ffprobe` CLI를 `child_process.execFile`로 호출한다.**

- **설치 전제**: `brew install ffmpeg` — 앱 시작 시 `which ffmpeg`로 설치 확인
- **영상 메타데이터 조회**: `ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4`
- **프레임 추출**: `ffmpeg -i video.mp4 -vf "fps=1/<interval_sec>" -q:v 2 <tmpdir>/frame_%04d.png`
  - `interval_sec` = `config.snapshotIntervalMinutes * 60` (기본 300초 = 5분)
  - 출력: PNG 파일 시퀀스 → sharp로 JPEG 1280px 리사이즈 후 Vision API 전송
- **지원 형식**: `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm` — ffmpeg가 디코딩 가능한 형식
- **대용량 영상 보호**: 프레임 추출 전 예상 프레임 수 = `ceil(duration / interval_sec)` 계산 → UI에 예상 프레임 수 + 예상 API 비용 표시 → 사용자 확인 후 진행
- **진행률 보고**: `video:progress` IPC로 현재 프레임 / 전체 프레임 비율 전송
- **타임스탬프 매핑**: 프레임 N의 타임스탬프 = `N * interval_sec` (영상 내 시간 기준)
- **에러 처리**: ffmpeg exit code ≠ 0 → 에러 로그 + 안내 다이얼로그, 앱 크래시 금지
- **타임아웃**: 프레임 추출은 영상 길이에 비례하므로 고정 타임아웃 대신 진행상태 모니터링
- **임시 파일 정리**: 분석 완료 후 추출된 프레임 PNG 파일 삭제
- **VideoImport UI**: 드래그앤드롭 + 파일 선택 다이얼로그, 진행률 표시, 처리 중 취소 가능

---

## 9. SQLite Conventions

- **모든 SQL은 `src/main/db.ts`에만** — 타 파일 raw SQL 절대 금지
- `better-sqlite3` prepared statements (`.prepare()`) — 모든 parameterized query
- 테이블명: `snake_case` 복수
- 스키마 변경: `migrations/001_init.sql`, `002_...` 번호 순
- 타임스탬프: ISO 8601 UTC (`new Date().toISOString()`)
- 스크린샷 바이너리 SQLite 저장 금지 — 경로만
- SQLite 작업 main process에서만 — renderer 직접 접근 금지
- WAL mode 필수

---

## 10. AIProvider Interface Conventions (Yongrae)

### 핵심 원칙
모든 AI 호출은 반드시 `AIProvider` 인터페이스를 통해 이루어진다. 구현체를 교체하면 다른 모델로 전환 가능하다.

```typescript
// src/shared/types.ts
interface AIProvider {
  analyzeScreenshot(images: Buffer[]): Promise<VisionResponse[]>
  categorize(description: string): Promise<CategorizationResponse>
  structureGoal(goalText: string): Promise<GoalStructure>
  generateReport(data: DailyData): Promise<ReportPayload>
}
```

### 구현 규칙
- 기본 구현체: `src/main/providers/claude.ts` — `ClaudeProvider implements AIProvider`
- 생성자: API key를 파라미터로 받음 (safeStorage에서 전달, 내부 저장 금지)
- 모든 메서드: Zod 스키마로 응답 검증, 파싱 실패 시 graceful degradation
- Rate limit: exponential backoff
- Invalid key: 즉시 throw (retry 금지)
- `claude-analyzer.ts`는 `AIProvider` 인터페이스만 참조 — `ClaudeProvider` 직접 참조 금지

### 2-step pipeline 필수
- `analyzeScreenshot()` → `categorize()` 순서로 반드시 별도 call
- 두 호출을 하나의 API call로 합치기 절대 금지
- Goal Structuring (`structureGoal()`)도 별도 call — generateReport()와 합치기 금지

### 데모 환경 Vision 프롬프트 규칙
> **분석 대상은 사용자 화면이 아니라 유튜브 영상 안의 발표자(조코딩) 화면이다.**

- `prompts/vision-analyze.ts`: "이 화면은 유튜브 영상입니다. 영상 안의 발표자 화면을 분석하세요" 명시
- 응답에 `tool_in_video` 필드 포함 (VS Code / Terminal / Browser / Slides / Other)
- 영상 미표시 / 로딩 중 → `focus_score: 0` 반환
- 모든 프롬프트 템플릿은 `src/main/prompts/`에 TS 함수로 export — 구현체 파일 인라인 금지

---

## 11. Context Switch 감지 규칙 (데모 환경)

두 가지 소스를 모두 activity_events에 기록:

**소스 1 — Window Watcher (윈도우 타이틀 변화)**
```typescript
// activity-tracker.ts
const prev = await storeService.getLatestActivityEvent()
if (prev && prev.window_title !== currentTitle) {
  await storeService.insertActivityEvent({
    timestamp: new Date().toISOString(),
    app_name: currentApp,
    window_title: currentTitle,
    category: null,
    duration_sec: 30
  })
}
```

**소스 2 — Vision (영상 안 category 변화)**
```typescript
// claude-analyzer.ts processScreenshots() 내부
const prev = await storeService.getLatestScreenshotAnalysis()
if (prev && prev.category !== currentAnalysis.category) {
  await storeService.insertActivityEvent({
    timestamp: new Date().toISOString(),
    app_name: 'YouTube (조코딩)',
    window_title: `영상 내 전환: ${prev.category} → ${currentAnalysis.category}`,
    category: currentAnalysis.category,
    duration_sec: 300
  })
}
```

---

## 12. IPC Conventions

- 채널명: `src/shared/ipc-channels.ts`의 `const` export만 사용
- Main process 핸들러: `src/main/ipc-handlers.ts`에서만 등록
- Renderer: `electron` 직접 import 금지 → `preload.ts`의 `contextBridge`로 노출된 `window.electronAPI` 사용
- 에러는 throw 대신 `{ error: string }` 반환

---

## 13. Goal Input Conventions (Yeonjeong)

- 목표 입력은 **선택 사항** — 입력 없어도 앱 전체 기능 동작
- `AIProvider.structureGoal()`: 자연어 목표 → `{ target_behaviors, anti_behaviors, success_metric }` 변환
- Goal Structuring은 **저장 즉시 1회만** 실행 — 매 스냅샷마다 실행 금지
- 목표가 있을 때만 리포트에 goal_alignment_score 섹션 렌더링
- goal_alignment_score 계산: target_behaviors 해당 category 누적 시간 / 전체 추적 시간
- 프롬프트 파일:
  - `prompts/goal-structure.ts` — 목표 구조화
  - `prompts/why-loop.ts` — 괴리 원인 분석
  - `prompts/how-loop.ts` — 행동 교정 제안

---

## 14. Must NOT Have (Guardrails)

아래 항목은 어떤 상황에서도 구현 금지:
- `any` 타입 / `@ts-ignore`
- `throw 'string'`
- Renderer에서 `electron` 직접 import
- SQLite 작업을 renderer에서 직접
- 스크린샷 바이너리를 SQLite에 저장
- AI 응답에 Zod 검증 생략
- `AIProvider` 인터페이스 없이 `ClaudeProvider` 직접 참조
- Vision + Categorization을 한 번의 API call로 합치기
- Goal Structuring + Report Generation을 한 번의 API call로 합치기
- T14 이전에 Settings/API key UI가 있다고 가정하기
- Cleanup 시 daily_reports 삭제
- 보관 기간 0일 설정 허용 (최소 1일 강제)
- PRD §3.2 제외 기능 구현
- Vision 프롬프트에서 "사용자의 현재 작업" 분석 방식 사용 (영상 안을 분석해야 함)
- **Electron `desktopCapturer` 사용 금지** — 스크린샷 캡처는 반드시 `record` CLI를 통해 수행
- **영상 처리에 Node.js 순수 라이브러리 사용 금지** — 프레임 추출은 반드시 `ffmpeg` CLI를 통해 수행
- **`@ffmpeg/ffmpeg` (WASM) 사용 금지** — 네이티브 ffmpeg CLI만 사용

---

## 15. Privacy Principles

- 모든 데이터 로컬 처리 — 외부 전송 없음 (AI API 호출 제외)
- API key: Electron `safeStorage` — plaintext 저장 절대 금지
- 원본 스크린샷: 로컬만, SQLite에는 경로만
- 키 입력 원문 저장 없음
