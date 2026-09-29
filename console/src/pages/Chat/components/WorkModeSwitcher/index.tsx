import { useMemo } from "react";
import { Segmented, Tooltip } from "antd";
import {
  CommentOutlined,
  OrderedListOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useWorkModeStore, type WorkMode } from "../../../../stores/workModeStore";
import styles from "./index.module.less";

/**
 * Work-mode segmented switcher: 💬问 / 📋想 / 🔨做.
 *
 * Placed next to the chat input. Switching only affects the NEXT
 * message (never interrupts a running one) and is remembered per
 * session (survives refresh via the work-mode store).
 */
export default function WorkModeSwitcher({ sessionId }: { sessionId?: string }) {
  const { t } = useTranslation();
  const mode = useWorkModeStore((s) =>
    sessionId ? (s.sessionModes[sessionId] ?? s.mode) : s.mode,
  );
  const setMode = useWorkModeStore((s) => s.setMode);

  const options = useMemo(
    () => [
      {
        value: "ask",
        label: (
          <span className={styles.modeOption}>
            <CommentOutlined /> {t("workMode.ask", "问")}
          </span>
        ),
      },
      {
        value: "plan",
        label: (
          <span className={styles.modeOption}>
            <OrderedListOutlined /> {t("workMode.plan", "想")}
          </span>
        ),
      },
      {
        value: "craft",
        label: (
          <span className={styles.modeOption}>
            <ToolOutlined /> {t("workMode.craft", "做")}
          </span>
        ),
      },
    ],
    [t],
  );

  const tooltips: Record<WorkMode, string> = {
    ask: t(
      "workMode.askTooltip",
      "快速问答：不调用工具、不读写文件，响应最快",
    ),
    plan: t(
      "workMode.planTooltip",
      "先出执行计划，确认后再动手，适合复杂任务",
    ),
    craft: t(
      "workMode.craftTooltip",
      "直接自主执行完整任务（默认，与之前版本一致）",
    ),
  };

  return (
    <Tooltip title={tooltips[mode]} mouseEnterDelay={0.4}>
      <Segmented
        size="small"
        value={mode}
        options={options}
        onChange={(v) => setMode(v as WorkMode, sessionId)}
        className={styles.workModeSwitcher}
      />
    </Tooltip>
  );
}
