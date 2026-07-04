from __future__ import annotations

import json
from pathlib import Path

from ..safety import scan_for_secrets
from ..types import Issue
from .types import GAME_PACKAGE_CAPS, GamePackage


def _real_page_files(site_dir: Path) -> list[Path]:
    page_exts = {".html", ".tsx", ".jsx"}
    partials = {"_app", "_document", "layout", "head", "_partial"}
    pages: list[Path] = []
    for path in sorted(site_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix not in page_exts:
            continue
        if path.stem.startswith("_") or path.stem.lower() in partials:
            continue
        pages.append(path)
    return pages


def enforce_required_game_artifacts(code_dir: Path) -> list[Issue]:
    issues: list[Issue] = []
    if not code_dir.is_dir():
        return [
            Issue(
                severity="critical",
                file=None,
                description="code/ directory does not exist — the game coding agent produced no output",
                suggested_fix="Re-run the game coding stage and ensure it can write to code/.",
            )
        ]

    required_dirs = {
        "game/": code_dir / "game",
        "game/scenes/": code_dir / "game" / "scenes",
        "site/": code_dir / "site",
        "assets/": code_dir / "assets",
        "ops/": code_dir / "ops",
        "analytics/": code_dir / "analytics",
    }
    for rel, path in required_dirs.items():
        if not path.is_dir():
            issues.append(
                Issue(
                    severity="critical",
                    file=rel,
                    description=f"{rel} is missing",
                    suggested_fix=f"Generate the required {rel} directory.",
                )
            )

    root_readme = code_dir / "README.md"
    if not root_readme.exists() or root_readme.stat().st_size == 0:
        issues.append(
            Issue(
                severity="critical",
                file="README.md",
                description="code/README.md is missing or empty",
                suggested_fix="Add a top-level README describing the game package layout.",
            )
        )

    game_readme = code_dir / "game" / "README.md"
    if game_readme.exists() and game_readme.stat().st_size == 0:
        issues.append(
            Issue(
                severity="major",
                file="game/README.md",
                description="game/README.md exists but is empty",
                suggested_fix="Describe the game runtime and scene flow.",
            )
        )

    scenes_dir = code_dir / "game" / "scenes"
    scene_files = sorted(scenes_dir.glob("*.scene.json")) if scenes_dir.is_dir() else []
    if scenes_dir.is_dir() and not scene_files:
        issues.append(
            Issue(
                severity="critical",
                file="game/scenes/",
                description="game/scenes/ exists but contains no .scene.json files",
                suggested_fix="Generate at least one scene manifest under game/scenes/.",
            )
        )

    site_dir = code_dir / "site"
    if site_dir.is_dir() and not _real_page_files(site_dir):
        issues.append(
            Issue(
                severity="critical",
                file="site/",
                description="site/ exists but contains no real page files (.html / .tsx / .jsx)",
                suggested_fix="Generate at least index.html for the campaign site.",
            )
        )

    analytics_events = code_dir / "analytics" / "events.json"
    if not analytics_events.exists():
        issues.append(
            Issue(
                severity="major",
                file="analytics/events.json",
                description="analytics/events.json is missing",
                suggested_fix="Declare the emitted analytics events in analytics/events.json.",
            )
        )

    return issues


def enforce_game_package_caps(code_dir: Path, package: GamePackage) -> list[Issue]:
    caps = GAME_PACKAGE_CAPS[package]
    issues: list[Issue] = []

    scene_count = 0
    scenes_dir = code_dir / "game" / "scenes"
    if scenes_dir.is_dir():
        scene_count = sum(1 for p in scenes_dir.glob("*.scene.json") if p.is_file())
    if scene_count > caps["max_scenes"]:
        issues.append(
            Issue(
                severity="critical",
                file="game/scenes/",
                description=(
                    f"{scene_count} scenes exceed {package.value} cap of {caps['max_scenes']}"
                ),
                suggested_fix=f"Reduce to ≤ {caps['max_scenes']} scene manifests.",
            )
        )

    page_count = 0
    site_dir = code_dir / "site"
    if site_dir.is_dir():
        page_count = len(_real_page_files(site_dir))
    if page_count > caps["max_pages"]:
        issues.append(
            Issue(
                severity="critical",
                file="site/",
                description=(
                    f"{page_count} site pages exceed {package.value} cap of {caps['max_pages']}"
                ),
                suggested_fix=f"Reduce to ≤ {caps['max_pages']} site pages.",
            )
        )

    ops_count = 0
    ops_dir = code_dir / "ops"
    if ops_dir.is_dir():
        ops_count = sum(
            1
            for p in ops_dir.iterdir()
            if p.is_file() and p.name != "README.md"
        )
    if ops_count > caps["max_ops"]:
        issues.append(
            Issue(
                severity="critical",
                file="ops/",
                description=(
                    f"{ops_count} ops features exceed {package.value} cap of {caps['max_ops']}"
                ),
                suggested_fix=f"Reduce to ≤ {caps['max_ops']} ops feature files.",
            )
        )

    return issues


def validate_game_scene_manifests(code_dir: Path) -> list[Issue]:
    issues: list[Issue] = []
    scenes_dir = code_dir / "game" / "scenes"
    if not scenes_dir.is_dir():
        return issues

    for path in sorted(scenes_dir.glob("*.scene.json")):
        rel = str(path.relative_to(code_dir))
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
            issues.append(
                Issue(
                    severity="major",
                    file=rel,
                    description=f"scene manifest is unreadable JSON: {e}",
                    suggested_fix="Write valid JSON with name, purpose, and key_ui fields.",
                )
            )
            continue

        if not isinstance(data, dict):
            issues.append(
                Issue(
                    severity="major",
                    file=rel,
                    description="scene manifest must be a JSON object",
                    suggested_fix="Use an object with name, purpose, key_ui, and success_condition.",
                )
            )
            continue

        missing: list[str] = []
        if not isinstance(data.get("name"), str) or not data.get("name", "").strip():
            missing.append("name")
        if not isinstance(data.get("purpose"), str) or not data.get("purpose", "").strip():
            missing.append("purpose")
        if not isinstance(data.get("key_ui"), list):
            missing.append("key_ui")
        if missing:
            issues.append(
                Issue(
                    severity="major",
                    file=rel,
                    description=f"scene manifest missing required fields: {', '.join(missing)}",
                    suggested_fix="Populate name, purpose, and key_ui in the scene manifest.",
                )
            )

    return issues


def validate_game_analytics_events(code_dir: Path) -> list[Issue]:
    path = code_dir / "analytics" / "events.json"
    if not path.exists():
        return []
    rel = str(path.relative_to(code_dir))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
        return [
            Issue(
                severity="major",
                file=rel,
                description=f"analytics events file is unreadable JSON: {e}",
                suggested_fix="Write valid JSON with an events array.",
            )
        ]
    if not isinstance(data, dict) or not isinstance(data.get("events"), list):
        return [
            Issue(
                severity="major",
                file=rel,
                description="analytics/events.json must contain an `events` array",
                suggested_fix="Define {\"events\": [...]} with the emitted analytics events.",
            )
        ]
    return []


def run_all_game_structural_checks(code_dir: Path, package: GamePackage) -> list[Issue]:
    return [
        *enforce_required_game_artifacts(code_dir),
        *scan_for_secrets(code_dir),
        *enforce_game_package_caps(code_dir, package),
        *validate_game_scene_manifests(code_dir),
        *validate_game_analytics_events(code_dir),
    ]
