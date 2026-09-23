import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tooltip, message } from "antd";
import { X } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import { expertsApi } from "../../api/modules/experts";
import type { ExpertInfo } from "../../api/types/experts";
import styles from "./index.module.less";

// Module-level cache — the built-in expert registry is static per build.
let expertsCache: ExpertInfo[] | null = null;

const EXPERT_PREFIX = "expert-";

/**
 * Expert context chip rendered INSIDE the chat input action bar
 * (via `sender.prefix`).
 *
 * Shows the expert backing the current digital employee (agent id
 * `expert-<expert_id>`). Click the chip to switch expert; click the × to
 * exit expert mode and return to the default employee.
 */
export default function ExpertBadge() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedAgent, setSelectedAgent } = useAgentStore();
  const [expert, setExpert] = useState<ExpertInfo | null>(null);

  const expertId = selectedAgent?.startsWith(EXPERT_PREFIX)
    ? selectedAgent.slice(EXPERT_PREFIX.length)
    : null;

  useEffect(() => {
    if (!expertId) {
      setExpert(null);
      return;
    }
    if (expertsCache) {
      setExpert(expertsCache.find((e) => e.id === expertId) ?? null);
      return;
    }
    let cancelled = false;
    expertsApi
      .listExperts()
      .then((res) => {
        expertsCache = res.experts ?? [];
        if (!cancelled) {
          setExpert(expertsCache.find((e) => e.id === expertId) ?? null);
        }
      })
      .catch(() => {
        // Non-fatal — chip simply stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, [expertId]);

  if (!expertId || !expert) return null;

  const exitExpert = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAgent("default");
    message.info(t("experts.exitSuccess", "已退出专家，回到默认助手"));
  };

  return (
    <Tooltip
      title={t("experts.badgeTooltip", "当前对话专家，点击切换专家")}
      mouseEnterDelay={0.4}
    >
      <div
        className={styles.chip}
        onClick={() => navigate("/experts")}
        role="button"
        tabIndex={0}
      >
        <span
          className={styles.avatar}
          style={{
            background: `linear-gradient(135deg, ${expert.gradient[0]} 0%, ${
              expert.gradient[expert.gradient.length - 1]
            } 100%)`,
          }}
        >
          {expert.emoji}
        </span>
        <span className={styles.name}>{expert.name}</span>
        <Tooltip title={t("experts.exit", "退出专家")} mouseEnterDelay={0.3}>
          <button className={styles.closeBtn} onClick={exitExpert}>
            <X size={10} strokeWidth={2.5} />
          </button>
        </Tooltip>
      </div>
    </Tooltip>
  );
}
