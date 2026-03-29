# SKILLS.md

## Default loading order

Load core repo docs first, in this order:

1. `docs/PRD.md`
2. `docs/AGENTS.md`
3. `docs/TASKS.md`

Do not replace this baseline with skill docs.

## Deferred loading rule

- Do not preload every file under `.sisyphus/skills/`.
- Load a skill doc only when the current task clearly matches that domain.
- If no skill matches, continue with the core docs only.

## Local skills to load on demand

- `.sisyphus/skills/record/SKILL.md`: Use for macOS terminal capture with the `record` CLI, and get user consent before recording audio, screen, or camera.
- `.sisyphus/skills/electron-record-capture/SKILL.md`: Use for Electron screen capture work that integrates the `record` CLI through main-process IPC and preload constraints.
- `.sisyphus/skills/ffmpeg/SKILL.md`: Use for Docker-based FFmpeg media processing such as conversion, extraction, resizing, compression, thumbnails, trimming, and related transforms.
