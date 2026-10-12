import { useState, useCallback, useMemo } from "react";
import { Button, Input, Space, Tag } from "antd";
import {
  CloseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EnterOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "./FindReplaceBar.module.less";

export interface FindReplaceBarProps {
  /** Current full text of the editor. */
  value: string;
  /** Called with the new text after a replacement. */
  onChange: (next: string) => void;
  /** Target textarea element (for selection & scroll). */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
}

/**
 * Find & replace toolbar for the workspace file editor (P4).
 *
 * ⌘F/Ctrl+F opens it; Enter jumps to the next match, Shift+Enter the
 * previous one. The current match is selected in the textarea so it
 * scrolls into view. Replacement rewrites the text via onChange.
 */
export default function FindReplaceBar({
  value,
  onChange,
  textareaRef,
  onClose,
}: FindReplaceBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [pos, setPos] = useState(0); // index into matches

  const matches = useMemo<number[]>(() => {
    if (!query) return [];
    const res: number[] = [];
    const hay = value;
    const needle = query.toLowerCase();
    let i = hay.toLowerCase().indexOf(needle);
    while (i !== -1) {
      res.push(i);
      i = hay.toLowerCase().indexOf(needle, i + needle.length);
    }
    return res;
  }, [query, value]);

  const focusMatch = useCallback(
    (idx: number) => {
      if (matches.length === 0) return;
      const safeIdx =
        ((idx % matches.length) + matches.length) % matches.length;
      setPos(safeIdx);
      const start = matches[safeIdx];
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(start, start + query.length);
        // Scroll the selection into view.
        const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || "20");
        const before = value.slice(0, start).split("\n").length - 1;
        ta.scrollTop = Math.max(0, before * lineHeight - ta.clientHeight / 2);
      }
    },
    [matches, query, textareaRef, value],
  );

  const next = useCallback(() => focusMatch(pos + 1), [focusMatch, pos]);
  const prev = useCallback(
    () => focusMatch(pos - 1 + matches.length),
    [focusMatch, matches.length, pos, focusMatch],
  );

  const replaceCurrent = useCallback(() => {
    if (matches.length === 0) return;
    const start = matches[pos];
    const next =
      value.slice(0, start) + replacement + value.slice(start + query.length);
    onChange(next);
    // After text change, re-focus the (shifted) next match.
    requestAnimationFrame(() => focusMatch(pos));
  }, [matches, onChange, pos, query.length, replacement, value, focusMatch]);

  const replaceAll = useCallback(() => {
    if (!query || matches.length === 0) return;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    onChange(value.replace(re, replacement));
  }, [matches.length, onChange, query, replacement, value]);

  return (
    <div className={styles.bar}>
      <Space.Compact style={{ width: "100%" }} block>
        <Input
          size="small"
          allowClear
          placeholder={t("workspace.find", "查找")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPos(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.shiftKey ? prev() : next();
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          prefix={<ArrowUpOutlined style={{ opacity: 0.35 }} />}
        />
        <Button
          size="small"
          icon={<ArrowUpOutlined />}
          disabled={matches.length === 0}
          onClick={prev}
          title={t("workspace.findPrev", "上一个")}
        />
        <Button
          size="small"
          icon={<ArrowDownOutlined />}
          disabled={matches.length === 0}
          onClick={next}
          title={t("workspace.findNext", "下一个")}
        />
        <div className={styles.count}>
          {matches.length > 0 ? (
            <Tag style={{ margin: 0, lineHeight: "20px" }}>
              {pos + 1}/{matches.length}
            </Tag>
          ) : query ? (
            <span className={styles.none}>
              {t("workspace.noMatches", "无匹配")}
            </span>
          ) : null}
        </div>
        <Button
          size="small"
          type="text"
          onClick={() => setShowReplace((v) => !v)}
          title={t("workspace.toggleReplace", "切换替换")}
        >
          {showReplace ? "⌄" : "⌃"}
        </Button>
        <Button
          size="small"
          type="text"
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      </Space.Compact>

      {showReplace && (
        <Space.Compact style={{ width: "100%", marginTop: 6 }} block>
          <Input
            size="small"
            allowClear
            placeholder={t("workspace.replace", "替换为")}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                replaceCurrent();
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            prefix={<EnterOutlined style={{ opacity: 0.35 }} />}
          />
          <Button
            size="small"
            disabled={matches.length === 0}
            onClick={replaceCurrent}
          >
            {t("workspace.replaceOne", "替换")}
          </Button>
          <Button
            size="small"
            type="primary"
            disabled={matches.length === 0}
            onClick={replaceAll}
          >
            {t("workspace.replaceAll", "全部替换")}
          </Button>
        </Space.Compact>
      )}
    </div>
  );
}
