# Game Studio Source Pack

Buyer-facing delivery layout for the Japan game workflow.

## Layout

- `ui/` — Next.js operator console (intake, artifact review, delivery export)
- `runtime/` — Python CLI and template assets
- `workspaces/` — Local output for generated artifacts (gitignored)
- `docs/` — Deployment guides
- `examples/` — Sample workspace shape

## Runtime modes

- `artifact-only` (default) — writes intake artifacts without invoking the CLI
- `bundled-cli` — uses `runtime/python` as the CLI adapter root

## Onboarding

1. Read [docs/deployment_guide.md](docs/deployment_guide.md)
2. Copy `ui/.env.example` to `ui/.env.local`
3. Install runtime: `pip install -e ../..` from repo root
4. Install UI: `cd ui && npm install && npm run dev`

See the [root README](../../README.md) for full setup.
