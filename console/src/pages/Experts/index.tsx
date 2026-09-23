import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Input, Spin, Tag, Modal, Tooltip } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import {
  Search,
  MessageSquare,
  CheckCircle,
  Eye,
  Users,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { useTheme } from "../../contexts/ThemeContext";
import { useAgentStore } from "../../stores/agentStore";
import { useAppMessage } from "../../hooks/useAppMessage";
import { expertsApi } from "../../api/modules/experts";
import { agentsApi } from "../../api/modules/agents";
import type { ExpertInfo } from "../../api/types/experts";
import styles from "./index.module.less";

export default function ExpertsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { message } = useAppMessage();
  const { agents, setAgents, setSelectedAgent } = useAgentStore();

  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [experts, setExperts] = useState<ExpertInfo[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [keyword, setKeyword] = useState("");
  const [detailExpert, setDetailExpert] = useState<ExpertInfo | null>(null);

  useEffect(() => {
    expertsApi
      .listExperts()
      .then((res) => {
        setExperts(res.experts);
        setCategories(res.categories);
      })
      .catch(() => {
        message.error(t("experts.loadFailed", "专家列表加载失败"));
      })
      .finally(() => setLoading(false));
  }, []);

  // Agent ids that were created from experts
  const expertAgentIds = useMemo(
    () => new Set(agents?.map((a) => a.id) ?? []),
    [agents],
  );

  const filteredExperts = useMemo(() => {
    let list = experts;
    if (activeCategory !== "__all__") {
      list = list.filter((e) => e.category === activeCategory);
    }
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(kw) ||
          e.title.toLowerCase().includes(kw) ||
          e.description.toLowerCase().includes(kw) ||
          e.tags.some((tag) => tag.toLowerCase().includes(kw)),
      );
    }
    return list;
  }, [experts, activeCategory, keyword]);

  const startChat = async (expert: ExpertInfo) => {
    if (creatingId) return;
    setCreatingId(expert.id);
    try {
      const res = await expertsApi.createExpertAgent(expert.id);
      // Refresh agent list so the new agent appears in the selector
      try {
        const data = await agentsApi.listAgents();
        setAgents([...data.agents]);
      } catch {
        // Non-fatal — agent was still created
      }
      setSelectedAgent(res.agent_id);
      message.success(
        res.created
          ? t("experts.createSuccess", "已创建专家数字员工，开始对话吧")
          : t("experts.switchSuccess", "已切换到该专家，继续对话"),
      );
      navigate("/chat");
    } catch {
      message.error(t("experts.createFailed", "创建专家失败，请重试"));
    } finally {
      setCreatingId(null);
    }
  };

  const agentExists = (expert: ExpertInfo) =>
    expertAgentIds.has(`expert-${expert.id}`);

  const avatarStyle = (expert: ExpertInfo) => ({
    background: `linear-gradient(135deg, ${expert.gradient[0]} 0%, ${
      expert.gradient[Math.min(1, expert.gradient.length - 1)]
    } 100%)`,
  });

  return (
    <div className={styles.expertsPage}>
      <div className={styles.pageBody}>
        <PageHeader
          parent={t("nav.experts", "专家中心")}
          current={t("experts.subtitle", "中国中铁数字专家团队")}
        />

        {/* Hero section */}
        <div
          className={`${styles.hero}${isDark ? ` ${styles.heroDark}` : ""}`}
        >
          <div className={styles.heroIcon}>
            <Users size={22} strokeWidth={2} />
          </div>
          <div className={styles.heroText}>
            <div className={styles.heroTitle}>
              {t("experts.heroTitle", "中铁专家团队")}
              <span className={styles.heroBadge}>
                <Sparkles size={12} strokeWidth={2} />
                {experts.length} {t("experts.count", "位专家")}
              </span>
            </div>
            <div className={styles.heroDesc}>
              {t(
                "experts.heroDesc",
                "覆盖工程技术、安全质量、商务法务、财务金融等领域的内置专家，点击专家即可创建专属数字员工并开始对话。",
              )}
            </div>
          </div>
        </div>

        {/* Filter row: category tabs + search */}
        <div className={styles.filterRow}>
          <div className={styles.categoryTabs}>
            <button
              className={`${styles.categoryTab} ${
                activeCategory === "__all__" ? styles.categoryTabActive : ""
              }`}
              onClick={() => setActiveCategory("__all__")}
            >
              {t("experts.allCategories", "全部")}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`${styles.categoryTab} ${
                  activeCategory === cat ? styles.categoryTabActive : ""
                }`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <Input
            allowClear
            prefix={<Search size={14} strokeWidth={2} />}
            className={styles.searchInput}
            placeholder={t("experts.searchPlaceholder", "搜索专家 / 领域 / 能力")}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {/* Expert cards grid */}
        {loading ? (
          <div className={styles.loadingWrapper}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
          </div>
        ) : filteredExperts.length === 0 ? (
          <div className={styles.emptyWrapper}>
            {t("experts.empty", "没有找到匹配的专家")}
          </div>
        ) : (
          <div className={styles.cardsGrid}>
            {filteredExperts.map((expert) => {
              const exists = agentExists(expert);
              return (
                <div
                  key={expert.id}
                  className={`${styles.expertCard}${
                    isDark ? ` ${styles.expertCardDark}` : ""
                  }`}
                  onClick={() => setDetailExpert(expert)}
                >
                  <div className={styles.cardHeader}>
                    <div
                      className={styles.expertAvatar}
                      style={avatarStyle(expert)}
                    >
                      <span>{expert.emoji}</span>
                    </div>
                    <div className={styles.cardTitleBlock}>
                      <div className={styles.expertNameRow}>
                        <span className={styles.expertName}>{expert.name}</span>
                        {exists && (
                          <Tooltip
                            title={t(
                              "experts.createdTooltip",
                              "已创建对应数字员工",
                            )}
                          >
                            <CheckCircle
                              size={14}
                              strokeWidth={2}
                              className={styles.createdIcon}
                            />
                          </Tooltip>
                        )}
                      </div>
                      <div className={styles.expertTitle}>{expert.title}</div>
                    </div>
                  </div>

                  <div className={styles.expertDesc}>{expert.description}</div>

                  <div className={styles.tagRow}>
                    {expert.tags.slice(0, 3).map((tag) => (
                      <Tag key={tag} className={styles.expertTag}>
                        {tag}
                      </Tag>
                    ))}
                    {expert.tags.length > 3 && (
                      <span className={styles.moreTags}>
                        +{expert.tags.length - 3}
                      </span>
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <button
                      className={styles.detailBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailExpert(expert);
                      }}
                    >
                      <Eye size={13} strokeWidth={2} />
                      {t("experts.detail", "详情")}
                    </button>
                    <button
                      className={`${styles.chatBtn}${exists ? ` ${styles.chatBtnContinue}` : ""}`}
                      disabled={creatingId === expert.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        startChat(expert);
                      }}
                    >
                      {creatingId === expert.id ? (
                        <LoadingOutlined style={{ fontSize: 13 }} spin />
                      ) : (
                        <MessageSquare size={13} strokeWidth={2} />
                      )}
                      {creatingId === expert.id
                        ? t("experts.creating", "创建中…")
                        : exists
                          ? t("experts.continueChat", "继续对话")
                          : t("experts.startChat", "开始对话")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!detailExpert}
        onCancel={() => setDetailExpert(null)}
        footer={null}
        width={560}
        title={null}
        className={styles.detailModal}
        destroyOnClose
      >
        {detailExpert && (
          <div className={styles.detailBody}>
            <div className={styles.detailHeader}>
              <div
                className={styles.detailAvatar}
                style={avatarStyle(detailExpert)}
              >
                <span>{detailExpert.emoji}</span>
              </div>
              <div>
                <div className={styles.detailName}>{detailExpert.name}</div>
                <div className={styles.detailTitle}>
                  {detailExpert.title}
                  <Tag className={styles.detailCategory} color="blue">
                    {detailExpert.category}
                  </Tag>
                </div>
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>
                {t("experts.about", "专家介绍")}
              </div>
              <div className={styles.detailText}>
                {detailExpert.description}
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>
                {t("experts.capabilities", "擅长领域")}
              </div>
              <div className={styles.detailTagRow}>
                {detailExpert.tags.map((tag) => (
                  <Tag key={tag} className={styles.expertTag}>
                    {tag}
                  </Tag>
                ))}
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>
                {t("experts.scenarios", "使用场景")}
              </div>
              <div className={styles.scenarioList}>
                {detailExpert.scenarios.map((s) => (
                  <div key={s} className={styles.scenarioItem}>
                    <ArrowRight size={12} strokeWidth={2.5} />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              className={styles.detailChatBtn}
              disabled={creatingId === detailExpert.id}
              onClick={() => {
                startChat(detailExpert);
              }}
            >
              {creatingId === detailExpert.id ? (
                <LoadingOutlined spin />
              ) : (
                <MessageSquare size={14} strokeWidth={2} />
              )}
              {agentExists(detailExpert)
                ? t("experts.continueChat", "继续对话")
                : t("experts.createAndChat", "创建专家数字员工并开始对话")}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
