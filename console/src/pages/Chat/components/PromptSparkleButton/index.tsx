import { useEffect, useState } from "react";
import { Tooltip, message } from "antd";
import { LoadingOutlined, StarFilled } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { promptApi } from "../../../../api/modules/prompt";
import styles from "./index.module.less";

/**
 * Sparkle button (WorkBuddy's "星光按钮"): rewrites the current rough
 * draft into a structured task prompt via the backend LLM, streaming
 * the result back into the input box.
 *
 * UX details (per user feedback):
 * - Lives in the RIGHT-side toolbar of the input area, next to the
 *   voice button and the send button.
 * - Only visible when the input box has text (hidden when empty).
 *
 * Reading/writing the input: the chat library does not expose input
 * content through its context, so we talk to the textarea directly —
 * writing through the native value setter + input event so React's
 * onChange picks it up.
 */

function getInputTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    ".qwenpaw-sender textarea, .qwenpaw-chat-input textarea, textarea",
  );
}

export function readInputValue(): string {
  return getInputTextarea()?.value ?? "";
}

export function writeInputValue(text: string): void {
  const textarea = getInputTextarea();
  if (!textarea) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

/** Subscribe to input-box text changes (textarea may mount late). */
function useInputHasText(): boolean {
  const [hasText, setHasText] = useState(false);

  useEffect(() => {
    const check = () => {
      setHasText(Boolean(readInputValue().trim()));
    };
    // Initial + late-mount check
    check();
    const timer = window.setInterval(check, 500);
    document.addEventListener("input", check, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("input", check, true);
    };
  }, []);

  return hasText;
}

export default function PromptSparkleButton() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const hasText = useInputHasText();

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

  // Hidden until the user has typed something (also stays visible
  // while enhancing). Rendered inside the right-side toolbar.
  if (!hasText && !loading) return null;

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
