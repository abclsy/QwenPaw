import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./index.module.less";
import PromptSparkleButton from "../PromptSparkleButton";
import VoiceInputButton from "../VoiceInputButton";

/**
 * Right-side input toolbar: sparkle (prompt enhance) + voice input,
 * rendered INSIDE the sender's action column, to the LEFT of the send
 * button — via React portal into .qwenpaw-sender-actions.
 *
 * Why a portal: the chat library's Sender has no actions slot (its
 * `actions` prop replaces the send button entirely, and ChatAnywhere
 * doesn't even forward it), and CSS absolute positioning proved
 * brittle (buttons drifted away from the input box). Portaling into
 * the real actions container guarantees pixel-perfect placement and
 * survives layout changes.
 *
 * The element is re-queried periodically because the sender remounts
 * on session switches / page navigations.
 */
export default function InputRightToolbar() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(
        ".qwenpaw-sender-actions-list",
      );
      if (el && el !== host) setHost(el);
    };
    find();
    const timer = window.setInterval(find, 800);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [host]);

  if (!host) return null;

  return createPortal(
    <div className={styles.rightToolbar}>
      <PromptSparkleButton />
      <VoiceInputButton />
    </div>,
    host,
  );
}
