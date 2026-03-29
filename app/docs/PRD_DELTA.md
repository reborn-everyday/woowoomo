# PRD Delta Log

This file records the run-specific reconciliation rules applied on top of `docs/PRD.md`.

## Adopted
- `docs/PRD.md` remains the source of truth for product behavior, but competition acceptance is limited to the live-safe main path plus explicit disclosure of non-live capabilities.
- Mock-first execution remains the default until an explicit live gate is opened.
- Any deferred or simulated capability must be disclosed in `docs/SIMULATION_REGISTER.md`.

## Deferred or Simulated for This Run
- Video File implementation, local-video ingestion, and the `ffprobe` + `ffmpeg` path are deferred for the competition mainline.
- Any YouTube or local-video reference in `docs/TASKS.md` and `docs/competition/*.md` is disclosure-only guidance, not canonical competition input.
- The manual `API_KEY_READY` handoff is outside the autonomous critical path unless a live provider check is explicitly promoted pre-launch.

## Frozen Decisions
- Competition decision: exclude video implementation from the critical path and describe it only as a deferred or simulated capability.
- Mock-safe monitoring, reporting, and disclosure remain the canonical competition story.
- Promote the Video File path only after post-competition readiness is verified.
