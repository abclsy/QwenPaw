// -*- coding: utf-8 -*-
// Artifact system notification (产物系统通知) — WorkBuddy 5.7.5 parity.
//
// When a task produces files, fire a desktop notification; clicking it
// reveals the file in the OS file manager (Finder / Explorer). Uses the
// standard Web Notifications API — supported by both WebView2 (Windows)
// and WKWebView (macOS) in pywebview. Click routes through the existing
// pywebview bridge `reveal_file`, which opens the containing folder and
// selects the file.
// (Window.pywebview typing lives in src/vite-env.d.ts.)

const NOTIFICATION_SUPPORT_KEY = "qwenpaw-artifact-notify-enabled";

/** Per-session dedup: don't re-notify for the same file. */
const notifiedThisSession = new Set<string>();

export function isArtifactNotifySupported(): boolean {
  return typeof Notification !== "undefined";
}

export function isArtifactNotifyEnabled(): boolean {
  if (!isArtifactNotifySupported()) return false;
  const stored = localStorage.getItem(NOTIFICATION_SUPPORT_KEY);
  // Default ON; only an explicit "false" disables.
  return stored !== "false";
}

export function setArtifactNotifyEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATION_SUPPORT_KEY, enabled ? "true" : "false");
}

/** Request permission once, on first user gesture. */
export async function ensureArtifactNotifyPermission(): Promise<boolean> {
  if (!isArtifactNotifySupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/**
 * Notify that a task produced a file. Clicking reveals it in the OS
 * file manager via the pywebview bridge.
 *
 * @param filename  display name, e.g. "变更索赔函.docx"
 * @param filePath  absolute local path (for reveal_file)
 */
export function notifyArtifactProduced(
  filename: string,
  filePath: string,
): void {
  if (!isArtifactNotifyEnabled()) return;
  if (Notification.permission !== "granted") return;
  // Dedup per session (a re-render must not spam).
  if (notifiedThisSession.has(filePath)) return;
  notifiedThisSession.add(filePath);

  try {
    const notification = new Notification("小铁智友 · 文件已生成", {
      body: `${filename}\n点击在文件夹中查看`,
      tag: `qwenpaw-artifact:${filePath}`,
    });

    notification.onclick = () => {
      // Focus the app window and reveal the file.
      window.focus();
      const reveal = window.pywebview?.api?.reveal_file;
      if (reveal) {
        void reveal(filePath).catch((err) =>
          console.error("reveal_file failed:", err),
        );
      }
      notification.close();
    };
  } catch (err) {
    console.warn("artifact notification failed:", err);
  }
}
