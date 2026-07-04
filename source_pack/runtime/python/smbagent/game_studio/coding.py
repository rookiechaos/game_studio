from __future__ import annotations

import json

from ..config import Config
from ..safety import redact_secrets
from ..workspace import Workspace
from .templates import materialize_game_scaffold
from .types import GamePlan, slugify_label


class GameCodingAgent:
    """Deterministic game package materializer based on the game plan.

    Unlike the SMB coding agent, this first implementation does not invoke an
    external CLI model. It seeds a scaffold, then normalizes artifacts from the
    saved game-plan files into the fixed game package shape.
    """

    def __init__(self, config: Config):
        self.config = config

    def run(
        self,
        workspace: Workspace,
        round_n: int,
        *,
        scaffold: str = "campaign-quiz",
    ) -> None:
        plan = workspace.load_game_plan()
        requirements = workspace.load_game_requirements()
        report = materialize_game_scaffold(workspace, scaffold, mode="seed")

        self._write_scene_manifests(workspace, plan)
        self._write_site_index(workspace, plan, requirements.project_name, requirements.summary_ja)
        self._write_ops_files(workspace, plan)
        self._write_analytics_events(workspace, plan)
        self._write_root_readme(workspace, plan, requirements.project_name)

        log_lines = [
            f"scaffold: {scaffold}",
            f"written_from_scaffold: {len(report.written)}",
            f"skipped_from_scaffold: {len(report.skipped)}",
            f"scenes: {len(plan.scenes)}",
            f"site_pages: {len(plan.site_pages)}",
            f"ops_features: {len(plan.ops_features)}",
        ]
        workspace.game_coding_log_path(round_n).write_text(
            redact_secrets("\n".join(log_lines) + "\n"),
            encoding="utf-8",
        )

    def _write_scene_manifests(self, workspace: Workspace, plan: GamePlan) -> None:
        scenes_dir = workspace.code_dir / "game" / "scenes"
        scenes_dir.mkdir(parents=True, exist_ok=True)
        for scene in plan.scenes:
            slug = slugify_label(scene.name)
            payload = {
                "name": scene.name,
                "purpose": scene.purpose,
                "key_ui": scene.key_ui,
                "success_condition": scene.success_condition,
            }
            (scenes_dir / f"{slug}.scene.json").write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    def _write_site_index(
        self,
        workspace: Workspace,
        plan: GamePlan,
        project_name: str,
        summary_ja: str,
    ) -> None:
        site_dir = workspace.code_dir / "site"
        site_dir.mkdir(parents=True, exist_ok=True)
        pages = plan.site_pages or ["index"]
        for page in pages:
            slug = slugify_label(page) if page not in {"index", "/"} else "index"
            filename = "index.html" if slug == "index" else f"{slug}.html"
            primary_cta = "ゲームを始める"
            if slug != "index" and plan.ops_features:
                primary_cta = "結果を見る"
            html = (
                "<!doctype html>\n"
                "<html lang=\"ja\">\n"
                "<head>\n"
                "  <meta charset=\"utf-8\">\n"
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
                f"  <title>{project_name}</title>\n"
                "</head>\n"
                "<body>\n"
                "  <main>\n"
                f"    <h1>{project_name}</h1>\n"
                f"    <p>{summary_ja}</p>\n"
                f"    <p>テンプレート: {plan.primary_template.value}</p>\n"
                f"    <a href=\"../game/\">{primary_cta}</a>\n"
                "  </main>\n"
                "</body>\n"
                "</html>\n"
            )
            (site_dir / filename).write_text(html, encoding="utf-8")

    def _write_ops_files(self, workspace: Workspace, plan: GamePlan) -> None:
        ops_dir = workspace.code_dir / "ops"
        ops_dir.mkdir(parents=True, exist_ok=True)
        for feature in plan.ops_features:
            slug = slugify_label(feature)
            if slug == "readme":
                slug = "ops-feature"
            path = ops_dir / f"{slug}.md"
            if not path.exists():
                path.write_text(f"# {feature}\n\nGenerated ops note for {feature}.\n", encoding="utf-8")

    def _write_analytics_events(self, workspace: Workspace, plan: GamePlan) -> None:
        analytics_dir = workspace.code_dir / "analytics"
        analytics_dir.mkdir(parents=True, exist_ok=True)
        events = plan.analytics_events or ["page_view", "game_start", "game_complete"]
        (analytics_dir / "events.json").write_text(
            json.dumps({"events": events}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _write_root_readme(self, workspace: Workspace, plan: GamePlan, project_name: str) -> None:
        readme = (
            f"# {project_name}\n\n"
            "Generated game package.\n\n"
            "## Layout\n\n"
            "- `game/` playable scene manifests\n"
            "- `site/` campaign pages\n"
            "- `assets/` brand and placeholder assets\n"
            "- `ops/` campaign operation files\n"
            "- `analytics/` event declarations\n\n"
            f"Primary template: `{plan.primary_template.value}`\n"
        )
        (workspace.code_dir / "README.md").write_text(readme, encoding="utf-8")
