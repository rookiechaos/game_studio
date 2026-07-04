# Deployment Guide

## Goal

Help the buyer deploy the source pack on their own infrastructure.

## Recommended Delivery v1 Approach

### UI

- Run the UI from `source_pack/ui`
- Configure environment variables before enabling runtime execution
- Keep the UI behind the buyer's internal access control if it is used as an operator console

### Runtime

- Start in `artifact-only` mode for intake and handoff review
- Enable `bundled-cli` only after the buyer confirms Python-side dependencies

### Workspaces

- Default workspace path is `source_pack/workspaces`
- Back up this directory because it contains:
  - intake artifacts
  - plan previews
  - run logs
  - signoff records

## Environment Variables

- `GAME_STUDIO_WORKSPACE_ROOT`
  Overrides the workspace output directory.
- `GAME_STUDIO_RUNTIME_MODE`
  Allowed values: `artifact-only`, `bundled-cli`
- `GAME_STUDIO_RUNTIME_ROOT`
  Overrides the runtime root when using `bundled-cli`

## Buyer Env Template

Copy `ui/.env.example` to `ui/.env.local`.

Supported UI locales: `en`, `ja` (default: `ja`).

## Buyer Deployment Checklist

- Confirm internal operator owners
- Confirm hosting owner
- Confirm asset upload and replacement process
- Confirm runtime dependency owner
- Confirm signoff owner before publication

## Out of Scope by Default

- We do not operate the buyer's production environment by default.
- We do not provide unlimited post-handoff changes.
- We do not assume shared access to buyer cloud accounts.
