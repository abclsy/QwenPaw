import { useState, useCallback } from "react";
import {
  FileTextOutlined,
  FolderOpenOutlined,
  DownloadOutlined,
  CopyOutlined,
  CheckOutlined,
  EyeOutlined,
  FileOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileZipOutlined,
} from "@ant-design/icons";
import { message } from "antd";

// ── Types ──────────────────────────────────────────────────────────────
interface FileBlockItem {
  type: "file";
  source: { type: string; url: string };
  filename?: string;
}

interface TextBlockItem {
  type: "text";
  text: string;
}

interface Props {
  data: {
    content?: [
      { data: { name?: string; arguments?: unknown } },
      { data?: { output?: (FileBlockItem | TextBlockItem)[] } },
    ];
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

/** 从 /files/preview/xxx URL 中解码出本地文件路径 */
function extractFilePath(url: string): string {
  try {
    const match = url.match(/\/files\/preview\/(.+)$/);
    if (!match) return "";
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

/** 根据扩展名返回文件类型图标和标签 */
function getFileMeta(filename: string): {
  icon: React.ReactNode;
  label: string;
  color: string;
} {
  const lower = filename.toLowerCase();
  if (/\.(html?|htm)$/.test(lower)) {
    return { icon: <FileTextOutlined />, label: "HTML", color: "#e85d04" };
  }
  if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/.test(lower)) {
    return { icon: <FileImageOutlined />, label: "图片", color: "#0ea5e9" };
  }
  if (/\.pdf$/.test(lower)) {
    return { icon: <FilePdfOutlined />, label: "PDF", color: "#dc2626" };
  }
  if (/\.(xlsx?|csv)$/.test(lower)) {
    return { icon: <FileExcelOutlined />, label: "表格", color: "#16a34a" };
  }
  if (/\.(docx?|txt|md)$/.test(lower)) {
    return { icon: <FileWordOutlined />, label: "文档", color: "#2563eb" };
  }
  if (/\.(zip|rar|7z|tar\.gz)$/.test(lower)) {
    return { icon: <FileZipOutlined />, label: "压缩包", color: "#9333ea" };
  }
  return { icon: <FileOutlined />, label: "文件", color: "#666" };
}

function isHtmlFile(filename?: string): boolean {
  if (!filename) return false;
  return /\.(html?|htm)$/i.test(filename);
}

function extractBlocks(data: Props["data"]) {
  const rawOutput = data.content?.[1]?.data?.output;
  // output can be a JSON string (from FunctionCallOutput) or already an array
  let output: (FileBlockItem | TextBlockItem)[] = [];
  if (typeof rawOutput === "string") {
    try {
      const parsed = JSON.parse(rawOutput);
      if (Array.isArray(parsed)) {
        output = parsed;
      } else {
        output = [parsed];
      }
    } catch {
      // Not JSON — treat as plain text
      output = [{ type: "text", text: rawOutput }];
    }
  } else if (Array.isArray(rawOutput)) {
    output = rawOutput;
  }
  const fileBlocks = output.filter(
    (b): b is FileBlockItem => b.type === "file",
  );
  const textBlocks = output.filter(
    (b): b is TextBlockItem => b.type === "text",
  );
  return { fileBlocks, textBlocks };
}

function navigateTo(url: string, e: React.MouseEvent) {
  e.preventDefault();
  window.location.href = url;
}

// ── 桌面环境检测 ─────────────────────────────────────────────────────
function isDesktopEnv(): boolean {
  return typeof window !== "undefined" && !!window.pywebview?.api?.save_file;
}

// ── 浏览器下载回退 ───────────────────────────────────────────────────
function doBrowserDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── 单个文件卡片 ──────────────────────────────────────────────────────
function FileCard({
  file,
}: {
  file: FileBlockItem;
}) {
  const apiUrl = file.source?.url;
  const name = file.filename || "未知文件";
  const filePath = extractFilePath(apiUrl || "");
  const meta = getFileMeta(name);
  const [copied, setCopied] = useState(false);
  const desktop = isDesktopEnv();

  // 复制路径到剪贴板
  const handleCopyPath = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!filePath) return;
      navigator.clipboard.writeText(filePath).then(() => {
        setCopied(true);
        message.success("路径已复制");
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [filePath],
  );

  // 在文件夹中显示
  const handleReveal = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!filePath || !window.pywebview?.api?.reveal_file) return;
      try {
        const ok = await window.pywebview.api.reveal_file(filePath);
        if (!ok) {
          message.error("文件不存在或无法打开");
        }
      } catch {
        message.error("文件不存在或无法打开");
      }
    },
    [filePath],
  );

  // 桌面端用系统默认应用打开（如 PDF 走系统预览），
  // 避免 webview 内联渲染文件导致应用卡死
  const handleOpen = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!filePath || !window.pywebview?.api?.preview_file) return;
      try {
        const ok = await window.pywebview.api.preview_file(filePath);
        if (!ok) {
          message.warning("文件不存在或无法打开");
        }
      } catch {
        message.warning("文件不存在或无法打开");
      }
    },
    [filePath],
  );

  // 下载文件
  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pywebview = (window as any).pywebview;
      if (pywebview?.api?.save_file) {
        // 桌面端：使用原生保存对话框
        const fullUrl = apiUrl!.startsWith("http")
          ? apiUrl!
          : `${window.location.origin}${apiUrl!}`;
        try {
          const saved = await pywebview.api.save_file(fullUrl, name);
          if (saved === true || saved === "true") {
            message.success("文件已保存");
          } else if (saved === false || saved === "false") {
            // 用户取消，不提示
          } else {
            doBrowserDownload(apiUrl!, name);
          }
        } catch {
          doBrowserDownload(apiUrl!, name);
        }
      } else {
        // 浏览器端：直接下载
        doBrowserDownload(apiUrl!, name);
      }
    },
    [apiUrl, name],
  );

  if (!apiUrl) return null;

  const isHtml = isHtmlFile(file.filename);

  return (
    <div
      data-artifact-url={apiUrl}
      data-artifact-name={name}
      data-artifact-path={filePath}
      style={{
        padding: "12px 16px",
        border: "1px solid #e8e8e8",
        borderRadius: 10,
        marginBottom: 10,
        background: "#fafcff",
        transition: "box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 2px 12px rgba(25,97,172,0.1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* 文件名 + 类型标签 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: filePath ? 6 : 4,
        }}
      >
        <span style={{ fontSize: 18, color: meta.color }}>{meta.icon}</span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={name}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            background: `${meta.color}15`,
            color: meta.color,
            border: `1px solid ${meta.color}30`,
            fontWeight: 500,
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* 文件路径条 */}
      {filePath && (
        <div
          onClick={handleCopyPath}
          title="点击复制完整路径"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            marginBottom: 8,
            background: "#f0f4f8",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 11.5,
            color: "#666",
            overflow: "hidden",
          }}
        >
          <CopyOutlined
            style={{ color: "#999", fontSize: 11, flexShrink: 0 }}
          />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "已复制!" : filePath}
          </span>
          {copied && (
            <CheckOutlined
              style={{ color: "#52c41a", fontSize: 11, flexShrink: 0 }}
            />
          )}
        </div>
      )}

      {/* 操作按钮栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {isHtml ? (
          /* HTML 文件：预览按钮 */
          <a
            href={apiUrl}
            onClick={(e) => navigateTo(apiUrl, e)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 18px",
              background: "#1961AC",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <EyeOutlined /> 预览
          </a>
        ) : (
          /* 非 HTML：下载按钮 */
          <button
            onClick={handleDownload}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 18px",
              background: "#1961AC",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 500,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <DownloadOutlined /> 下载
          </button>
        )}

        {/* 桌面端：文件夹中显示按钮 */}
        {desktop && filePath && (
          <button
            onClick={handleReveal}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              background: "#fff",
              color: "#555",
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 400,
            }}
          >
            <FolderOpenOutlined /> 文件夹中显示
          </button>
        )}

        {/* 桌面端：用系统默认应用打开（如 PDF 走系统预览） */}
        {desktop && !isHtml && filePath && (
          <button
            onClick={handleOpen}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              background: "#fff",
              color: "#555",
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 400,
            }}
          >
            <EyeOutlined /> 打开
          </button>
        )}

        {/* 提示文字 */}
        {isHtml && !desktop && (
          <span style={{ fontSize: 11, color: "#aaa" }}>
            预览页带返回按钮
          </span>
        )}
      </div>
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────────────
export default function SendFileToUserRenderer({ data }: Props) {
  try {
    const { fileBlocks, textBlocks } = extractBlocks(data);

    if (fileBlocks.length === 0) {
      return (
        <div style={{ padding: "4px 0", fontSize: 13, color: "#555" }}>
          {textBlocks.map((t, i) => (
            <span key={i}>{t.text}</span>
          ))}
        </div>
      );
    }

    return (
      <div style={{ marginTop: 4 }}>
        {fileBlocks.map((file, idx) => (
          <FileCard key={idx} file={file} />
        ))}

        {/* Text block */}
        {textBlocks.map((tb, idx) => (
          <div
            key={`text-${idx}`}
            style={{ fontSize: 13, color: "#555", marginTop: 2 }}
          >
            {tb.text}
          </div>
        ))}
      </div>
    );
  } catch {
    return null;
  }
}
