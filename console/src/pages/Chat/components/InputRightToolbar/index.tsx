import styles from "./index.module.less";
import PromptSparkleButton from "../PromptSparkleButton";
import VoiceInputButton from "../VoiceInputButton";

/**
 * Right-side input toolbar: sparkle (prompt enhance) + voice input,
 * positioned visually inside the input's right action column —
 * between the attachments button and the send button — via absolute
 * positioning (the chat library does not expose an actions slot).
 */
export default function InputRightToolbar() {
  return (
    <div className={styles.rightToolbar}>
      <PromptSparkleButton />
      <VoiceInputButton />
    </div>
  );
}
