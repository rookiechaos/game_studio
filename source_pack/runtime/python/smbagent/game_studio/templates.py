"""Independent game scaffold materialization.

Kept separate from SMB TemplatePack because the game output shape differs from
the legacy landing-page / agent-skills / integrations contract.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from ..workspace import Workspace

AVAILABLE_GAME_SCAFFOLDS = ["campaign-quiz"]
_SCAFFOLD_ROOT = Path(__file__).resolve().parent.parent / "templates" / "game-campaign-quiz"

MaterializeMode = Literal["seed", "overlay"]


class GameTemplateError(RuntimeError):
    pass


@dataclass
class GameScaffoldReport:
    written: list[str]
    skipped: list[str]
    overwritten: list[str]


def _resolve_scaffold_root(name: str) -> Path:
    if name != "campaign-quiz":
        raise GameTemplateError(
            f"unknown game scaffold {name!r} — available: {AVAILABLE_GAME_SCAFFOLDS}"
        )
    if not _SCAFFOLD_ROOT.is_dir():
        raise GameTemplateError(f"game scaffold directory missing at {_SCAFFOLD_ROOT}")
    return _SCAFFOLD_ROOT


def materialize_game_scaffold(
    workspace: Workspace,
    name: str,
    *,
    mode: MaterializeMode = "seed",
) -> GameScaffoldReport:
    root = _resolve_scaffold_root(name)
    code = workspace.code_dir
    code.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    skipped: list[str] = []
    overwritten: list[str] = []

    for src in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = src.relative_to(root)
        dest = code / rel
        rel_str = str(rel)
        if dest.exists():
            if mode == "seed":
                skipped.append(rel_str)
                continue
            overwritten.append(rel_str)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        if rel_str not in overwritten:
            written.append(rel_str)

    return GameScaffoldReport(written=written, skipped=skipped, overwritten=overwritten)
