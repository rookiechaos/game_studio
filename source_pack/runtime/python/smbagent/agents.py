from __future__ import annotations

from .config import Config


def build_anthropic_client(config: Config):
    try:
        import anthropic
    except ImportError as e:
        raise RuntimeError(
            "anthropic package is not installed — run `pip install anthropic`"
        ) from e

    if not config.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic(api_key=config.anthropic_api_key)
