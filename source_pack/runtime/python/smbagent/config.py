from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

_PKG_ROOT = Path(__file__).resolve().parent
_SOURCE_PACK_ROOT = _PKG_ROOT.parents[2]
_DEFAULT_WORKSPACES_DIR = (_SOURCE_PACK_ROOT / "workspaces").resolve()


@dataclass
class Config:
    workspaces_dir: Path
    prompts_dir: Path = field(default_factory=lambda: _PKG_ROOT / "prompts")
    plan_model: str = "claude-sonnet-4-20250514"
    anthropic_api_key: str | None = None


def default_workspaces_dir() -> Path:
    return _DEFAULT_WORKSPACES_DIR


def load_config() -> Config:
    configured = os.environ.get("GAME_STUDIO_WORKSPACE_ROOT", "").strip()
    workspaces = Path(configured).resolve() if configured else _DEFAULT_WORKSPACES_DIR
    return Config(
        workspaces_dir=workspaces,
        plan_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
    )
