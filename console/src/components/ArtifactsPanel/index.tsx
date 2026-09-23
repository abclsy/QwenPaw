import { useState, useCallback } from "react";
import { Drawer, Button, Tooltip, Empty, Tag } from "antd";
import {
  FileTextOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FileOutlined,
  FolderOpenOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  DownloadOutlined,
  ClearOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import { message } from "antd";
import { useArtifactStore, type Artifact } from "../../stores/artifactStore";

// ── 文件图标映射 ─────────────────────────────────────────────────────
function getFileIcon(fileType: string) {
  const style: React.CSSProperties = { fontSize: 18 };
  switch (fileType) {
    case "HTML":
      return <FileTextOutlined style={{ ...style, color: "#e85d04" }} />;
    case "图片":
      return <FileImageOutlined style={{ ...style, color: "#0ea5e9" }} />;
    case "PDF":
      return <FilePdfOutlined style={{ ...style, color: "#dc2626" }} />;
    case "表格":
      return <FileExcelOutlined style={{ ...style, color: "#16a34a" }} />;
    case "文档":
      return <FileWordOutlined style={{ ...style, color: "#2563eb" }} />;
    case "压缩包":
      return <FileZipOutlined style={{ ...style, color: "#9333ea" }} />;
    default:
      return <FileOutlined style={{ ...style, color: "#666" }} />;
  }
}

/** 简易相对时间 */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

// ── 单个产物条目 ───────────────────────────────────────────────────────
function ArtifactItem({ artifact }: { artifact: Artifact }) {
  const [copied, setCopied] = useState(false);
  const isDesktop = !!window.pywebview?.api?.reveal_file;
  const isHtml = artifact.fileType === "HTML";
  const removeArtifact = useArtifactStore((s) => s.removeArtifact);

  // 复制路径
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(artifact.filePath).then(() => {
        setCopied(true);
        message.success("路径已复制");
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [artifact.filePath],
  );

  // 桌面端下载：pywebview 的 WKWebView/WebView2 不支持 <a download>，
  // 直接渲染 <a href> 会让 webview 导航离开 SPA 导致应用卡死，
  // 因此桌面端一律走原生保存对话框。
  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const api = window.pywebview?.api;
      if (api?.save_file) {
        const fullUrl = artifact.url.startsWith("http")
          ? artifact.url
          : `${window.location.origin}${artifact.url}`;
        try {
          const saved = await api.save_file(fullUrl, artifact.filename);
          if (saved) {
            message.success("文件已保存");
          }
        } catch {
          message.error("下载失败");
        }
      } else {
        // 浏览器端回退
        const a = document.createElement("a");
        a.href = artifact.url;
        a.download = artifact.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    },
    [artifact.url, artifact.filename],
  );

  // 桌面端用系统默认应用打开（如 PDF 用系统预览），避免 webview 内联渲染
  const handleOpen = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const api = window.pywebview?.api;
      if (!api?.preview_file || !artifact.filePath) return;
      const ok = await api.preview_file(artifact.filePath);
      if (!ok) message.warning("文件不存在或无法打开");
    },
    [artifact.filePath],
  );

  // 文件夹中显示
  const handleReveal = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.pywebview?.api?.reveal_file) return;
      const ok = window.pywebview.api.reveal_file(artifact.filePath);
      if (!ok) message.error("文件不存在或无法打开");
    },
    [artifact.filePath],
  );

  // 删除
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeArtifact(artifact.id);
      message.info(`已移除 ${artifact.filename}`);
    },
    [artifact.id, artifact.filename, removeArtifact],
  );

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #f0f0f0",
        marginBottom: 8,
        background: "#fff",
        transition: "border-color 0.2s",
        cursor: "default",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.borderColor = "#1961AC40")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.borderColor = "#f0f0f0")
      }
    >
      {/* 文件名 + 类型 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        {getFileIcon(artifact.fileType)}
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={artifact.filename}
        >
          {artifact.filename}
        </span>
        <Tag
          style={{
            margin: 0,
            fontSize: 10,
            padding: "0 6px",
            lineHeight: "18px",
          }}
          color="processing"
        >
          {artifact.fileType}
        </Tag>
      </div>

      {/* 路径（截断） */}
      {artifact.filePath && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "#999",
            marginBottom: 8,
            overflow: "hidden",
          }}
          title={artifact.filePath}
        >
          <ClockCircleOutlined style={{ fontSize: 10, flexShrink: 0 }} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {timeAgo(artifact.timestamp)} · {artifact.filePath}
          </span>
        </div>
      )}

      {/* 操作按钮 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {/* 预览/下载 */}
        {isHtml ? (
          <Tooltip title="预览">
            <a
              href={artifact.url}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                color: "#1961AC",
                background: "#f0f5ff",
                borderRadius: 6,
                textDecoration: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <EyeOutlined /> 预览
            </a>
          </Tooltip>
        ) : isDesktop ? (
          /* 桌面端：显式按钮走原生保存对话框（webview 不支持 <a download>） */
          <Tooltip title="下载到本地">
            <button
              onClick={handleDownload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                color: "#1961AC",
                background: "#f0f5ff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <DownloadOutlined /> 下载
            </button>
          </Tooltip>
        ) : (
          /* 浏览器端：保持原生 <a download> */
          <Tooltip title="下载">
            <a
              href={artifact.url}
              download={artifact.filename}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                color: "#1961AC",
                background: "#f0f5ff",
                borderRadius: 6,
                textDecoration: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <DownloadOutlined /> 下载
            </a>
          </Tooltip>
        )}

        {/* 桌面端：用系统默认应用打开（如 PDF 走系统预览） */}
        {isDesktop && !isHtml && artifact.filePath && (
          <Tooltip title="用系统应用打开">
            <button
              onClick={handleOpen}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                color: "#666",
                background: "#fafafa",
                border: "1px solid #e8e8e8",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <EyeOutlined /> 打开
            </button>
          </Tooltip>
        )}

        {/* 复制路径 */}
        <Tooltip title={copied ? "已复制!" : "复制路径"}>
          <button
            onClick={handleCopy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              fontSize: 12,
              color: copied ? "#52c41a" : "#666",
              background: copied ? "#f6ffed" : "#fafafa",
              border: `1px solid ${copied ? "#b7eb8f" : "#e8e8e8"}`,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {copied ? <CheckOutlined /> : <CopyOutlined />}
            {copied ? "已复制" : "路径"}
          </button>
        </Tooltip>

        {/* 桌面端：文件夹中显示 */}
        {isDesktop && artifact.filePath && (
          <Tooltip title="在文件夹中显示">
            <button
              onClick={handleReveal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                color: "#666",
                background: "#fafafa",
                border: "1px solid #e8e8e8",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <FolderOpenOutlined /> 打开位置
            </button>
          </Tooltip>
        )}

        {/* 删除 */}
        <Tooltip title="从列表移除">
          <button
            onClick={handleRemove}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              fontSize: 12,
              color: "#999",
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: 6,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            <DeleteOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// ── 主面板组件 ────────────────────────────────────────────────────────

interface ArtifactsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function ArtifactsPanel({ open, onClose }: ArtifactsPanelProps) {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const clearArtifacts = useArtifactStore((s) => s.clearArtifacts);

  const handleClearAll = useCallback(() => {
    clearArtifacts();
    message.info("已清空产物列表");
  }, [clearArtifacts]);

  return (
    <Drawer
      title={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingRight: 12,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InboxOutlined style={{ color: "#1961AC" }} />
            最近产物
          </span>
          {artifacts.length > 0 && (
            <Tag color="blue" style={{ margin: 0 }}>
              {artifacts.length}
            </Tag>
          )}
        </div>
      }
      placement="right"
      width={380}
      onClose={onClose}
      open={open}
      styles={{
        body: { padding: "12px 16px", background: "#fbfcfe" },
        header: {
          borderBottom: "1px solid #f0f0f0",
          background: "#fbfcfe",
        },
      }}
      closeIcon={<span />}
      extra={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {artifacts.length > 0 && (
            <Tooltip title="清空全部">
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={handleClearAll}
                danger
                style={{ fontSize: 13 }}
              >
                清空
              </Button>
            </Tooltip>
          )}
        </div>
      }
    >
      {artifacts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: "#bbb", fontSize: 13 }}>
              暂无产物
              <br />
              <span style={{ fontSize: 11 }}>生成文件后会自动出现在这里</span>
            </span>
          }
          style={{ marginTop: 80 }}
        />
      ) : (
        <div>
          {artifacts.map((artifact) => (
            <ArtifactItem key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </Drawer>
  );
}
