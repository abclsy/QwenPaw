# -*- coding: utf-8 -*-
"""Unit tests for the ask/plan/craft work modes on QwenPawAgent.

The work modes are a lightweight, per-query agent assembly:
- craft (default): unchanged behavior — toolkit with tools,
  configured max_iters, MCP registration allowed.
- ask: no toolkit, max_iters=1, no MCP / memory tool registration,
  and a hard refusal gate in _acting if a tool call slips through.
- plan: handled at runner level (plan notebook implied); agent-side
  behavior identical to craft, gated by the existing plan tool gate.

These tests use a stub model and a minimal agent config so they run
without network or a real LLM provider.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from qwenpaw.agents.react_agent import QwenPawAgent
from qwenpaw.config.config import (
    AgentProfileConfig,
    AgentsRunningConfig,
)


def _make_agent_config() -> AgentProfileConfig:
    cfg = AgentProfileConfig(id="test-modes", name="test-modes")
    cfg.running = AgentsRunningConfig(max_iters=500)
    return cfg


def _make_agent(mode: str) -> QwenPawAgent:
    # Stub out model creation — mode logic must not depend on the model.
    QwenPawAgent._create_toolkit = lambda self, namesake_strategy="skip": MagicMock()
    QwenPawAgent._register_skills = lambda self, toolkit: None
    QwenPawAgent._build_sys_prompt = lambda self: "stub prompt"
    QwenPawAgent._register_hooks = lambda self: None

    import qwenpaw.agents.react_agent as ra

    ra.create_model_and_formatter = lambda agent_id: (MagicMock(), MagicMock())

    class _FakeMemory:
        def add(self, *_a, **_k):
            return None

    from agentscope.memory import InMemoryMemory  # noqa: F401

    agent = QwenPawAgent.__new__(QwenPawAgent)

    # Invoke __init__ with stubs via object.__new__ trickery is messy;
    # instead run the real __init__ with the patched methods above.
    agent = QwenPawAgent(
        agent_config=_make_agent_config(),
        env_context=None,
        mcp_clients=[],
        memory_manager=None,
        context_manager=None,
        request_context={},
        workspace_dir=None,
        task_tracker=None,
        plan_notebook=None,
        mode=mode,
    )
    return agent


class TestWorkModeAssembly:
    def test_craft_default_mode(self):
        agent = _make_agent("craft")
        assert agent.work_mode == "craft"

    def test_ask_mode_keeps_toolkit_with_capped_iters(self):
        agent = _make_agent("ask")
        assert agent.work_mode == "ask"
        # Ask mode keeps a toolkit (read-only tools allowed) but caps
        # iterations to keep replies fast.
        assert agent.max_iters <= 20

    def test_unknown_mode_falls_back_to_craft(self):
        agent = _make_agent("bogus-mode")
        assert agent.work_mode == "craft"

    @pytest.mark.asyncio
    async def test_ask_mode_refuses_tool_calls(self):
        agent = _make_agent("ask")
        agent.print = AsyncMock()
        agent.memory = MagicMock()
        agent.memory.add = AsyncMock()

        # Write tool must be refused with a visible notice.
        write_call = {"id": "call-1", "name": "write_file", "arguments": {}}
        assert await agent._acting(write_call) is None
        agent.print.assert_awaited_once()

        # Read-only tool must pass through to the parent executor.
        agent.print.reset_mock()
        from qwenpaw.agents.tool_guard_mixin import ToolGuardMixin

        async def tgm_acting(self, tool_call):
            return {"type": "tool_result", "output": "ok"}

        ToolGuardMixin._acting = tgm_acting
        try:
            read_call = {
                "id": "call-2",
                "name": "read_file",
                "arguments": {},
            }
            result = await agent._acting(read_call)
            assert result is not None
            agent.print.assert_not_awaited()
        finally:
            del ToolGuardMixin._acting

    @pytest.mark.asyncio
    async def test_craft_mode_allows_tool_calls(self):
        agent = _make_agent("craft")
        # Neutralize the plan gate path (no plan_notebook → skipped)
        agent.plan_notebook = None
        # Parent _acting would actually execute; stub the superclass path
        # by patching ToolGuardMixin behavior via the MRO: instead just
        # assert the ask-gate did NOT trigger (print not called).
        agent.print = AsyncMock()
        import agentscope.message as am

        agent.memory = MagicMock()
        agent.memory.add = AsyncMock()

        # Patch super()._acting via type() to return a canned result
        orig_acting = QwenPawAgent._acting
        called = {"refused": False}

        async def fake_super_acting(self, tool_call):
            # Simulate parent: if we got here, the ask gate passed.
            return {"type": "tool_result", "output": "ok"}

        # Temporarily make the plan-gate branch a no-op and parent exec fake
        QwenPawAgent._acting.__wrapped__ if hasattr(QwenPawAgent._acting, "__wrapped__") else None
        # Simplest: call _acting on a craft agent where plan tools list
        # check fails harmlessly and ToolGuardMixin._acting is stubbed.
        from qwenpaw.agents.tool_guard_mixin import ToolGuardMixin

        async def tgm_acting(self, tool_call):
            return {"type": "tool_result", "output": "ok"}

        ToolGuardMixin._acting = tgm_acting
        try:
            tool_call = {"id": "call-2", "name": "read_file", "arguments": {}}
            result = await agent._acting(tool_call)
            assert result is not None
            assert result["output"] == "ok"
            agent.print.assert_not_awaited()
        finally:
            del ToolGuardMixin._acting
