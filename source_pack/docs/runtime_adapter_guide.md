# Runtime Adapter Guide

## Purpose

Explain how the source pack switches between artifact-only and bundled executable runtime modes.

## Modes

### `artifact-only`

Use when:

- the buyer wants to review intake and handoff artifacts first
- the runtime environment is not ready yet
- the delivery team wants a low-risk dry run mode

Behavior:

- artifacts are generated
- delivery bundle and signoff flow work
- `plan-game` and `run-game` calls are blocked with a clear message

### `bundled-cli`

Use when:

- the buyer wants the packaged runtime included in the source pack
- the delivery team can maintain Python dependencies

Default root:

- `source_pack/runtime/python`

Installer files:

- `source_pack/runtime/install.sh`
- `source_pack/runtime/install.ps1`
- `source_pack/runtime/requirements/base.txt`

## Recommended v1 Policy

Sell the package with `artifact-only` enabled by default and `bundled-cli` as the single supported executable delivery mode.

This keeps handoff safe while avoiding overpromising zero-setup runtime execution.
