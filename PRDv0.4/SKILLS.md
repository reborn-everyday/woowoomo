# Skills — 우리는 우리를 모른다

> AI Agent가 구현 시 참조해야 하는 외부 스킬 목록.
> 각 스킬의 `SKILL.md`를 읽고 지침을 따를 것.

---

## 1. `record` — macOS Screen / Audio / Camera Capture CLI

**경로**: [`skills/record/SKILL.md`](skills/record/SKILL.md)

macOS 터미널에서 화면, 마이크, 카메라를 캡처하는 CLI 도구.
이 프로젝트에서는 **Live Capture 모드의 스크린샷 캡처 백엔드**로 사용한다.

### 이 프로젝트에서 사용하는 명령어

```bash
# 스크린샷 캡처
record screen --screenshot --output <path> --overwrite

# 특정 디스플레이 캡처
record screen --screenshot --display <id> --output <path>

# 특정 윈도우 캡처
record screen --screenshot --window "<title>" --output <path>

# 디스플레이 목록 (JSON)
record screen --list-displays --json

# 윈도우 목록 (JSON)
record screen --list-windows --json
```

### 설치

```bash
brew install atacan/tap/record
```

### 핵심 규칙

- Electron `desktopCapturer` **사용 금지** — 모든 화면 캡처는 `record` CLI를 통해 수행
- `record`는 PNG를 기본 출력 → 캡처 후 `sharp`로 JPEG 1280px 리사이즈하여 Vision API 전송
- 앱 시작 시 `record --help` 실행으로 설치 여부 확인, 미설치 시 Live 모드 비활성화

---

## 2. `electron-record-capture` — Electron에서 record CLI 연동 패턴

**경로**: [`skills/electron-record-capture/SKILL.md`](skills/electron-record-capture/SKILL.md)

Electron 앱에서 `record` CLI를 `child_process.execFile`로 호출하여 스크린샷을 캡처하는 통합 패턴.

### 포함 내용

- **아키텍처**: Renderer → IPC → Main → `execFile('record')` → PNG → base64 → Renderer
- **Main Process**: `runRecord()` 헬퍼 + IPC 핸들러 패턴
- **Preload**: `contextBridge` 브릿지 구현 + CJS 빌드 설정
- **Vite Config**: `vite-plugin-electron` preload CJS 빌드 설정
- **Gotcha 모음**: 실제 개발 중 발견한 함정들

### 핵심 Gotchas (반드시 숙지)

| 문제 | 원인 | 해결 |
|------|------|------|
| `window.electronAPI`가 `undefined` | Preload에서 ESM `import` 사용 | **`require('electron')` 사용** (ESM import 금지) |
| `window.electronAPI`가 `undefined` | `sandbox: true` (Electron 20+ 기본값) | **`sandbox: false`** 설정 |
| `record` CLI not found | 프로덕션 빌드에서 PATH 누락 | `PATH`에 `/opt/homebrew/bin` 추가 |
| 빈 스크린샷 | macOS Screen Recording 권한 미부여 | System Settings에서 권한 부여 |

### 참조 파일

- [Main Process 레퍼런스](skills/electron-record-capture/references/main-process.md)
- [Preload & Bridge 레퍼런스](skills/electron-record-capture/references/preload-bridge.md)
- [작동 예제 프로젝트](../electron-record-cli-example/)

---

## 3. `ffmpeg` — Video / Audio Processing CLI

**경로**: [`skills/ffmpeg/SKILL.md`](skills/ffmpeg/SKILL.md)

비디오 및 오디오 처리를 위한 CLI 도구.
이 프로젝트에서는 **Video File 모드의 프레임 추출 백엔드**로 사용한다.

### 이 프로젝트에서 사용하는 명령어

```bash
# 영상 길이 조회
ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4

# 설정 주기에 맞춰 프레임 추출 (5분 = 300초 간격)
ffmpeg -i video.mp4 -vf "fps=1/300" -q:v 2 /tmp/frames/frame_%04d.png

# 1분 간격 프레임 추출 (데모용)
ffmpeg -i video.mp4 -vf "fps=1/60" -q:v 2 /tmp/frames/frame_%04d.png

# 특정 시간의 프레임 1장 추출
ffmpeg -i video.mp4 -ss 00:05:00 -vframes 1 frame.png
```

### 설치

```bash
brew install ffmpeg
```

### 핵심 규칙

- `child_process.execFile('ffmpeg', [...])` 또는 `child_process.execFile('ffprobe', [...])` — Main Process에서만 호출
- `@ffmpeg/ffmpeg` (WASM) **사용 금지** — 네이티브 ffmpeg CLI만 사용
- 프레임 추출 전 `ffprobe`로 영상 길이 조회 → 예상 프레임 수 + 예상 API 비용 UI에 표시 → 사용자 확인 후 진행
- 추출된 PNG → `sharp`로 JPEG 1280px 리사이즈 → Vision API 전송 (Live 모드와 동일 파이프라인)
- 분석 완료 후 추출된 프레임 PNG 파일 삭제 (임시 파일 정리)
- 앱 시작 시 `which ffmpeg` 실행으로 설치 여부 확인, 미설치 시 Video 모드 비활성화

### Video File 모드 전체 흐름

```
사용자가 .mp4 드래그앤드롭 / 파일 선택
  → video:import IPC
  → ffprobe로 duration 조회
  → UI에 예상 프레임 수 표시
  → 사용자 확인
  → ffmpeg -vf "fps=1/<interval>" 프레임 추출
  → 각 프레임 순회: sharp resize → Vision → Categorize → SQLite
  → video:progress IPC로 진행률 전송
  → 완료 후 리포트 생성 가능
```
