from __future__ import annotations

from ..config import Config
from ..types import Issue, Verdict
from ..workspace import Workspace
from .types import slugify_label
from .validation import run_all_game_structural_checks


class GameValidationAgent:
    """Deterministic validator for the experimental game pipeline.

    The first implementation uses code-enforced structural checks plus a small
    amount of requirements-aware coverage checking. This keeps the game mode
    reliable before we introduce a second-model validation loop.
    """

    def __init__(self, config: Config):
        self.config = config

    def run(self, workspace: Workspace, round_n: int) -> Verdict:
        requirements = workspace.load_game_requirements()
        issues = run_all_game_structural_checks(workspace.code_dir, requirements.package)
        issues.extend(self._check_scene_coverage(workspace))
        issues.extend(self._check_acceptance_coverage(requirements.acceptance_criteria))

        passed = not any(i.severity == "critical" for i in issues) and not any(
            i.severity == "major" for i in issues
        )
        summary = (
            "Game package passed structural validation."
            if passed
            else f"Game package has {len(issues)} validation issue(s)."
        )
        verdict = Verdict(
            passed=passed,
            round=round_n,
            summary=summary,
            issues=issues,
        )
        workspace.save_game_verdict(verdict)
        workspace.game_validation_log_path(round_n).write_text(
            verdict.model_dump_json(indent=2), encoding="utf-8"
        )
        workspace.game_feedback_path(round_n).write_text(
            self._feedback_markdown(verdict), encoding="utf-8"
        )
        return verdict

    def _check_scene_coverage(self, workspace: Workspace) -> list[Issue]:
        req = workspace.load_game_requirements()
        scene_names = {p.stem.removesuffix(".scene") for p in (workspace.code_dir / "game" / "scenes").glob("*.scene.json")}
        issues: list[Issue] = []
        for expected in req.required_scenes:
            slug = slugify_label(expected)
            if slug and slug not in scene_names:
                issues.append(
                    Issue(
                        severity="major",
                        file="game/scenes/",
                        description=f"required scene `{expected}` is missing from generated scene manifests",
                        suggested_fix=f"Add a `{slug}.scene.json` manifest or adjust required_scenes.",
                    )
                )
        return issues

    @staticmethod
    def _check_acceptance_coverage(criteria: list[str]) -> list[Issue]:
        issues: list[Issue] = []
        for criterion in criteria:
            text = criterion.strip()
            if not text:
                continue
            lowered = text.lower()
            if "スマホ" in text or "mobile" in lowered:
                continue
            if "遊べ" in text or "play" in lowered or "クーポン" in text or "result" in lowered:
                continue
            issues.append(
                Issue(
                    severity="minor",
                    file=None,
                    description=f"acceptance criterion requires manual review: {text}",
                    suggested_fix="Confirm this criterion during manual QA or add a dedicated automated check.",
                )
            )
        return issues

    @staticmethod
    def _feedback_markdown(verdict: Verdict) -> str:
        if verdict.passed:
            return f"# Game Round {verdict.round} — PASSED\n\n{verdict.summary}\n"
        lines = [f"# Game Round {verdict.round} — FAILED", "", verdict.summary, ""]
        for issue in verdict.issues:
            where = issue.file or "(project)"
            lines.append(f"- [{issue.severity}] {where}: {issue.description}")
        return "\n".join(lines) + "\n"
