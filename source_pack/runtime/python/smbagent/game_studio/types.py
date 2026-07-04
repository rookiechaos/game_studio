from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator


def slugify_label(name: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in (name or "").strip())
    safe = safe.strip("-_").lower()
    return safe or "scene"


class GamePackage(str, Enum):
    LITE = "lite"
    CAMPAIGN = "campaign"
    STUDIO = "studio"


class GameTemplate(str, Enum):
    QUIZ = "quiz"
    OMIKUJI = "omikuji"
    TAP = "tap"
    PUZZLE = "puzzle"
    VISUAL_NOVEL = "visual-novel"
    STAMP_RALLY = "stamp-rally"


GAME_PACKAGE_CAPS: dict[GamePackage, dict[str, int]] = {
    GamePackage.LITE: {"max_scenes": 3, "max_pages": 1, "max_ops": 2},
    GamePackage.CAMPAIGN: {"max_scenes": 6, "max_pages": 3, "max_ops": 4},
    GamePackage.STUDIO: {"max_scenes": 10, "max_pages": 5, "max_ops": 8},
}


class GameQualification(BaseModel):
    customer_id: str
    go: bool = Field(description="True if the request fits the supported game-product scope.")
    recommended_package: GamePackage | None = None
    recommended_templates: list[GameTemplate] = Field(default_factory=list)
    summary_ja: str = Field(description="Japanese rationale for the recommendation.")
    reasoning_en: str = Field(default="", description="Operator-facing notes in English.")

    @model_validator(mode="after")
    def _go_requires_package(self) -> GameQualification:
        if self.go and self.recommended_package is None:
            raise ValueError("go=True requires a recommended_package")
        if not self.go and self.recommended_package is not None:
            object.__setattr__(self, "recommended_package", None)
        return self


class GameRequirements(BaseModel):
    customer_id: str
    package: GamePackage
    project_name: str = Field(min_length=1, max_length=200)
    business_goal: str = Field(min_length=1, max_length=500)
    summary_ja: str = Field(min_length=1, max_length=2000)
    target_audience: list[str] = Field(default_factory=list)
    preferred_templates: list[GameTemplate] = Field(default_factory=list)
    core_mechanics: list[str] = Field(default_factory=list)
    required_scenes: list[str] = Field(default_factory=list)
    reward_flow: list[str] = Field(default_factory=list)
    brand_notes: list[str] = Field(default_factory=list)
    available_assets: list[str] = Field(default_factory=list)
    missing_assets: list[str] = Field(default_factory=list)
    analytics_events: list[str] = Field(default_factory=list)
    integrations: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)


class GameSceneSpec(BaseModel):
    name: str = Field(description="ASCII slug or route-friendly name, e.g. title, play, result.")
    purpose: str
    key_ui: list[str] = Field(default_factory=list)
    success_condition: str | None = None


class GameAssetSpec(BaseModel):
    name: str
    kind: str = Field(description="e.g. logo, background, character, bgm, sfx, copy")
    required: bool = True
    source: str = Field(description="customer-uploaded, placeholder, or ai-generated-preview")
    usage: list[str] = Field(default_factory=list)


class GameReleaseChecklist(BaseModel):
    checks: list[str] = Field(default_factory=list)


class GamePlan(BaseModel):
    package: GamePackage
    summary: str
    primary_template: GameTemplate
    scenes: list[GameSceneSpec] = Field(default_factory=list)
    assets: list[GameAssetSpec] = Field(default_factory=list)
    site_pages: list[str] = Field(default_factory=list)
    ops_features: list[str] = Field(default_factory=list)
    analytics_events: list[str] = Field(default_factory=list)

    def violates_package_caps(self) -> list[str]:
        caps = GAME_PACKAGE_CAPS[self.package]
        violations: list[str] = []
        if len(self.scenes) > caps["max_scenes"]:
            violations.append(
                f"{len(self.scenes)} scenes exceed {self.package.value} cap of {caps['max_scenes']}"
            )
        if len(self.site_pages) > caps["max_pages"]:
            violations.append(
                f"{len(self.site_pages)} site pages exceed {self.package.value} cap of {caps['max_pages']}"
            )
        if len(self.ops_features) > caps["max_ops"]:
            violations.append(
                f"{len(self.ops_features)} ops features exceed {self.package.value} cap of {caps['max_ops']}"
            )
        return violations
