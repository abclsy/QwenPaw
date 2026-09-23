import React, { useEffect, useState, useCallback } from "react";
import { IconButton } from "@agentscope-ai/design";
import {
  SparkHistoryLine,
  SparkNewChatFill,
  SparkSearchLine,
  SparkLocalFileLine,
} from "@agentscope-ai/icons";
import { useChatAnywhereSessions } from "@agentscope-ai/chat";
import { useTranslation } from "react-i18next";
import {
  Flex,
  Tooltip,
  Drawer,
  List,
  message,
  Tag,
  Empty,
  Modal,
  Spin,
} from "antd";
import {
  FileTextOutlined,
  EyeOutlined,
  DownloadOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import ChatSessionDrawer from "../ChatSessionDrawer";
import ChatSearchPanel from "../ChatSearchPanel";
import PlanPanel from "../../../../components/PlanPanel";
import { planApi } from "../../../../api/modules/plan";
import { useAgentStore } from "../../../../stores/agentStore";
import { workspaceApi } from "../../../../api/modules/workspace";
import type { MarkdownFile } from "../../../../api/types/workspace";
import { getApiUrl } from "../../../../api/config";
import { buildAuthHeaders } from "../../../../api/authHeaders";

const PlanIcon = () => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

// ── 文件类型判断 ────────────────────────────────────────────────────────
function getFileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function isPreviewable(filename: string): boolean {
  const ext = getFileExt(filename);
  return [
    "html", "htm", "pdf", "txt", "md", "json", "js", "ts",
    "jsx", "tsx", "css", "xml", "svg", "csv", "py", "java",
    "c", "cpp", "go", "rs", "rb", "sh", "yaml", "yml", "sql",
  ].includes(ext);
}

function isHtmlFile(filename: string): boolean {
  const ext = getFileExt(filename);
  return ["html", "htm", "svg"].includes(ext);
}

function isPdfFile(filename: string): boolean {
  return getFileExt(filename) === "pdf";
}

// ── 文件预览 Modal ──────────────────────────────────────────────────────
function FilePreviewModal({
  file,
  onClose,
}: {
  file: MarkdownFile | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    if (!file) return;
    setLoading(true);
    setTextContent("");
    setBlobUrl("");

    const headers = buildAuthHeaders();
    const url = getApiUrl(
      `/workspace/files/raw/${encodeURIComponent(file.filename)}`,
    );

    fetch(url, { headers })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const objUrl = URL.createObjectURL(blob);
        setBlobUrl(objUrl);
        // For text-like files (not html, not pdf), also read as text
        if (!isHtmlFile(file.filename) && !isPdfFile(file.filename)) {
          const reader = new FileReader();
          reader.onload = () => {
            setTextContent(reader.result as string);
            setLoading(false);
          };
          reader.onerror = () => setLoading(false);
          reader.readAsText(blob);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Preview failed:", err);
        message.error("预览失败: " + err.message);
        setLoading(false);
      });

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.filename]);

  if (!file) return null;

  const isHtml = isHtmlFile(file.filename);
  const isPdf = isPdfFile(file.filename);

  return (
    <Modal
      open={!!file}
      onCancel={onClose}
      footer={
        <div style={{ textAlign: "center" }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 32px",
              fontSize: 14,
              color: "#fff",
              background: "#1961AC",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            关闭预览
          </button>
        </div>
      }
      width="90%"
      style={{ top: 20 }}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FileTextOutlined style={{ color: "#1961AC" }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.filename}
          </span>
        </div>
      }
      destroyOnClose
    >
      <div
        style={{
          height: "calc(100vh - 140px)",
          overflow: "auto",
          background: isHtml || isPdf ? "#fff" : "#f5f5f5",
          borderRadius: 8,
          position: "relative",
        }}
      >
        {/* 关闭浮动按钮 */}
        <button
          onClick={onClose}
          style={{
            position: "fixed",
            top: 16,
            right: 24,
            zIndex: 10000,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0, 0, 0, 0.5)",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = "rgba(0, 0, 0, 0.7)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = "rgba(0, 0, 0, 0.5)";
          }}
          title="关闭预览 (Esc)"
        >
          ✕
        </button>

        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <Spin tip="加载中..." />
          </div>
        ) : (isHtml || isPdf) && blobUrl ? (
          <iframe
            src={blobUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            title={file.filename}
          />
        ) : textContent ? (
          <pre
            style={{
              margin: 0,
              padding: 16,
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
            }}
          >
            {textContent}
          </pre>
        ) : blobUrl ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 16,
            }}
          >
            <FileTextOutlined style={{ fontSize: 48, color: "#ccc" }} />
            <span style={{ color: "#999" }}>此文件类型无法直接预览</span>
            <a href={blobUrl} download={file.filename}>
              <DownloadOutlined /> 点击下载
            </a>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ── 工作区文件侧边栏 ────────────────────────────────────────────────────
function WorkspaceFilesDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<MarkdownFile | null>(null);
  const { selectedAgent } = useAgentStore();

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await workspaceApi.listFiles();
      setFiles(list);
    } catch (err) {
      console.error("Failed to load workspace files:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadFiles();
  }, [open, loadFiles, selectedAgent]);

  const isDesktop = !!window.pywebview?.api?.reveal_file;

  const handleReveal = useCallback((file: MarkdownFile) => {
    if (!window.pywebview?.api?.reveal_file) return;
    const ok = window.pywebview.api.reveal_file(file.path);
    if (!ok) message.error("文件不存在或无法打开");
  }, []);

  // Download file: use pywebview native save dialog on desktop, fallback to <a download> on browser
  const handleDownload = useCallback(async (file: MarkdownFile) => {
    try {
      const headers = buildAuthHeaders();
      const rawUrl = getApiUrl(
        `/workspace/files/raw/${encodeURIComponent(file.filename)}`,
      );

      // Desktop: use pywebview native save_file dialog
      // pywebview's save_file uses urllib which can't send auth headers,
      // so we pass the token as a query parameter
      const pywebview = (window as any).pywebview;
      if (pywebview?.api?.save_file) {
        // Append auth token and workspace dir as query params
        const token = localStorage.getItem("qwenpaw_auth_token") || "";
        const wsStorage = localStorage.getItem("qwenpaw-workspace-dir");
        let wsDir = "";
        try {
          if (wsStorage) {
            wsDir = JSON.parse(wsStorage)?.state?.workspaceDir || "";
          }
        } catch {}
        const params = new URLSearchParams();
        if (token) params.set("token", token);
        if (wsDir) params.set("workspace_dir", wsDir);
        const urlWithParams = params.toString()
          ? `${rawUrl}?${params.toString()}`
          : rawUrl;

        // IMPORTANT: pywebview save_file requires an absolute URL.
        // getApiUrl returns a relative path like "/api/workspace/files/raw/xxx"
        // so we must prepend window.location.origin for the Python urllib to work.
        const absoluteUrl = urlWithParams.startsWith("http")
          ? urlWithParams
          : `${window.location.origin}${urlWithParams}`;

        pywebview.api.save_file(absoluteUrl, file.filename).then((result: any) => {
          if (result === true || result === "true") {
            message.success("文件已保存");
          } else {
            // result === false: user cancelled or error occurred
            // Fallback to browser download
            doBrowserDownload(rawUrl, file.filename, headers);
          }
        }).catch(() => {
          // Fallback to browser download
          doBrowserDownload(rawUrl, file.filename, headers);
        });
        return;
      }

      // Browser fallback: fetch blob + <a download>
      await doBrowserDownload(rawUrl, file.filename, headers);
    } catch (err: any) {
      console.error("Download failed:", err);
      message.error("下载失败: " + (err?.message || "未知错误"));
    }
  }, []);

  const doBrowserDownload = async (url: string, filename: string, headers: Record<string, string>) => {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${response.status}`);
    const blob = await response.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  };

  return (
    <>
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
              <SparkLocalFileLine style={{ color: "#1961AC" }} />
              工作区文件
            </span>
            {files.length > 0 && (
              <Tag color="blue" style={{ margin: 0 }}>
                {files.length}
              </Tag>
            )}
          </div>
        }
        placement="right"
        width={380}
        onClose={onClose}
        open={open}
        extra={
          <Tooltip title="刷新">
            <ReloadOutlined
              onClick={loadFiles}
              style={{ cursor: "pointer", color: "#1961AC" }}
            />
          </Tooltip>
        }
        styles={{
          body: { padding: "12px 16px", background: "#fbfcfe" },
          header: { borderBottom: "1px solid #f0f0f0", background: "#fbfcfe" },
        }}
        closeIcon={<span />}
      >
        {files.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: "#bbb", fontSize: 13 }}>
                暂无文件
                <br />
                <span style={{ fontSize: 11 }}>AI 生成的文件会出现在这里</span>
              </span>
            }
            style={{ marginTop: 80 }}
          />
        ) : (
          <List
            loading={loading}
            dataSource={files}
            renderItem={(file) => (
              <List.Item
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #f0f0f0",
                  marginBottom: 8,
                  background: "#fff",
                }}
              >
                <div style={{ width: "100%" }}>
                  {/* 文件名 */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <FileTextOutlined
                      style={{ fontSize: 16, color: "#1961AC" }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={file.filename}
                    >
                      {file.filename}
                    </span>
                  </div>

                  {/* 路径 */}
                  {file.path && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#999",
                        marginBottom: 8,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={file.path}
                    >
                      {file.path}
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {isPreviewable(file.filename) && (
                      <button
                        onClick={() => setPreviewFile(file)}
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
                        <EyeOutlined /> 预览
                      </button>
                    )}

                    <button
                      onClick={() => handleDownload(file)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        fontSize: 12,
                        color: "#52c41a",
                        background: "#f6ffed",
                        border: "1px solid #d9f7be",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      <DownloadOutlined /> 下载
                    </button>

                    {isDesktop && (
                      <button
                        onClick={() => handleReveal(file)}
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
                    )}
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Drawer>

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </>
  );
}

// ── ChatActionGroup ───────────────────────────────────────────────────
const ChatActionGroup: React.FC = () => {
  const { t } = useTranslation();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planEnabled, setPlanEnabled] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const { createSession } = useChatAnywhereSessions();
  const { selectedAgent } = useAgentStore();

  useEffect(() => {
    let cancelled = false;
    planApi
      .getPlanConfig()
      .then((cfg) => {
        if (!cancelled) setPlanEnabled(cfg.enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedAgent]);

  // Listen for "new chat" requests from the sidebar history section.
  // The sidebar lives outside the chat context, so it dispatches a window
  // event instead of calling createSession directly.
  useEffect(() => {
    const handler = () => createSession();
    window.addEventListener("crecpaw:new-chat", handler);
    // Handle a pending request queued while navigating to /chat
    if (sessionStorage.getItem("crecpaw_pending_new_chat") === "1") {
      sessionStorage.removeItem("crecpaw_pending_new_chat");
      const timer = setTimeout(handler, 400);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("crecpaw:new-chat", handler);
      };
    }
    return () => {
      window.removeEventListener("crecpaw:new-chat", handler);
    };
  }, [createSession]);

  return (
    <Flex gap={8} align="center">
      {planEnabled && (
        <Tooltip title={t("plan.title", "Plan")} mouseEnterDelay={0.5}>
          <IconButton
            bordered={false}
            icon={<PlanIcon />}
            onClick={() => setPlanOpen(true)}
          />
        </Tooltip>
      )}
      <Tooltip title="工作区文件" mouseEnterDelay={0.5}>
        <IconButton
          bordered={false}
          icon={<SparkLocalFileLine />}
          onClick={() => setFilesOpen(true)}
        />
      </Tooltip>
      <Tooltip title={t("chat.newChatTooltip")} mouseEnterDelay={0.5}>
        <IconButton
          bordered={false}
          icon={<SparkNewChatFill />}
          onClick={() => createSession()}
        />
      </Tooltip>
      <Tooltip title={t("chat.searchTooltip")} mouseEnterDelay={0.5}>
        <IconButton
          bordered={false}
          icon={<SparkSearchLine />}
          onClick={() => setSearchOpen(true)}
        />
      </Tooltip>
      <Tooltip title={t("chat.chatHistoryTooltip")} mouseEnterDelay={0.5}>
        <IconButton
          bordered={false}
          icon={<SparkHistoryLine />}
          onClick={() => setHistoryOpen(true)}
        />
      </Tooltip>
      <ChatSessionDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
      <ChatSearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
      {planEnabled && (
        <PlanPanel open={planOpen} onClose={() => setPlanOpen(false)} />
      )}
      <WorkspaceFilesDrawer
        open={filesOpen}
        onClose={() => setFilesOpen(false)}
      />
    </Flex>
  );
};

export default ChatActionGroup;
