# -*- coding: utf-8 -*-
"""Built-in expert team API (中国中铁专家团队).

Provides the registry of built-in domain experts and an endpoint to
create (or reuse) the agent backing a given expert. Expert personas are
stored as workspace MD templates under
``src/qwenpaw/agents/md_files/experts/<expert_id>/zh/`` and are applied
when the agent workspace is initialized.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config.utils import load_config
from .agents import CreateAgentRequest, create_agent as _create_agent_impl

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/experts", tags=["experts"])

# experts.py lives at src/qwenpaw/app/routers/ → parents[2] is src/qwenpaw
_EXPERTS_ROOT = (
    Path(__file__).resolve().parents[2] / "agents" / "md_files" / "experts"
)

# ── Expert registry ─────────────────────────────────────────────────────────
# Display metadata for the built-in expert team. ``id`` doubles as the MD
# template directory name under md_files/experts/.


class ExpertInfo(BaseModel):
    id: str
    name: str
    title: str
    category: str
    description: str
    tags: list[str]
    scenarios: list[str]
    emoji: str
    gradient: list[str]


class ExpertListResponse(BaseModel):
    experts: list[ExpertInfo]
    categories: list[str]


class ExpertAgentResponse(BaseModel):
    expert_id: str
    agent_id: str
    workspace_dir: str
    created: bool


_BUILTIN_EXPERTS: list[dict] = [
    {
        "id": "bridge-tunnel",
        "name": "桥隧工程技术专家",
        "title": "教授级高工 · 桥梁与隧道工程",
        "category": "工程技术",
        "description": (
            "深耕桥梁隧道设计与施工三十余年，精通大跨径桥梁施工控制、"
            "盾构/TBM 隧道掘进、矿山法隧道超前地质预报与风险管控，"
            "可为复杂桥隧工程提供方案比选、施工组织与技术攻关支持。"
        ),
        "tags": ["桥梁工程", "隧道与地下工程", "施工控制", "风险管控"],
        "scenarios": [
            "桥隧施工方案比选与技术评审",
            "盾构/TBM 选型与掘进参数优化",
            "隧道超前地质预报与塌方风险处置",
            "大跨径桥梁线形控制与合龙方案",
        ],
        "emoji": "🌉",
        "gradient": ["#1e5799", "#2989d8", "#7db9e8"],
    },
    {
        "id": "construction-org",
        "name": "施工组织设计专家",
        "title": "教授级高工 · 施工组织与管理",
        "category": "工程技术",
        "description": (
            "精通铁路、公路、市政工程的施工组织设计编制与优化，"
            "熟悉网络计划技术、资源配置与工期论证，"
            "擅长将施组方案转化为可落地的进度、资源与成本计划。"
        ),
        "tags": ["施工组织设计", "网络计划", "资源配置", "工期优化"],
        "scenarios": [
            "施组设计方案编制与优化",
            "关键线路分析与工期压缩论证",
            "人材机资源配置计划编制",
            "架梁/铺轨等重大专项方案策划",
        ],
        "emoji": "🏗️",
        "gradient": ["#8e6e2f", "#b8860b", "#d4a537"],
    },
    {
        "id": "test-inspection",
        "name": "工程试验检测专家",
        "title": "正高级工程师 · 试验检测",
        "category": "工程技术",
        "description": (
            "熟悉铁路与公路工程试验检测规程，精通混凝土配合比设计、"
            "原材料检验、地基基础检测与无损检测技术，"
            "可为质量通病防治和检测数据分析提供专业支持。"
        ),
        "tags": ["试验检测", "混凝土配合比", "无损检测", "质量数据分析"],
        "scenarios": [
            "混凝土配合比设计与优化",
            "原材料与实体质量检测方案制定",
            "检测数据异常分析与处置建议",
            "质量通病成因分析与防治措施",
        ],
        "emoji": "🔬",
        "gradient": ["#3a6186", "#5c85a8", "#89b5d4"],
    },
    {
        "id": "safety-quality",
        "name": "安全质量监督专家",
        "title": "教授级高工 · 安全质量管理",
        "category": "安全质量",
        "description": (
            "熟悉安全生产法律法规与铁路工程质量验收标准，"
            "精通双重预防机制（风险分级管控+隐患排查治理）、"
            "危大工程管理与事故调查分析，助力项目筑牢安全质量防线。"
        ),
        "tags": ["双重预防机制", "危大工程", "隐患排查", "事故分析"],
        "scenarios": [
            "安全风险分级管控清单编制",
            "隐患排查方案与整改闭环管理",
            "危大工程专项方案审查要点",
            "安全事故/质量事件调查分析",
        ],
        "emoji": "🦺",
        "gradient": ["#c0392b", "#e67e22", "#f39c12"],
    },
    {
        "id": "contract-commercial",
        "name": "商务合约专家",
        "title": "正高级经济师 · 商务与合约管理",
        "category": "商务法务",
        "description": (
            "精通工程招投标、合同策划、变更索赔与结算管理，"
            "熟悉铁路与建设工程工程量清单计价规范，"
            "擅长从投标策划到竣工结算的全过程商务创效。"
        ),
        "tags": ["招投标", "合同管理", "变更索赔", "造价管理"],
        "scenarios": [
            "投标报价策略与成本测算",
            "合同条款风险审查与策划",
            "变更与索赔机会识别、证据链组织",
            "验工计价与竣工结算要点梳理",
        ],
        "emoji": "📑",
        "gradient": ["#4b3869", "#6c50a4", "#9a7bd1"],
    },
    {
        "id": "legal-compliance",
        "name": "法律合规专家",
        "title": "公司律师 · 建设工程法律",
        "category": "商务法务",
        "description": (
            "专注建设工程与公司法务领域，熟悉《民法典》合同编、"
            "建筑法、招标投标法及国资监管规定，"
            "可为合同审查、争议解决、合规管理提供专业法律意见。"
        ),
        "tags": ["建设工程法律", "合同审查", "争议解决", "合规管理"],
        "scenarios": [
            "工程合同与补充协议合法性审查",
            "工程款纠纷、质量纠纷应对策略",
            "诉讼/仲裁证据准备与风险评估",
            "企业合规风险识别与制度建议",
        ],
        "emoji": "⚖️",
        "gradient": ["#2c3e50", "#4a6274", "#6d8c9e"],
    },
    {
        "id": "finance-tax",
        "name": "财务资金专家",
        "title": "正高级会计师 · 财务与资金管理",
        "category": "财务金融",
        "description": (
            "精通建筑施工企业财务管理与税务筹划，熟悉项目成本管控、"
            "资金集中管理、建造合同收入确认与两金压降，"
            "助力企业提质增效、防范财务风险。"
        ),
        "tags": ["成本管控", "税务筹划", "资金管理", "两金压降"],
        "scenarios": [
            "项目成本分析与降本增效路径",
            "增值税/企业所得税涉税事项筹划",
            "建造合同收入确认与财务报表分析",
            "应收账款与存货压降方案设计",
        ],
        "emoji": "💰",
        "gradient": ["#0f6674", "#199473", "#2eb89b"],
    },
    {
        "id": "equipment-material",
        "name": "物资设备专家",
        "title": "正高级工程师 · 物资与设备管理",
        "category": "供应链",
        "description": (
            "精通工程物资集中采购、供应链管理与机械设备全生命周期管理，"
            "熟悉招标采购合规要求与供应商评价体系，"
            "可为采购策划、设备选型与降本提供专业支持。"
        ),
        "tags": ["集中采购", "供应链管理", "设备管理", "供应商评价"],
        "scenarios": [
            "物资采购方案与招标文件策划",
            "大型设备选型与进出场策划",
            "供应商评价体系与履约管理",
            "物资消耗分析与降本措施",
        ],
        "emoji": "🚜",
        "gradient": ["#8a5a2b", "#b07c42", "#d3a368"],
    },
    {
        "id": "investment-dev",
        "name": "投资开发专家",
        "title": "正高级经济师 · 投资与片区开发",
        "category": "经营开发",
        "description": (
            "精通基础设施投资项目策划与可行性研究，熟悉 PPP、特许经营、"
            "片区综合开发、EOD 等投融资模式，"
            "擅长投资测算、风险分配与交易结构设计。"
        ),
        "tags": ["投资测算", "特许经营", "片区开发", "交易结构"],
        "scenarios": [
            "投资项目可行性研究与财务测算",
            "PPP/特许经营交易结构设计",
            "片区综合开发与EOD模式策划",
            "投资风险识别与回报机制设计",
        ],
        "emoji": "📈",
        "gradient": ["#1b5e20", "#2e7d32", "#66bb6a"],
    },
    {
        "id": "overseas-engineering",
        "name": "海外工程专家",
        "title": "教授级高工 · 国际工程承包",
        "category": "经营开发",
        "description": (
            "深耕海外工程市场十余年，熟悉 FIDIC 合同条件、国际工程投标、"
            "属地化经营与跨境风险防控，"
            "可为海外项目从投标到履约提供全过程专业支持。"
        ),
        "tags": ["FIDIC", "国际投标", "属地化经营", "跨境合规"],
        "scenarios": [
            "FIDIC 合同条款解读与风险分配",
            "国际工程投标与报价策略",
            "海外项目属地化经营方案",
            "汇率/政治/法律等跨境风险防控",
        ],
        "emoji": "🌍",
        "gradient": ["#0d47a1", "#1976d2", "#64b5f6"],
    },
    {
        "id": "digital-smart",
        "name": "智能建造专家",
        "title": "正高级工程师 · 数字化转型",
        "category": "数字智能",
        "description": (
            "专注建筑业数字化转型，精通 BIM 正向设计、智慧工地、"
            "桥梁智能建造装备与项目管理信息化，"
            "可为企业数字化规划与智能建造落地提供咨询支持。"
        ),
        "tags": ["BIM", "智慧工地", "智能建造", "数字化规划"],
        "scenarios": [
            "企业数字化转型路径规划",
            "BIM 技术在项目全过程的应用方案",
            "智慧工地建设方案与平台选型",
            "智能建造装备与工艺落地评估",
        ],
        "emoji": "🤖",
        "gradient": ["#311b92", "#5e35b1", "#9575cd"],
    },
    {
        "id": "party-publicity",
        "name": "党建文宣专家",
        "title": "高级政工师 · 党建与宣传",
        "category": "综合管理",
        "description": (
            "熟悉国有企业党建工作与企业文化宣传，"
            "精通党建品牌创建、主题党日策划、公文写作与新闻宣传，"
            "可为基层党建和宣传思想工作提供专业支持。"
        ),
        "tags": ["党建品牌", "公文写作", "新闻宣传", "企业文化"],
        "scenarios": [
            "党建工作计划与品牌创建方案",
            "主题党日活动策划",
            "领导讲话稿、工作总结等公文起草",
            "企业宣传选题与新闻稿撰写",
        ],
        "emoji": "🚩",
        "gradient": ["#b71c1c", "#d32f2f", "#ef5350"],
    },
]

_EXPERTS_BY_ID = {e["id"]: e for e in _BUILTIN_EXPERTS}


def _expert_template_exists(expert_id: str) -> bool:
    """Check that the MD persona template exists for the expert."""
    return (_EXPERTS_ROOT / expert_id / "zh" / "PROFILE.md").exists()


@router.get(
    "",
    response_model=ExpertListResponse,
    summary="List built-in experts",
)
async def list_experts() -> ExpertListResponse:
    """Return the built-in expert team with category list."""
    experts = [
        ExpertInfo(**meta)
        for meta in _BUILTIN_EXPERTS
        if _expert_template_exists(meta["id"])
    ]
    # Preserve registry order of categories
    categories: list[str] = []
    for meta in _BUILTIN_EXPERTS:
        if meta["category"] not in categories:
            categories.append(meta["category"])
    return ExpertListResponse(experts=experts, categories=categories)


@router.post(
    "/{expert_id}/agents",
    response_model=ExpertAgentResponse,
    status_code=201,
    summary="Create (or reuse) the agent for a built-in expert",
)
async def create_expert_agent(expert_id: str) -> ExpertAgentResponse:
    """Create a dedicated agent for the given expert.

    The agent id is fixed to ``expert-<expert_id>`` so repeated calls reuse
    the existing agent instead of creating duplicates.
    """
    expert = _EXPERTS_BY_ID.get(expert_id)
    if expert is None:
        raise HTTPException(status_code=404, detail=f"Unknown expert: {expert_id}")

    if not _expert_template_exists(expert_id):
        raise HTTPException(
            status_code=500,
            detail=f"Expert persona template missing for {expert_id}",
        )

    agent_id = f"expert-{expert_id}"
    config = load_config()

    if agent_id in config.agents.profiles:
        ref = config.agents.profiles[agent_id]
        return ExpertAgentResponse(
            expert_id=expert_id,
            agent_id=agent_id,
            workspace_dir=ref.workspace_dir,
            created=False,
        )

    request = CreateAgentRequest(
        id=agent_id,
        name=expert["name"],
        description=f"【中铁专家】{expert['title']}",
        language="zh",
        md_template_id=f"experts/{expert_id}",
    )
    ref = await _create_agent_impl(request)
    logger.info("Created expert agent %s for expert %s", agent_id, expert_id)

    return ExpertAgentResponse(
        expert_id=expert_id,
        agent_id=ref.id,
        workspace_dir=ref.workspace_dir,
        created=True,
    )
