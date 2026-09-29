import { useState } from "react";
import { Tooltip, message } from "antd";
import { LoadingOutlined, StarFilled } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { promptApi } from "../../../../api/modules/prompt";
import styles from "./index.module.less";

/**
 * Sparkle button (WorkBuddy's "星光按钮"): sits in the input action
 * bar; one click takes the current rough draft and rewrites it into a
 * structured, complete task prompt via the backend LLM, streaming the
 * result back into the input box.
 *
 * Reading/writing the input: the chat library does not expose input
 * content through its context (only loading/disabled), so we talk to
 * the textarea directly — reading `textarea.value` and writing through
 * the native value setter so React's onChange picks the change up
 * (setting `.value` directly would be swallowed by React's synthetic
 * event system).
 */

function getInputTextarea(): HTMLTextAreaElement | null {
  const el = document.querySelector<HTMLTextAreaElement>(
    ".qwenpaw-sender textarea, .qwenpaw-chat-input textarea, textarea",
  );
  return el;
}

function readInputValue(): string {
  return getInputTextarea()?.value ?? "";
}

function writeInputValue(text: string): void {
  const textarea = getInputTextarea();
  if (!textarea) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  // Make the optimized text visible even if the textarea was collapsed
  textarea.focus();
}

export default function PromptSparkleButton() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    if (loading) return;
    const current = readInputValue();
    if (!current.trim()) {
      message.info(
        t("sparkle.emptyInput", "先写下你的需求，哪怕一句话也行"),
      );
      return;
    }

    setLoading(true);
    let enhanced = "";
    promptApi.enhance(current, "zh", {
      onDelta: (text) => {
        enhanced += text;
        writeInputValue(enhanced);
      },
      onDone: () => {
        setLoading(false);
        message.success(t("sparkle.done", "已优化为结构化提示词"));
      },
      onError: (err) => {
        setLoading(false);
        message.error(t("sparkle.error", "优化失败") + `: ${err}`);
      },
    });
  };

  return (
    <Tooltip
      title={t(
        "sparkle.tooltip",
        "AI 优化提示词：把一句话需求扩写成结构化任务指令",
      )}
      mouseEnterDelay={0.5}
    >
      <button
        type="button"
        className={styles.sparkleBtn}
        onClick={handleClick}
        disabled={loading}
        aria-label="enhance prompt"
      >
        {loading ? (
          <LoadingOutlined className={styles.sparkleIcon} spin />
        ) : (
          <StarFilled className={styles.sparkleIcon} />
        )}
      </button>
    </Tooltip>
  );
}
