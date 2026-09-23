import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spin, Result } from "antd";
import {
  ReloadOutlined,
  ExportOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { useTheme } from "../../contexts/ThemeContext";

// ── 知识库系统地址（与桌面端统一身份对接，独立窗口 + SSO） ──────────────
export const KNOWLEDGE_BASE_URL = "http://10.2.38.143:5173/dashboard";

const LOAD_TIMEOUT_MS = 15000;

/**
 * 知识库页面
 *
 * 桌面端（pywebview）：点菜单即打开独立原生窗口。统一认证（tyrz.crec.cn）
 * 禁止在跨站 iframe 中完成 OAuth 登录（报「登录地址存在安全风险」），
 * 独立顶层窗口共享 webview cookie store，可直接复用主窗口的 SSO 会话。
 *
 * 浏览器端：回退为 iframe 嵌入展示（若 IdP 拦截登录，提示用新窗口打开）。
 */
export default function KnowledgeBasePage() {
  const { isDark } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  // 检测是否桌面端（pywebview 环境）
  useEffect(() => {
    const pywebview = (window as any).pywebview;
    if (pywebview?.api?.open_knowledge_base) {
      // 桌面端：直接打开独立原生窗口，本页仅展示引导
      setIsDesktop(true);
      pywebview.api.open_knowledge_base(KNOWLEDGE_BASE_URL);
    } else {
      setIsDesktop(false);
    }
  }, []);

  // 加载超时兜底：内网服务不可达时给出明确提示，而不是永远转圈
  useEffect(() => {
    if (isDesktop !== false) return; // 仅 iframe 模式需要
    setLoaded(false);
    setTimedOut(false);
    loadedRef.current = false;
    const timer = setTimeout(() => {
      // 已加载完成则不触发超时
      if (!loadedRef.current) {
        setTimedOut(true);
      }
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [reloadNonce, isDesktop]);

  const handleIframeLoad = useCallback(() => {
    loadedRef.current = true;
    setLoaded(true);
    setTimedOut(false);
  }, []);

  const handleReload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    const url = KNOWLEDGE_BASE_URL;
    const pywebview = (window as any).pywebview;
    if (pywebview?.api?.open_knowledge_base) {
      pywebview.api.open_knowledge_base(url);
    } else if (pywebview?.api?.open_external_link) {
      pywebview.api.open_external_link(url);
    } else {
      window.open(url, "_blank");
    }
  }, []);

  const src = `${KNOWLEDGE_BASE_URL}${reloadNonce > 0 ? (KNOWLEDGE_BASE_URL.includes("?") ? "&" : "?") + "_kb=" + reloadNonce : ""}`;

  // ── 桌面端：独立窗口已拉起，页面显示引导说明 ──────────────────────────
  if (isDesktop) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark ? "#141414" : "#f5f5f5",
          borderRadius: 8,
        }}
      >
        <Result
          icon={<BookOutlined style={{ color: "#1961AC" }} />}
          title="知识库已在独立窗口打开"
          subTitle={
            <span
              style={{
                color: isDark ? "rgba(255,255,255,0.55)" : "#888",
                fontSize: 13,
                lineHeight: 1.9,
              }}
            >
              知识库使用统一身份认证，窗口将自动完成单点登录，无需重复扫码。
              <br />
              若窗口未出现、被关闭或显示登录页，点击下方按钮重新打开；
              <br />
              首次可能需要在窗口中扫码，登录一次后即自动进入。
            </span>
          }
          extra={
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={handleOpenExternal}
            >
              重新打开知识库窗口
            </Button>
          }
        />
      </div>
    );
  }

  // ── 浏览器端：iframe 嵌入（可能被 IdP 拦截登录） ──────────────────────
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: isDark ? "#141414" : "#f5f5f5",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* 顶部工具条 */}
      <div
        style={{
          height: 44,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          background: isDark ? "#1f1f1f" : "#fff",
          borderBottom: `1px solid ${isDark ? "#333" : "#e8e8e8"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BookOutlined style={{ color: "#1961AC" }} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>知识库</span>
          <span
            style={{
              fontSize: 12,
              color: isDark ? "rgba(255,255,255,0.45)" : "#999",
            }}
          >
            {KNOWLEDGE_BASE_URL}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleReload}
          >
            刷新
          </Button>
          <Button
            type="text"
            size="small"
            icon={<ExportOutlined />}
            onClick={handleOpenExternal}
          >
            新窗口打开
          </Button>
        </div>
      </div>

      {/* iframe 内容区 */}
      <div style={{ flex: 1, position: "relative" }}>
        <iframe
          key={reloadNonce}
          ref={iframeRef}
          src={src}
          onLoad={handleIframeLoad}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
          }}
          title="知识库"
        />

        {/* 加载中遮罩 */}
        {!loaded && !timedOut && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              background: isDark
                ? "rgba(20,20,20,0.95)"
                : "rgba(245,245,245,0.95)",
              pointerEvents: "none",
            }}
          >
            <Spin size="large" />
            <span
              style={{
                color: isDark ? "rgba(255,255,255,0.65)" : "#666",
                fontSize: 13,
              }}
            >
              正在加载知识库...
            </span>
          </div>
        )}

        {/* 超时兜底：服务不可达 */}
        {timedOut && !loaded && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isDark ? "#141414" : "#f5f5f5",
            }}
          >
            <Result
              status="warning"
              title="知识库加载超时"
              subTitle={
                <span
                  style={{
                    color: isDark ? "rgba(255,255,255,0.45)" : "#999",
                    fontSize: 13,
                  }}
                >
                  无法连接知识库服务（{KNOWLEDGE_BASE_URL}），请确认网络已接入内网后重试
                </span>
              }
              extra={
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <Button type="primary" onClick={handleReload}>
                    重试
                  </Button>
                  <Button onClick={handleOpenExternal}>新窗口打开</Button>
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
