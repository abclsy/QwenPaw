import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Spin } from "antd";
import { ReloadOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useTheme } from "../../contexts/ThemeContext";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export default function OAuthBridge() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [authDone, setAuthDone] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // 从 sessionStorage 读取 OAuth URL
  const authUrl = (() => {
    const url = sessionStorage.getItem("_oauth_url");
    if (!url) {
      navigate("/login", { replace: true });
      return "";
    }
    return url;
  })();

  // 检查 iframe 中 OAuth 是否完成（同源时可读取 code 参数）
  const checkAuthComplete = useCallback(() => {
    if (!iframeRef.current) return false;
    try {
      const win = iframeRef.current.contentWindow;
      if (!win) return false;
      const url = new URL(win.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        sessionStorage.removeItem("_oauth_url");
        setAuthDone(true);
        setTimeout(() => {
          window.location.href = url.toString();
        }, 100);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // 重载 iframe（手动或自动），用函数式 setState 避免闭包过期
  const reloadIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    setRetryCount((prev) => {
      if (prev >= MAX_RETRIES) return prev;
      const sep = authUrl.includes("?") ? "&" : "?";
      iframe.src = authUrl + sep + "_crec_t=" + Date.now();
      setIframeLoaded(false);
      return prev + 1;
    });
  }, [authUrl]);

  // iframe 加载完成
  const handleIframeLoad = useCallback(() => {
    if (checkAuthComplete()) return;

    // 检测 X-Frame-Options 拦截
    try {
      const iframe = iframeRef.current;
      if (iframe?.contentDocument === null) {
        try {
          const w = iframe.contentWindow;
          if (w && w.location.href === "about:blank") {
            setBlocked(true);
            return;
          }
        } catch {
          // 跨域 → 正常
        }
      }
    } catch {
      // 跨域 → 正常
    }

    setIframeLoaded(true);
  }, [checkAuthComplete]);

  // 自动重试定时器
  useEffect(() => {
    if (!iframeLoaded || authDone || blocked) return;
    if (retryCount >= MAX_RETRIES) return;

    const timer = setTimeout(() => {
      reloadIframe();
    }, RETRY_DELAY_MS);

    return () => clearTimeout(timer);
  }, [iframeLoaded, authDone, blocked, retryCount, reloadIframe]);

  const handleDirectRedirect = () => {
    sessionStorage.removeItem("_oauth_url");
    window.location.href = authUrl;
  };

  const handleBack = () => {
    sessionStorage.removeItem("_oauth_url");
    navigate("/login", { replace: true });
  };

  if (authDone) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: isDark ? "#141414" : "#f5f5f5",
        }}
      >
        <Spin size="large" />
        <p style={{ marginTop: 20, color: isDark ? "#fff" : "#333" }}>
          认证完成，正在跳转...
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: isDark ? "#141414" : "#f5f5f5",
      }}
    >
      {/* 顶部操作栏 */}
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: isDark ? "#1f1f1f" : "#fff",
          borderBottom: `1px solid ${isDark ? "#333" : "#e8e8e8"}`,
          flexShrink: 0,
        }}
      >
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回
        </Button>

        <span
          style={{
            fontSize: 14,
            color: isDark ? "rgba(255,255,255,0.65)" : "#666",
          }}
        >
          中铁统一认证
          {retryCount > 0 && `（已刷新 ${retryCount}/${MAX_RETRIES}）`}
        </span>

        <Button
          type="text"
          icon={<ReloadOutlined />}
          onClick={reloadIframe}
          disabled={retryCount >= MAX_RETRIES}
        >
          刷新
        </Button>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, position: "relative" }}>
        {blocked ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              padding: 40,
            }}
          >
            <p
              style={{
                color: isDark ? "rgba(255,255,255,0.65)" : "#666",
                fontSize: 14,
                textAlign: "center",
              }}
            >
              无法在当前页面加载认证页面，请点击下方按钮直接跳转
            </p>
            <Button type="primary" size="large" onClick={handleDirectRedirect}>
              前往中铁统一认证
            </Button>
          </div>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              src={authUrl}
              onLoad={handleIframeLoad}
              style={{ width: "100%", height: "100%", border: "none" }}
              title="中铁统一认证"
            />
            {retryCount === 0 && !iframeLoaded && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isDark
                    ? "rgba(20,20,20,0.9)"
                    : "rgba(245,245,245,0.9)",
                }}
              >
                <Spin size="large" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
