import { useSyncExternalStore } from "react";
import { CloseOutlined, UserOutlined, RobotOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/**
 * Quote preview bar above the input box (WorkBuddy-style message quote).
 *
 * When the user quotes a message, this compact bar appears ABOVE the
 * input field: source avatar + role + truncated excerpt + remove ✕.
 * The quoted text itself is NOT dumped into the textarea — it is kept
 * here and merged into the outgoing message only on submit, so the
 * input stays clean.
 *
 * Global state (module-level) so the quote action button and this bar
 * can communicate without prop drilling through the chat library.
 */

export interface QuotedMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

let quotedMessage: QuotedMessage | null = null;
const listeners = new Set<(q: QuotedMessage | null) => void>();

export function setQuotedMessage(q: QuotedMessage | null): void {
  quotedMessage = q;
  listeners.forEach((fn) => fn(q));
}

export function getQuotedMessage(): QuotedMessage | null {
  return quotedMessage;
}

/** Consume the current quote (called on submit) and clear it. */
export function takeQuotedMessage(): QuotedMessage | null {
  const q = quotedMessage;
  quotedMessage = null;
  listeners.forEach((fn) => fn(null));
  return q;
}

function subscribeQuoted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useQuotedMessage(): QuotedMessage | null {
  // useSyncExternalStore: reliable external-state subscription (the
  // earlier useState(() => listener) trick never ran its cleanup and
  // could silently miss updates).
  return useSyncExternalStore(
    subscribeQuoted,
    () => quotedMessage,
    () => null,
  );
}

const MAX_EXCERPT = 80;

export default function QuotePreviewBar() {
  const { t } = useTranslation();
  const quoted = useQuotedMessage();

  if (!quoted) return null;

  const isUser = quoted.role === "user";
  const excerpt =
    quoted.text.length > MAX_EXCERPT
      ? quoted.text.slice(0, MAX_EXCERPT) + "…"
      : quoted.text;

  return (
    <div className="quote-preview-bar" style={barStyle}>
      <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", color: isUser ? "#1961ac" : "#52c41a" }}>
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(0,0,0,0.45)",
          flexShrink: 0,
        }}
      >
        {isUser ? t("quote.you", "我") : t("quote.assistant", "小铁智友")}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "rgba(0,0,0,0.65)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {excerpt}
      </span>
      <button
        type="button"
        onClick={() => setQuotedMessage(null)}
        style={{
          border: "none",
          background: "transparent",
          color: "rgba(0,0,0,0.35)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          padding: 2,
          flexShrink: 0,
        }}
        aria-label={t("quote.remove", "取消引用")}
        title={t("quote.remove", "取消引用")}
      >
        <CloseOutlined style={{ fontSize: 11 }} />
      </button>
    </div>
  );
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  margin: "0 12px 4px",
  borderRadius: 8,
  background: "rgba(25, 97, 172, 0.05)",
  borderLeft: "3px solid #1961ac",
};
