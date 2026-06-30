import { useState } from "react";
import { Tooltip, message } from "antd";
import { FolderOpen, X, FolderCheck } from "lucide-react";
import { useWorkspaceDirStore } from "../../stores/workspaceStore";
import styles from "./index.module.less";

export default function WorkspaceSelector() {
  const { workspaceDir, setWorkspaceDir, clearWorkspaceDir } =
    useWorkspaceDirStore();
  const [loading, setLoading] = useState(false);

  const handleSelectFolder = async () => {
    // Try pywebview native folder dialog first
    const pywebview = (window as any).pywebview;
    if (pywebview?.api?.select_folder) {
      try {
        setLoading(true);
        const folder = await pywebview.api.select_folder();
        if (folder) {
          setWorkspaceDir(folder);
          message.success(`工作空间已设置为: ${folder}`);
        }
      } catch (e) {
        console.error("select_folder failed:", e);
        message.error("选择文件夹失败");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Fallback: use a simple text input prompt for browser mode
    const input = window.prompt("请输入工作空间目录路径:", workspaceDir || "");
    if (input !== null) {
      const trimmed = input.trim();
      if (trimmed) {
        setWorkspaceDir(trimmed);
        message.success(`工作空间已设置为: ${trimmed}`);
      } else {
        clearWorkspaceDir();
        message.info("已清除工作空间设置");
      }
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearWorkspaceDir();
    message.info("已清除工作空间设置");
  };

  // Shorten the path for display: show last 2-3 path components
  const shortPath = (() => {
    if (!workspaceDir) return "";
    const parts = workspaceDir.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length <= 3) return workspaceDir;
    return ".../" + parts.slice(-3).join("/");
  })();

  return (
    <div className={styles.workspaceWrapper}>
      <Tooltip
        title={
          workspaceDir ? (
            <span style={{ wordBreak: "break-all" }}>
              当前工作空间: {workspaceDir}
            </span>
          ) : (
            "点击选择工作空间目录（产物将保存到此目录）"
          )
        }
        mouseEnterDelay={0.4}
      >
        <div
          className={`${styles.workspaceSelector} ${
            workspaceDir ? styles.active : ""
          }`}
          onClick={handleSelectFolder}
          role="button"
          tabIndex={0}
        >
          <span className={styles.icon}>
            {workspaceDir ? (
              <FolderCheck size={14} strokeWidth={2} />
            ) : (
              <FolderOpen size={14} strokeWidth={2} />
            )}
          </span>
          <span className={styles.label}>
            {loading
              ? "选择中..."
              : workspaceDir
                ? shortPath
                : "选择工作空间"}
          </span>
          {workspaceDir && !loading && (
            <span
              className={styles.clearBtn}
              onClick={handleClear}
              role="button"
              tabIndex={-1}
            >
              <X size={12} strokeWidth={2.5} />
            </span>
          )}
        </div>
      </Tooltip>
    </div>
  );
}
