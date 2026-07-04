from __future__ import annotations

import json
import re


def extract_json(text: str) -> dict:
    """Extract the first JSON object from plain text or a markdown fence."""
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fence:
        return json.loads(fence.group(1))

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no JSON object found in model response")
    return json.loads(stripped[start : end + 1])
