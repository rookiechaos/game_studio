"""Parallel game-studio scaffolding.

This package is intentionally additive: it defines the first game-native schema
layer without changing the default SMB pipeline.
"""

from .types import (
    GameAssetSpec,
    GamePackage,
    GamePlan,
    GameQualification,
    GameRequirements,
    GameReleaseChecklist,
    GameSceneSpec,
    GameTemplate,
)
from .validation import (
    enforce_game_package_caps,
    enforce_required_game_artifacts,
    run_all_game_structural_checks,
    validate_game_analytics_events,
    validate_game_scene_manifests,
)

__all__ = [
    "GameAssetSpec",
    "GamePackage",
    "GamePlan",
    "GameQualification",
    "GameRequirements",
    "GameReleaseChecklist",
    "GameSceneSpec",
    "GameTemplate",
    "enforce_game_package_caps",
    "enforce_required_game_artifacts",
    "run_all_game_structural_checks",
    "validate_game_analytics_events",
    "validate_game_scene_manifests",
]
