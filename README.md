# Bangalore Times

A top-down pixel RPG set in Bengaluru. Phaser 3 for the game canvas, a thin React
shell around it, shipped as an installable PWA.

```bash
corepack pnpm install
corepack pnpm dev        # http://localhost:6174
corepack pnpm cap:sync   # same dist/ into the Android + iOS shells (Capacitor)
```

**Bangalore Times** — you come to Bangalore to make a life, then you
have to survive it. Built phase by phase with an audit after each one.

| Document | What is in it |
| -------- | ------------- |
| [CLAUDE.md](CLAUDE.md) | Driver file: golden rules, stack, commands, read order, execution order |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code is shaped right now |
| [TASKS.md](TASKS.md) | What's next, in order (`T-###`) |
| [DECISIONS.md](DECISIONS.md) | ADR log continuing `docs/design/…design_decisions_v1.md` |
| [MEMORY.md](MEMORY.md) | Working agreements, gotchas |
| [AUDIT_LOG.md](AUDIT_LOG.md) | Corrections from each phase audit, as reusable rules |
| [docs/design/](docs/design/) | The 31 settled design docs — story, systems, art, mobile, decisions |
| [TECH_STACK.md](TECH_STACK.md) | Rendering and library choices from the original port |
| [docs/asset-pipeline.md](docs/asset-pipeline.md) | How the current placeholder art is generated |
| [CREDITS.md](CREDITS.md) | Asset provenance |

Split out of the `cloud-march` monorepo (`packages/game`) with its git history
intact, so the game can carry its own deploy target and release cadence.
