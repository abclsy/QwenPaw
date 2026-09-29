# -*- coding: utf-8 -*-
# flake8: noqa: E501
"""Streaming prompt enhancement API (the "sparkle button").

Takes a rough, one-line user request and rewrites it into a complete,
structured task prompt — goal, scope, constraints, expected output.
Modeled on WorkBuddy's input-area prompt optimizer.
"""
import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agentscope_runtime.engine.schemas.exception import (
    AppBaseException,
)

from ...agents.model_factory import create_model_and_formatter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["prompt"])

SYSTEM_PROMPTS = {
    "zh": """你是提示词优化专家。用户会给你一句模糊的、口语化的需求描述，请把它扩写成一条结构清晰、可直接发给 AI 智能体执行的完整任务指令。

## 输出要求
- 直接输出优化后的指令文本，不要任何解释、不要代码块标记
- 使用用户的语言（用户中文你就中文）
- 长度控制在 200 字以内，不要过度膨胀

## 扩写规则
1. 明确目标：要产出什么
2. 明确范围：处理什么对象/文件/数据，排除什么
3. 补充合理约束：输出格式（如 Excel/Word/Markdown）、风格、数量
4. 如果需求涉及文件操作，加入安全约束（不删除、移动到备份目录等）
5. 只补全用户意图中合理隐含的内容，不要虚构新需求
6. 保留用户原始表述中的具体信息（文件名、日期、数字等）""",
    "en": """You are a prompt optimization expert. The user gives you a rough, colloquial one-liner request; rewrite it into a complete, structured task prompt ready to send to an AI agent.

## Output requirements
- Output the optimized prompt text directly; no explanations, no code fences
- Use the user's language
- Keep it under 200 words; do not bloat

## Rules
1. Clarify the goal: what deliverable is expected
2. Clarify the scope: which files/data, what is excluded
3. Add sensible constraints: output format, style, quantity
4. For file operations, add safety constraints (no deletion, move to backup, etc.)
5. Only complete what is reasonably implied; never invent new requirements
6. Preserve every concrete detail the user gave (names, dates, numbers)""",
}


class EnhancePromptRequest(BaseModel):
    content: str = Field(..., description="Rough user input to enhance")
    language: str = Field(
        default="zh",
        description="Language hint (zh, en)",
    )


def _get_model():
    try:
        model, _ = create_model_and_formatter()
        return model
    except (ValueError, AppBaseException) as e:
        logger.warning("Failed to get model for prompt enhance: %s", e)
        return None


def _extract_text_from_chunk(chunk) -> str:
    if not hasattr(chunk, "content"):
        return ""
    if isinstance(chunk.content, str):
        return chunk.content
    if isinstance(chunk.content, list):
        for item in chunk.content:
            if isinstance(item, dict) and "text" in item:
                return item["text"]
    return ""


@router.post("/console/prompt/enhance")
async def enhance_prompt_stream(request: EnhancePromptRequest):
    """Rewrite a rough one-liner into a structured task prompt (SSE)."""

    async def generate():
        try:
            content = (request.content or "").strip()
            if not content:
                yield f"data: {json.dumps({'error': 'empty input'})}\n\n"
                return

            model = _get_model()
            if model is None:
                yield (
                    "data: "
                    + json.dumps(
                        {
                            "error": (
                                "未配置 AI 模型，请先在设置中配置模型。"
                                "No AI model configured."
                            ),
                        },
                        ensure_ascii=False,
                    )
                    + "\n\n"
                )
                return

            system_prompt = SYSTEM_PROMPTS.get(
                request.language,
                SYSTEM_PROMPTS["zh"],
            )
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content},
            ]

            response = await model(messages)
            accumulated = ""

            if hasattr(response, "__aiter__"):
                async for chunk in response:
                    text = _extract_text_from_chunk(chunk)
                    if text and len(text) > len(accumulated):
                        delta = text[len(accumulated) :]
                        accumulated = text
                        yield (
                            "data: "
                            + json.dumps(
                                {"text": delta}, ensure_ascii=False,
                            )
                            + "\n\n"
                        )
            else:
                text = (
                    getattr(response, "text", "")
                    if not isinstance(response, str)
                    else response
                )
                if text:
                    yield (
                        "data: "
                        + json.dumps({"text": text}, ensure_ascii=False)
                        + "\n\n"
                    )

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            logger.exception("Prompt enhance failed: %s", e)
            yield (
                "data: "
                + json.dumps(
                    {"error": f"Failed to enhance prompt: {e}"},
                    ensure_ascii=False,
                )
                + "\n\n"
            )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
