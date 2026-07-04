from __future__ import annotations

import re
from pathlib import Path

from .types import Issue

_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
)


def redact_secrets(text: str) -> str:
    redacted = text
    for pattern in _SECRET_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


def scan_for_secrets(code_dir: Path) -> list[Issue]:
    issues: list[Issue] = []
    if not code_dir.is_dir():
        return issues

    for path in sorted(code_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern in _SECRET_PATTERNS:
            if pattern.search(text):
                rel = str(path.relative_to(code_dir))
                issues.append(
                    Issue(
                        severity="critical",
                        file=rel,
                        description="possible secret or API key detected in generated output",
                        suggested_fix="Remove secrets from generated files and rotate any exposed credentials.",
                    )
                )
                break
    return issues
