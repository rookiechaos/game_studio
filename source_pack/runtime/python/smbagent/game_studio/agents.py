from __future__ import annotations

from collections.abc import Iterable

from .._jsonx import extract_json
from ..agents import build_anthropic_client
from ..config import Config
from ..workspace import Workspace
from .types import (
    GAME_PACKAGE_CAPS,
    GamePackage,
    GamePlan,
    GameReleaseChecklist,
    GameRequirements,
)


class GameNegotiationAgent:
    """Japanese game-builder interview that writes game_requirements.json."""

    MAX_TURNS = 30

    def __init__(self, config: Config):
        self.config = config
        self.client = None
        self._prompt_template = (
            config.prompts_dir / "game_negotiation_ja.md"
        ).read_text(encoding="utf-8")

    def run(self, workspace: Workspace, package: GamePackage) -> GameRequirements:
        system_prompt = self._build_system_prompt(package)
        messages: list[dict] = []
        transcript_lines: list[str] = []

        opening = (
            "こんにちは。ゲーム企画づくりをお手伝いします。"
            "まず、このゲームで達成したい目的を教えてください。"
        )
        self._speak(opening)
        transcript_lines.append(f"AGENT: {opening}")

        for _ in range(self.MAX_TURNS):
            user_text = self._listen()
            if not user_text.strip():
                continue
            transcript_lines.append(f"USER: {user_text}")
            messages.append({"role": "user", "content": user_text})

            response_text = self._ask_claude(messages, system_prompt)
            messages.append({"role": "assistant", "content": response_text})

            done, requirements_payload = self._try_extract_done(response_text)
            if done:
                transcript_lines.append(f"AGENT (final): {response_text}")
                workspace.game_transcript_path.write_text(
                    "\n\n".join(transcript_lines), encoding="utf-8"
                )
                requirements = GameRequirements(
                    customer_id=workspace.customer_id,
                    package=package,
                    **requirements_payload,
                )
                workspace.save_game_requirements(requirements)
                self._speak("ありがとうございます。ゲーム要件を整理できました。")
                return requirements

            self._speak(response_text)
            transcript_lines.append(f"AGENT: {response_text}")

        raise RuntimeError(
            f"Game negotiation did not converge after {self.MAX_TURNS} turns. "
            f"Inspect transcript at {workspace.game_transcript_path}"
        )

    def _listen(self) -> str:
        try:
            return input("YOU> ").strip()
        except EOFError:
            return ""

    def _speak(self, text: str) -> None:
        print(f"AGENT> {text}")

    def _build_system_prompt(self, package: GamePackage) -> str:
        caps = GAME_PACKAGE_CAPS[package]
        return (
            self._prompt_template
            + "\n\n# 現在のパッケージ\n\n"
            + f"- package: {package.value}\n"
            + f"- max scenes: {caps['max_scenes']}\n"
            + f"- max site pages: {caps['max_pages']}\n"
            + f"- max ops features: {caps['max_ops']}\n"
        )

    def _ask_claude(self, messages: Iterable[dict], system_prompt: str) -> str:
        client = self.client or build_anthropic_client(self.config)
        response = client.messages.create(
            model=self.config.plan_model,
            max_tokens=2500,
            system=system_prompt,
            messages=list(messages),
        )
        return "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )

    @staticmethod
    def _try_extract_done(text: str) -> tuple[bool, dict]:
        try:
            data = extract_json(text)
        except ValueError:
            return False, {}
        if not isinstance(data, dict) or not data.get("done"):
            return False, {}
        req = data.get("requirements")
        if not isinstance(req, dict):
            return False, {}
        return True, req


class GamePlanAgent:
    """Turns game requirements into a constrained game plan."""

    def __init__(self, config: Config):
        self.config = config
        self.client = None
        self.system_prompt = (config.prompts_dir / "game_plan.md").read_text(encoding="utf-8")

    def run(self, workspace: Workspace) -> GamePlan:
        requirements = workspace.load_game_requirements()
        transcript = (
            workspace.game_transcript_path.read_text(encoding="utf-8")
            if workspace.game_transcript_path.exists()
            else "(no game transcript available)"
        )

        user_msg = (
            "# game_requirements.json\n\n"
            f"```json\n{requirements.model_dump_json(indent=2)}\n```\n\n"
            "# transcript (Japanese)\n\n"
            f"{transcript}\n"
        )

        client = self.client or build_anthropic_client(self.config)
        response = client.messages.create(
            model=self.config.plan_model,
            max_tokens=8000,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        payload = extract_json(text)
        plan = GamePlan.model_validate(payload["plan"])
        design_md = payload["design_markdown"]

        if plan.package != requirements.package:
            raise ValueError(
                f"Game plan package {plan.package.value} does not match "
                f"requirements package {requirements.package.value}"
            )
        violations = plan.violates_package_caps()
        if violations:
            raise ValueError(
                f"Game plan exceeds {plan.package.value} package caps: " + "; ".join(violations)
            )

        checklist = GameReleaseChecklist(
            checks=[
                *[f"Acceptance: {item}" for item in requirements.acceptance_criteria],
                "Confirm mobile browser playability",
                "Confirm JP UI text layout",
                "Confirm result/reward flow",
            ]
        )
        workspace.save_game_plan(plan, design_md, checklist)
        return plan
