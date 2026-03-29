# Simulation Register

This file discloses any capability intentionally simulated, mocked, or kept off the critical path during competition setup and rehearsal.

| Capability | Status | Why | Real-path expectation |
|---|---|---|---|
| Video File import and `ffprobe`/`ffmpeg` processing | Deferred / simulated for competition | Video implementation is intentionally excluded from the competition critical path to reduce demo-failure risk | Promote only after post-competition readiness is verified |
| OpenClaw delegation bridge | Simulated by default | External spec is uncertain and must not block the competition critical path | Replace the simulation only when the live spec is verified pre-launch |
| Provider smoke during rehearsal | Mock by default | Mock-first operation reduces false fails and preserves zero-steering setup | Switch to live only at the final launch gate with a pre-injected secret |
| Live desktop capture path | Operator-gated | Permission-dependent capture can still be exercised at an explicit live gate, but rehearsal may stay on seed/mock-safe flow | Promote only when permissions and operator checks are green |

## Disclosure Rule
- Simulated behavior must never be presented as live production integration.
- Demo and evidence artifacts must distinguish deferred video capability references from live desktop capture validation.
- The final evidence pack must explicitly disclose any simulated integration that remained in the run.
