# Runtime Package

Bundled Python CLI for the game workflow.

## Included

- `python/smbagent/` — CLI, workspace I/O, game pipeline, prompts, templates
- `requirements/` — pinned dependencies
- `install.sh` / `install.ps1` — local venv bootstrap

## Install

From repo root:

```bash
pip install -e .
```

Or use the helper script:

```bash
./install.sh
```

## CLI commands

```bash
python -m smbagent.cli doctor
python -m smbagent.cli new <customer-id>
python -m smbagent.cli qualify-game <customer-id> --brief "..."
python -m smbagent.cli plan-game <customer-id>
python -m smbagent.cli run-game <customer-id> --brief "..."
python -m smbagent.cli check-game-structure <customer-id>
```

Set `GAME_STUDIO_WORKSPACE_ROOT` (default: `source_pack/workspaces`) and `ANTHROPIC_API_KEY` for LLM stages.

See [docs/runtime_adapter_guide.md](../docs/runtime_adapter_guide.md) for adapter wiring with the UI.
