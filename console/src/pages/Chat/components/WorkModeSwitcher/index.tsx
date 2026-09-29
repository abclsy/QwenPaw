import { useMemo } from "react";
import { Tooltip } from "antd";
import {
  MessageOutlined,
  OrderedListOutlined,
  ThunderboltOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useWorkModeStore, type WorkMode } from "../../../../stores/workModeStore";
import styles from "./index.module.less";

/**
 * Work-mode switcher: 问 / 想 / 做 (Ask / Plan / Craft).
 *
 * WorkBuddy-style compact pill group at the left of the input action
 * bar: a single rounded pill with three icon tabs; the active tab is
 * highlighted with the theme color and shows its label, inactive tabs
 * are icon-only. Tooltips explain each mode on hover.
 */
export default function WorkModeSwitcher({ sessionId }: { sessionId?: string }) {
  const { t } = useTranslation();
  const mode = useWorkModeStore((s) =>
    sessionId ? (s.sessionModes[sessionId] ?? s.mode) : s.mode,
  );
  const setMode = useWorkModeStore((s) => s.setMode);

  const tabs = useMemo(
    () => [
      {
        value: "ask" as WorkMode,
        icon: <MessageOutlined className={styles.tabIcon} />,
        label: t("workMode.ask", "问"),
        tooltip: t(
          "workMode.askTooltip",
          "快速问答：不调用工具、不读写文件，响应最快",
        ),
      },
      {
        value: "plan" as WorkMode,
        icon: <OrderedListOutlined className={styles.tabIcon} />,
        label: t("workMode.plan", "想"),
        tooltip: t(
          "workMode.planTooltip",
          "先出执行计划，确认后再动手，适合复杂任务",
        ),
      },
      {
        value: "craft" as WorkMode,
        icon: <ThunderboltOutlined className={styles.tabIcon} />,
        label: t("workMode.craft", "做"),
        tooltip: t(
          "workMode.craftTooltip",
          "直接自主执行完整任务（默认，与之前版本一致）",
        ),
      },
    ],
    [t],
  );

  return (
    <div className={styles.pillGroup} role="tablist" aria-label="work mode">
      {tabs.map((tab) => {
        const active = mode === tab.value;
        return (
          <Tooltip key={tab.value} title={tab.tooltip} mouseEnterDelay={0.4}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
              onClick={() => setMode(tab.value, sessionId)}
            >
              {tab.icon}
              <span className={styles.tabLabel}>{tab.label}</span>
              {active && <CheckOutlined className={styles.tabCheck} />}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
