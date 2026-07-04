from __future__ import annotations

import json
import sys
from pathlib import Path

import typer
from rich.console import Console

from . import __version__
from .config import load_config
from .game_studio import GamePackage, run_all_game_structural_checks
from .game_studio.agents import GameNegotiationAgent, GamePlanAgent
from .game_studio.coding import GameCodingAgent
from .game_studio.qualify import GameQualifyAgent
from .game_studio.runtime_validation import GameValidationAgent
from .game_studio.templates import (
    AVAILABLE_GAME_SCAFFOLDS,
    GameTemplateError,
    materialize_game_scaffold,
)
from .workspace import Workspace

app = typer.Typer(help="Japan game campaign generation CLI.")
console = Console()


def _version_callback(value: bool) -> None:
    if value:
        console.print(f"game-studio {__version__}")
        raise typer.Exit()


@app.callback()
def _root(
    version: bool = typer.Option(
        False,
        "--version",
        "-V",
        callback=_version_callback,
        is_eager=True,
        help="Show version and exit.",
    ),
) -> None:
    """Game Studio CLI."""


def _resolve_game_package(package_str: str | None) -> GamePackage | None:
    if package_str is None:
        return None
    try:
        return GamePackage(package_str.lower())
    except ValueError as e:
        raise typer.BadParameter(
            f"package must be one of {[p.value for p in GamePackage]}"
        ) from e


@app.command()
def doctor():
    """Verify Python version, package imports, and workspace directory."""
    failed = 0
    checks: list[tuple[str, bool, str]] = []

    py_ok = sys.version_info >= (3, 11)
    checks.append(("python", py_ok, f"{sys.version_info.major}.{sys.version_info.minor}"))

    pkg_root = Path(__file__).resolve().parent
    checks.append(("prompts", (pkg_root / "prompts").is_dir(), str(pkg_root / "prompts")))
    checks.append(
        (
            "scaffold",
            (pkg_root / "templates" / "game-campaign-quiz").is_dir(),
            "game-campaign-quiz",
        )
    )

    cfg = load_config()
    cfg.workspaces_dir.mkdir(parents=True, exist_ok=True)
    checks.append(("workspaces_dir", cfg.workspaces_dir.is_dir(), str(cfg.workspaces_dir)))

    for name, ok, detail in checks:
        if ok:
            console.print(f"  [green]✓[/green]  {name}: [dim]{detail}[/dim]")
        else:
            failed += 1
            console.print(f"  [red]✗[/red]  {name}: {detail}")

    if failed:
        raise typer.Exit(code=1)
    console.print("[green]All checks passed.[/green]")


@app.command()
def new(customer_id: str = typer.Argument(..., help="Workspace id (folder-safe).")):
    """Create an empty game workspace."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()
    console.print(f"workspace created at [bold]{ws.path}[/bold]")


@app.command("qualify-game")
def qualify_game(
    customer_id: str = typer.Argument(...),
    brief: str = typer.Option(..., "--brief", "-b", help="One-or-two-sentence project description."),
):
    """Run the game qualification gate."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()
    q = GameQualifyAgent(cfg).run(ws, brief)
    color = "green" if q.go else "yellow"
    status_str = "GO" if q.go else "NO-GO"
    pkg = q.recommended_package.value if q.recommended_package else "(none)"
    templates = ", ".join(t.value for t in q.recommended_templates) or "(none)"
    console.print(f"[{color}]{status_str}[/{color}] — package: [bold]{pkg}[/bold]")
    console.print(f"templates: {templates}")
    console.print(q.summary_ja)


@app.command("negotiate-game")
def negotiate_game(
    customer_id: str = typer.Argument(...),
    package: str | None = typer.Option(
        None, "--package", "-p", help="Game package. Falls back to game_qualification.json."
    ),
):
    """Run game negotiation. Writes game_requirements.json."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()
    resolved = _resolve_game_package(package)
    if resolved is None:
        if not ws.game_qualification_path.exists():
            raise typer.BadParameter(
                "no --package and no game_qualification.json — run qualify-game first."
            )
        q = ws.load_game_qualification()
        if q.recommended_package is None:
            raise typer.BadParameter("qualification has no recommended_package; pass --package.")
        resolved = q.recommended_package
    GameNegotiationAgent(cfg).run(ws, package=resolved)


@app.command("plan-game")
def plan_game(customer_id: str = typer.Argument(...)):
    """Run the game plan stage from game_requirements.json."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()
    if not ws.game_requirements_path.exists():
        raise typer.BadParameter(f"game_requirements.json missing at {ws.game_requirements_path}")
    p = GamePlanAgent(cfg).run(ws)
    console.print(
        f"wrote game design artifacts: package={p.package.value}, "
        f"{len(p.scenes)} scenes, {len(p.site_pages)} pages, {len(p.ops_features)} ops"
    )


@app.command("check-game-structure")
def check_game_structure(
    customer_id: str = typer.Argument(...),
    package: str | None = typer.Option(None, "--package", "-p"),
):
    """Run structural checks against code/."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()
    resolved = _resolve_game_package(package)
    if resolved is None:
        if ws.game_requirements_path.exists():
            resolved = ws.load_game_requirements().package
        elif ws.game_qualification_path.exists():
            resolved = ws.load_game_qualification().recommended_package
    if resolved is None:
        raise typer.BadParameter("could not determine package — pass --package first.")
    issues = run_all_game_structural_checks(ws.code_dir, resolved)
    if issues:
        console.print_json(data=[issue.model_dump(mode="json") for issue in issues])
        raise typer.Exit(code=1)
    console.print("[green]Game structural checks passed.[/green]")


@app.command("validate-game")
def validate_game(
    customer_id: str = typer.Argument(...),
    round: int = typer.Option(1, "--round", "-r"),
):
    """Run the game validator and write a verdict under runs/game-round-N/."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()
    if not ws.game_requirements_path.exists():
        raise typer.BadParameter(f"game_requirements.json missing at {ws.game_requirements_path}")
    verdict = GameValidationAgent(cfg).run(ws, round)
    console.print(verdict.model_dump_json(indent=2))


@app.command("game-template")
def game_template(
    action: str = typer.Argument(..., help="`list` or `materialize`."),
    scaffold: str | None = typer.Argument(None, help="Scaffold name for materialize."),
    customer_id: str | None = typer.Option(None, "--customer", "-c"),
    mode: str = typer.Option("seed", "--mode", help="seed or overlay."),
):
    """Manage game scaffolds."""
    action_l = action.lower()
    if action_l == "list":
        console.print("Available game scaffolds:")
        for name in AVAILABLE_GAME_SCAFFOLDS:
            console.print(f"  - {name}")
        return
    if action_l != "materialize":
        raise typer.BadParameter(f"unknown action {action!r} — expected list or materialize")
    if scaffold is None or customer_id is None:
        raise typer.BadParameter("materialize requires scaffold name and --customer")
    if mode not in ("seed", "overlay"):
        raise typer.BadParameter("--mode must be seed or overlay")
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()
    try:
        report = materialize_game_scaffold(ws, scaffold, mode=mode)  # type: ignore[arg-type]
    except GameTemplateError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(code=1) from e
    console.print(f"[green]Materialized {scaffold!r} ({mode}) into {ws.code_dir}[/green]")
    console.print(f"  written: {len(report.written)}")


@app.command("status-game")
def status_game(customer_id: str = typer.Argument(...)):
    """Show game workspace artifact state."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    if not ws.path.exists():
        console.print(f"[red]no workspace at {ws.path}[/red]")
        raise typer.Exit(code=1)
    console.print(f"workspace: [bold]{ws.path}[/bold]")
    console.print(f"  game_qualification.json: {ws.game_qualification_path.exists()}")
    console.print(f"  game_requirements.json:  {ws.game_requirements_path.exists()}")
    console.print(f"  game_design.md:          {ws.game_design_path.exists()}")
    console.print(f"  game_plan.json:          {ws.game_plan_path.exists()}")
    console.print(f"  release_checklist.json:  {ws.release_checklist_path.exists()}")


@app.command("run-game")
def run_game(
    customer_id: str = typer.Argument(...),
    brief: str | None = typer.Option(None, "--brief", "-b"),
    package: str | None = typer.Option(None, "--package", "-p"),
    scaffold: str | None = typer.Option("campaign-quiz", "--scaffold"),
    round: int = typer.Option(1, "--round", "-r"),
    force_plan: bool = typer.Option(
        False, "--force-plan", help="Re-run planning even if game_plan.json exists."
    ),
):
    """Full game pipeline: qualify -> negotiate -> plan -> code -> validate."""
    cfg = load_config()
    ws = Workspace(customer_id, cfg.workspaces_dir)
    ws.ensure()

    resolved_package = _resolve_game_package(package)
    if resolved_package is None:
        if ws.game_qualification_path.exists():
            qualification = ws.load_game_qualification()
            resolved_package = qualification.recommended_package
        else:
            if brief is None:
                raise typer.BadParameter("--brief is required when game_qualification.json is missing.")
            qualification = GameQualifyAgent(cfg).run(ws, brief)
            if not qualification.go:
                console.print("[yellow]Project is not a fit for current scope.[/yellow]")
                console.print(qualification.summary_ja)
                raise typer.Exit(code=1)
            resolved_package = qualification.recommended_package

    if resolved_package is None:
        raise typer.BadParameter("could not determine package — pass --package.")

    if not ws.game_requirements_path.exists():
        GameNegotiationAgent(cfg).run(ws, package=resolved_package)
        console.print("game_requirements.json written.", style="green")
    else:
        console.print("game_requirements.json exists — skipping negotiation.", style="dim")

    if force_plan or not ws.game_plan_path.exists():
        plan = GamePlanAgent(cfg).run(ws)
        console.print(
            f"game plan written ({len(plan.scenes)} scenes, {len(plan.site_pages)} pages).",
            style="green",
        )
    else:
        console.print("game_plan.json exists — skipping planning.", style="dim")

    GameCodingAgent(cfg).run(ws, round, scaffold=scaffold or "campaign-quiz")
    console.print(f"coding artifacts written for round {round}.", style="green")

    verdict = GameValidationAgent(cfg).run(ws, round)
    if not verdict.passed:
        console.print_json(data=verdict.model_dump(mode="json"))
        raise typer.Exit(code=1)
    console.print("[green]Game pipeline completed. Validation passed.[/green]")


if __name__ == "__main__":
    app()
