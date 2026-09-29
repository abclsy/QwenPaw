import { useMemo } from "react";
import { Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  CheckOutlined,
  MessageOutlined,
  OrderedListOutlined,
  ThunderboltOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useWorkModeStore, type WorkMode } from "../../../../stores/workModeStore";
import styles from "./index.module.less";

/**
 * Work-mode selector (WorkBuddy style).
 *
 * WorkBuddy's pattern: the mode entry is a compact chip at the
 * bottom-left of the input area showing the CURRENT mode; clicking it
 * opens a menu with the three modes, each carrying a one-line
 * description of what it does. After selection the chip updates to
 * reflect (and remind of) the active mode.
 */
export default function WorkModeSwitcher({ sessionId }: { sessionId?: string }) {
  const { t } = useTranslation();
  const mode = useWorkModeStore((s) =>
    sessionId ? (s.sessionModes[sessionId] ?? s.mode) : s.mode,
  );
  const setMode = useWorkModeStore((s) => s.setMode);

  const modes = useMemo(
    () => [
      {
        value: "ask" as WorkMode,
        icon: <MessageOutlined className={styles.menuIcon} />,
        label: t("workMode.ask", "问一问"),
        desc: t(
          "workMode.askDesc",
          "只问答和分析，不修改文件，响应最快",
        ),
      },
      {
        value: "plan" as WorkMode,
        icon: <OrderedListOutlined className={styles.menuIcon} />,
        label: t("workMode.plan", "想一想"),
        desc: t(
          "workMode.planDesc",
          "先出执行计划，你确认后再动手",
        ),
      },
      {
        value: "craft" as WorkMode,
        icon: <ThunderboltOutlined className={styles.menuIcon} />,
        label: t("workMode.craft", "做一做"),
        desc: t(
          "workMode.craftDesc",
          "直接执行任务，可生成或修改文件（默认）",
        ),
      },
    ],
    [t],
  );

  const current = modes.find((m) => m.value === mode) ?? modes[2];

  const menuItems: MenuProps["items"] = modes.map((m) => ({
    key: m.value,
    label: (
      <div className={styles.menuRow}>
        <span className={styles.menuRowIcon}>{m.icon}</span>
        <span className={styles.menuRowBody}>
          <span className={styles.menuRowLabel}>{m.label}</span>
          <span className={styles.menuRowDesc}>{m.desc}</span>
        </span>
        {mode === m.value && (
          <CheckOutlined className={styles.menuRowCheck} />
        )}
      </div>
    ),
  }));

  const onClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "ask" || key === "plan" || key === "craft") {
      setMode(key, sessionId);
    }
  };

  return (
    <Dropdown
      menu={{ items: menuItems, onClick, selectedKeys: [mode] }}
      trigger={["click"]}
      placement="topLeft"
      overlayClassName={styles.menuOverlay}
    >
      <Tooltip
        title={t("workMode.switchHint", "切换工作模式")}
        mouseEnterDelay={0.6}
      >
        <button type="button" className={styles.chip} aria-label="work mode">
          <span className={styles.chipIcon}>{current.icon}</span>
          <span className={styles.chipLabel}>{current.label}</span>
          <DownOutlined className={styles.chipArrow} />
        </button>
      </Tooltip>
    </Dropdown>
  );
}
