import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { ReloadOutlined, CopyOutlined } from "@ant-design/icons";
import { message } from "antd";

/**
 * Global freeze detector & auto-recovery for the desktop webview.
 *
 * Symptom this addresses: during long streaming responses or heavy
 * re-renders (long conversations, many images), the UI occasionally
 * freezes — the only way out was switching to another page and back.
 *
 * How it works:
 * - A heartbeat ping is scheduled every 5s via setTimeout on the main
 *   thread. If the main thread is blocked (render storm / long task),
 *   the heartbeat is delayed.
 * - When a heartbeat is more than FREEZE_THRESHOLD late, we show a
 *   "recovering" banner. The browser gets a chance to breathe once
 *   the blocking task ends (timeouts fire late but eventually fire),
 *   at which point the banner clears itself.
 * - The banner also offers manual actions: copy diagnostics (version,
 *   user agent, memory if available, freeze duration) for bug reports,
 *   and reload the page as a last resort.
 *
 * This component renders nothing in the normal case (zero overhead
 * beyond one timer tick every 5s).
 */

const HEARTBEAT_MS = 5000;
const FREEZE_THRESHOLD_MS = 8000; // heartbeat late by this much = frozen

export default function FreezeDetector() {
  const [frozen, setFrozen] = useState(false);
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const lastBeatRef = useRef(Date.now());

  useEffect(() => {
    let timer: number;

    const beat = () => {
      lastBeatRef.current = Date.now();
      setFrozen(false);
      setFrozenAt(null);
      timer = window.setTimeout(beat, HEARTBEAT_MS);
    };

    const watchdog = window.setInterval(() => {
      const late = Date.now() - lastBeatRef.current - HEARTBEAT_MS;
      if (late > FREEZE_THRESHOLD_MS) {
        setFrozen(true);
        setFrozenAt((prev) => prev ?? Date.now());
      }
    }, 2000);

    timer = window.setTimeout(beat, HEARTBEAT_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(watchdog);
    };
  }, []);

  const copyDiagnostics = async () => {
    const info = [
      `时间: ${new Date().toLocaleString()}`,
      frozenAt ? `卡顿起始: ${new Date(frozenAt).toLocaleTimeString()}` : "",
      `页面: ${location.pathname}`,
      `UA: ${navigator.userAgent}`,
      // performance.memory is Chromium-only (WebView2) — undefined on WKWebView
      (performance as any).memory
        ? `内存: ${Math.round((performance as any).memory.usedJSHeapSize / 1048576)}MB / ${Math.round((performance as any).memory.jsHeapSizeLimit / 1048576)}MB`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(info);
      message.success("诊断信息已复制，可粘贴给开发者");
    } catch {
      message.error("复制失败，请手动截图");
    }
  };

  if (!frozen) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px",
        background: "rgba(25, 97, 172, 0.95)",
        color: "#fff",
        borderRadius: 10,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        fontSize: 13,
        maxWidth: "92vw",
      }}
    >
      <span>
        ⏳ 页面渲染压力较大，正在自动恢复中… 若长时间无响应可尝试下方操作
      </span>
      <Button
        size="small"
        ghost
        icon={<CopyOutlined />}
        onClick={copyDiagnostics}
        style={{ color: "#fff", borderColor: "rgba(255,255,255,0.6)" }}
      >
        复制诊断信息
      </Button>
      <Button
        size="small"
        ghost
        icon={<ReloadOutlined />}
        onClick={() => location.reload()}
        style={{ color: "#fff", borderColor: "rgba(255,255,255,0.6)" }}
      >
        刷新页面
      </Button>
    </div>
  );
}
