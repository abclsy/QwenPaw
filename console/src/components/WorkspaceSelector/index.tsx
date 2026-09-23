import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown, Tooltip, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Check, Folder, FolderPlus, XCircle } from "lucide-react";
import { useWorkspaceDirStore } from "../../stores/workspaceStore";
import styles from "./index.module.less";

/** Extract the last segment of a posix/windows path. */
const baseName = (p: string) => {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
};

/**
 * Workspace picker rendered inside the chat input action bar
 * (via `sender.prefix`), WorkBuddy style.
 *
 * Pill trigger: folder icon + current folder name (gray "Workspace"
 * placeholder when not set). Click opens a dropdown with recently used
 * workspaces, "choose another folder…" and a clear action.
 */
export default function WorkspaceSelector() {
  const { t } = useTranslation();
  const { workspaceDir, recentWorkspaces, setWorkspaceDir, clearWorkspaceDir } =
    useWorkspaceDirStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const active = Boolean(workspaceDir);
  const label = active
    ? baseName(workspaceDir)
    : t("workspace.selectorLabel", "工作区");

  const applyDir = (dir: string) => {
    setWorkspaceDir(dir);
    message.success(
      t("workspace.setSuccess", {
        defaultValue: "工作空间已设置为: {{dir}}",
        dir,
      }),
    );
  };

  const handleBrowse = async () => {
    setOpen(false);
    // Try pywebview native folder dialog first
    const pywebview = (window as any).pywebview;
    if (pywebview?.api?.select_folder) {
      try {
        setLoading(true);
        const folder = await pywebview.api.select_folder();
        if (folder) applyDir(folder);
      } catch (e) {
        console.error("select_folder failed:", e);
        message.error(t("workspace.selectFailed", "选择文件夹失败"));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Fallback: simple text input prompt for browser mode
    const input = window.prompt(
      t("workspace.promptPath", "请输入工作空间目录路径:"),
      workspaceDir || "",
    );
    if (input !== null) {
      const trimmed = input.trim();
      if (trimmed) {
        applyDir(trimmed);
      } else {
        clearWorkspaceDir();
        message.info(t("workspace.cleared", "已清除工作空间设置"));
      }
    }
  };

  const handleClear = () => {
    setOpen(false);
    clearWorkspaceDir();
    message.info(t("workspace.cleared", "已清除工作空间设置"));
  };

  const panel = (
    <div className={styles.panel}>
      {recentWorkspaces.length > 0 && (
        <>
          <div className={styles.sectionLabel}>
            {t("workspace.recentTitle", "最近使用")}
          </div>
          {recentWorkspaces.map((dir) => (
            <div
              key={dir}
              className={`${styles.recentItem} ${
                dir === workspaceDir ? styles.recentCurrent : ""
              }`}
              onClick={() => {
                setOpen(false);
                applyDir(dir);
              }}
              role="button"
              tabIndex={0}
            >
              <Folder size={13} strokeWidth={2} className={styles.itemIcon} />
              <div className={styles.itemTexts}>
                <span className={styles.itemName}>{baseName(dir)}</span>
                <span className={styles.itemPath}>{dir}</span>
              </div>
              {dir === workspaceDir && (
                <Check size={12} strokeWidth={2.5} className={styles.check} />
              )}
            </div>
          ))}
        </>
      )}
      <div className={styles.divider} />
      <div
        className={styles.actionItem}
        onClick={handleBrowse}
        role="button"
        tabIndex={0}
      >
        <FolderPlus size={13} strokeWidth={2} className={styles.itemIcon} />
        <span className={styles.actionText}>
          {t("workspace.browseOther", "选择其他文件夹…")}
        </span>
        {loading && (
          <LoadingOutlined style={{ fontSize: 11, color: "#1961AC" }} />
        )}
      </div>
      {active && (
        <div
          className={`${styles.actionItem} ${styles.actionDanger}`}
          onClick={handleClear}
          role="button"
          tabIndex={0}
        >
          <XCircle size={13} strokeWidth={2} className={styles.itemIcon} />
          <span className={styles.actionText}>
            {t("workspace.clearLabel", "清除工作区")}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(o) => !loading && setOpen(o)}
      dropdownRender={() => panel}
      trigger={["click"]}
      placement="bottomLeft"
    >
      <Tooltip
        title={
          workspaceDir ? (
            <span style={{ wordBreak: "break-all" }}>
              {t("workspace.currentPath", {
                defaultValue: "当前工作空间: {{dir}}",
                dir: workspaceDir,
              })}
            </span>
          ) : (
            t("workspace.selectorTooltip", "选择工作区目录（产物将保存到此目录）")
          )}
        mouseEnterDelay={0.4}
      >
        <div
          className={`${styles.pill} ${active ? styles.pillActive : ""} ${
            open ? styles.pillOpen : ""
          }`}
          role="button"
          tabIndex={0}
        >
          {loading ? (
            <LoadingOutlined style={{ fontSize: 12 }} />
          ) : (
            <Folder size={13} strokeWidth={2} />
          )}
          <span className={styles.pillName}>{label}</span>
        </div>
      </Tooltip>
    </Dropdown>
  );
}
