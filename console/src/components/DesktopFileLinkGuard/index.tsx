import { useEffect } from "react";
import { message } from "antd";

/**
 * Global guard that keeps file links from navigating the desktop webview.
 *
 * pywebview's webview (WKWebView on macOS / WebView2 on Windows) does not
 * support the HTML `download` attribute. A bare `<a href="/api/files/...">`
 * or `<a href="/api/files/..." download>` click therefore makes the webview
 * navigate away from the SPA and render the file inline — the React app is
 * destroyed, there is no way back, and the window appears frozen (this was
 * the root cause of the "preview a PDF then the app hangs" bug).
 *
 * This guard captures clicks (in the capture phase, before any other
 * handler) on anchors pointing at backend file URLs and, in the desktop
 * environment, routes them to the native bridge instead:
 *   - known local path + preview_file → open with the OS default app
 *   - otherwise → save_file native save dialog
 * HTML files are excluded because the chat UI already previews them via a
 * dedicated page with a back button.
 */

/** Decode a local file path from a `/files/preview/...` style URL. */
function extractFilePath(url: string): string {
  try {
    const match = url.match(/\/files\/preview\/(.+)$/);
    if (!match) return "";
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

const FILE_URL_RE = /\/(api\/)?files\/preview\//;

function isDesktopEnv(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.pywebview?.api?.preview_file
  );
}

export default function DesktopFileLinkGuard() {
  useEffect(() => {
    if (!isDesktopEnv()) return;

    const onClickCapture = (e: MouseEvent) => {
      // Only intercept plain left-clicks without modifiers
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;

      const anchor = (e.target as HTMLElement | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      if (!FILE_URL_RE.test(href)) return;

      // HTML previews have their own in-app flow with a back button
      if (/\.html?(\?|$)/i.test(href)) return;

      // The chat UI handles its own downloads via save_file already —
      // skip anchors that explicitly opted out of the guard.
      if (anchor.hasAttribute("data-native-file-handler")) return;

      e.preventDefault();
      e.stopPropagation();

      const apiUrl = anchor.href;
      const filePath = extractFilePath(apiUrl);
      const filename =
        anchor.getAttribute("download") ||
        decodeURIComponent(apiUrl.split("/").pop() || "file");

      const api = window.pywebview!.api;
      // Prefer opening with the system application (Preview for PDFs etc.)
      if (filePath && api.preview_file) {
        api.preview_file(filePath).then((ok) => {
          if (!ok) {
            message.warning(
              filePath ? "文件不存在或无法打开" : "无法预览该文件",
            );
          }
        });
        return;
      }
      // Fallback: native save dialog
      if (api.save_file) {
        api.save_file(apiUrl, filename);
      }
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  return null;
}
