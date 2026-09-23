# -*- coding: utf-8 -*-
# pylint: disable=redefined-outer-name,unused-argument,protected-access
"""Tests for the Kimi built-in provider."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

import qwenpaw.providers.provider_manager as provider_manager_module
from qwenpaw.providers.openai_provider import OpenAIProvider
from qwenpaw.providers.provider_manager import (
    KIMI_MODELS,
    PROVIDER_KIMI_CREC,
    ProviderManager,
)


def test_kimi_provider_is_openai_compatible() -> None:
    """Kimi provider should be an OpenAIProvider instance."""
    assert isinstance(PROVIDER_KIMI_CREC, OpenAIProvider)


def test_kimi_provider_config() -> None:
    """Verify Kimi provider configuration defaults."""
    assert PROVIDER_KIMI_CREC.id == "kimi-crec"
    assert PROVIDER_KIMI_CREC.name == "Kimi"
    assert PROVIDER_KIMI_CREC.base_url == "https://ai-api.crec.cn/v1"
    assert PROVIDER_KIMI_CREC.freeze_url is True


def test_kimi_models_list() -> None:
    """Verify Kimi model definitions."""
    model_ids = [m.id for m in KIMI_MODELS]
    assert "kimi" in model_ids
    assert "glm" not in model_ids
    assert len(KIMI_MODELS) == 1


@pytest.fixture
def isolated_secret_dir(monkeypatch, tmp_path):
    secret_dir = tmp_path / ".qwenpaw.secret"
    monkeypatch.setattr(provider_manager_module, "SECRET_DIR", secret_dir)
    return secret_dir


def test_kimi_registered_in_provider_manager(isolated_secret_dir) -> None:
    """Kimi provider should be registered as a built-in provider."""
    manager = ProviderManager()

    provider = manager.get_provider("kimi-crec")
    assert provider is not None
    assert isinstance(provider, OpenAIProvider)
    assert provider.base_url == "https://ai-api.crec.cn/v1"


async def test_kimi_check_connection_success(monkeypatch) -> None:
    """Kimi check_connection should delegate to OpenAI client."""
    provider = OpenAIProvider(
        id="kimi-crec",
        name="Kimi",
        base_url="https://ai-api.crec.cn/v1",
        api_key="test-key",
    )

    class FakeModels:
        async def list(self, timeout=None):
            return SimpleNamespace(data=[])

    fake_client = SimpleNamespace(models=FakeModels())
    monkeypatch.setattr(provider, "_client", lambda timeout=5: fake_client)

    ok, msg = await provider.check_connection(timeout=2)

    assert ok is True
    assert msg == ""


def test_kimi_has_expected_models(isolated_secret_dir) -> None:
    """Provider manager Kimi provider should include its built-in model."""
    manager = ProviderManager()
    provider = manager.get_provider("kimi-crec")

    assert provider is not None
    assert provider.has_model("kimi")


async def test_kimi_activate_model(
    isolated_secret_dir,
    monkeypatch,
) -> None:
    """Should be able to activate the Kimi provider."""
    manager = ProviderManager()

    await manager.activate_model("kimi-crec", "kimi")
    assert manager.active_model is not None
    assert manager.active_model.provider_id == "kimi-crec"
    assert manager.active_model.model == "kimi"
