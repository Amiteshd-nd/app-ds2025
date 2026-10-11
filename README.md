# Namma Quest

A top-down pixel RPG set in Bengaluru. Phaser 3 for the game canvas, a thin React
shell around it, shipped as an installable PWA.

```bash
corepack pnpm install
corepack pnpm dev        # http://localhost:6174
```

| Document | What is in it |
| -------- | ------------- |
| [CLAUDE.md](CLAUDE.md) | Repo guardrails — ports, validation, asset pipeline, animation |
| [TECH_STACK.md](TECH_STACK.md) | Architecture, systems, and the full command list |
| [STRATEGY_COVERAGE.md](STRATEGY_COVERAGE.md) | What the game covers against the design strategy |
| [docs/asset-pipeline.md](docs/asset-pipeline.md) | How the sprites and tilemaps are generated |
| [CREDITS.md](CREDITS.md) | Asset provenance |

Split out of the `cloud-march` monorepo (`packages/game`) with its git history
intact, so the game can carry its own deploy target and release cadence.
