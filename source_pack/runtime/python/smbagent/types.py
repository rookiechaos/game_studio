from __future__ import annotations

from pydantic import BaseModel, Field


class Issue(BaseModel):
    severity: str = Field(description="critical, major, or minor")
    file: str | None = None
    description: str
    suggested_fix: str = ""


class Verdict(BaseModel):
    passed: bool
    round: int
    summary: str
    issues: list[Issue] = Field(default_factory=list)
