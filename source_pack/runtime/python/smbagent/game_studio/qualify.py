from __future__ import annotations

from .._jsonx import extract_json
from ..agents import build_anthropic_client
from ..config import Config
from ..workspace import Workspace
from .types import GamePackage, GameQualification, GameTemplate


class GameQualifyAgent:
    """Pre-negotiation gate for game projects."""

    def __init__(self, config: Config):
        self.config = config
        self.client = None
        self.system_prompt = (config.prompts_dir / "game_qualify_ja.md").read_text(encoding="utf-8")

    def run(self, workspace: Workspace, customer_brief: str) -> GameQualification:
        client = self.client or build_anthropic_client(self.config)
        response = client.messages.create(
            model=self.config.plan_model,
            max_tokens=1000,
            system=self.system_prompt,
            messages=[{"role": "user", "content": customer_brief}],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        payload = extract_json(text)

        rec = payload.get("recommended_package")
        if isinstance(rec, str):
            try:
                payload["recommended_package"] = GamePackage(rec.lower())
            except ValueError:
                payload["recommended_package"] = None

        templates = payload.get("recommended_templates")
        if isinstance(templates, list):
            coerced: list[GameTemplate] = []
            for item in templates:
                if not isinstance(item, str):
                    continue
                try:
                    coerced.append(GameTemplate(item.lower()))
                except ValueError:
                    continue
            payload["recommended_templates"] = coerced

        qualification = GameQualification(customer_id=workspace.customer_id, **{
            k: v for k, v in payload.items() if k != "customer_id"
        })
        workspace.save_game_qualification(qualification)
        return qualification
