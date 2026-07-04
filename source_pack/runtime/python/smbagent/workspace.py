from __future__ import annotations

import re
from pathlib import Path

from .game_studio.types import GamePlan, GameQualification, GameReleaseChecklist, GameRequirements
from .types import Verdict

_CUSTOMER_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


class InvalidCustomerIdError(ValueError):
    """Raised when a customer_id contains characters that could escape the workspace root."""


class Workspace:
    def __init__(self, customer_id: str, root: Path):
        if not _CUSTOMER_ID_RE.fullmatch(customer_id):
            raise InvalidCustomerIdError(
                f"invalid customer_id {customer_id!r}: must be 1-64 chars, ASCII alphanumeric "
                "plus '.', '_', '-', and must start with alphanumeric."
            )
        self.customer_id = customer_id

        root_resolved = root.resolve()
        self.path = (root_resolved / customer_id).resolve()
        if not self.path.is_relative_to(root_resolved):
            raise InvalidCustomerIdError(
                f"customer_id {customer_id!r} resolves outside {root_resolved}"
            )

        self.code_dir = self.path / "code"
        self.runs_dir = self.path / "runs"

    def ensure(self) -> None:
        self.path.mkdir(parents=True, exist_ok=True)
        self.code_dir.mkdir(exist_ok=True)
        self.runs_dir.mkdir(exist_ok=True)

    @property
    def game_qualification_path(self) -> Path:
        return self.path / "game_qualification.json"

    @property
    def game_requirements_path(self) -> Path:
        return self.path / "game_requirements.json"

    @property
    def game_transcript_path(self) -> Path:
        return self.path / "game_transcript.txt"

    @property
    def game_design_path(self) -> Path:
        return self.path / "game_design.md"

    @property
    def game_plan_path(self) -> Path:
        return self.path / "game_plan.json"

    @property
    def scene_map_path(self) -> Path:
        return self.path / "scene_map.json"

    @property
    def asset_manifest_path(self) -> Path:
        return self.path / "asset_manifest.json"

    @property
    def release_checklist_path(self) -> Path:
        return self.path / "release_checklist.json"

    def game_round_dir(self, round_n: int) -> Path:
        d = self.runs_dir / f"game-round-{round_n}"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def game_verdict_path(self, round_n: int) -> Path:
        return self.game_round_dir(round_n) / "verdict.json"

    def game_feedback_path(self, round_n: int) -> Path:
        return self.game_round_dir(round_n) / "feedback.md"

    def game_coding_log_path(self, round_n: int) -> Path:
        return self.game_round_dir(round_n) / "coding.log"

    def game_validation_log_path(self, round_n: int) -> Path:
        return self.game_round_dir(round_n) / "validation.log"

    def save_game_qualification(self, q: GameQualification) -> None:
        self.game_qualification_path.write_text(q.model_dump_json(indent=2), encoding="utf-8")

    def load_game_qualification(self) -> GameQualification:
        return GameQualification.model_validate_json(
            self.game_qualification_path.read_text(encoding="utf-8")
        )

    def save_game_requirements(self, req: GameRequirements) -> None:
        self.game_requirements_path.write_text(req.model_dump_json(indent=2), encoding="utf-8")

    def load_game_requirements(self) -> GameRequirements:
        return GameRequirements.model_validate_json(
            self.game_requirements_path.read_text(encoding="utf-8")
        )

    def save_game_plan(
        self,
        plan: GamePlan,
        design_md: str,
        release_checklist: GameReleaseChecklist | None = None,
    ) -> None:
        self.game_design_path.write_text(design_md, encoding="utf-8")
        self.game_plan_path.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
        self.scene_map_path.write_text(
            plan.model_dump_json(include={"scenes"}, indent=2), encoding="utf-8"
        )
        self.asset_manifest_path.write_text(
            plan.model_dump_json(include={"assets"}, indent=2), encoding="utf-8"
        )
        checklist = release_checklist or GameReleaseChecklist(
            checks=[
                "Game loads successfully on mobile browser",
                "Japanese text fits core UI surfaces",
                "All required scenes are reachable",
                "Reward/share/form flow works structurally",
            ]
        )
        self.release_checklist_path.write_text(
            checklist.model_dump_json(indent=2), encoding="utf-8"
        )

    def load_game_plan(self) -> GamePlan:
        return GamePlan.model_validate_json(self.game_plan_path.read_text(encoding="utf-8"))

    def load_game_release_checklist(self) -> GameReleaseChecklist:
        return GameReleaseChecklist.model_validate_json(
            self.release_checklist_path.read_text(encoding="utf-8")
        )

    def save_game_verdict(self, verdict: Verdict) -> None:
        self.game_verdict_path(verdict.round).write_text(
            verdict.model_dump_json(indent=2), encoding="utf-8"
        )

    def load_game_verdict(self, round_n: int) -> Verdict | None:
        p = self.game_verdict_path(round_n)
        if not p.exists():
            return None
        try:
            return Verdict.model_validate_json(p.read_text(encoding="utf-8"))
        except Exception:
            return None

    def size_bytes(self) -> int:
        total = 0
        if not self.path.exists():
            return 0
        for p in self.path.rglob("*"):
            try:
                if p.is_file():
                    total += p.stat().st_size
            except OSError:
                continue
        return total
