import { useRef, useState } from "react";
import { Tooltip, message } from "antd";
import { AudioOutlined, LoadingOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "../../../../api/config";
import { buildAuthHeaders } from "../../../../api/authHeaders";
import { writeInputValue } from "../PromptSparkleButton";
import styles from "./index.module.less";

/**
 * Voice input microphone: the chat library's built-in speech button
 * uses the browser SpeechRecognition API, which WebView2/WKWebView do
 * not implement (that's why clicking it did nothing). This button
 * records via MediaRecorder, uploads the audio to
 * POST /console/voice/transcribe, and inserts the transcribed text
 * into the input box.
 */
export default function VoiceInputButton() {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopAndTranscribe = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const handleClick = async () => {
    if (transcribing) return;

    if (recording) {
      stopAndTranscribe();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, {
          type: mime || "audio/webm",
        });
        if (blob.size === 0) return;

        setTranscribing(true);
        try {
          const form = new FormData();
          form.append(
            "audio",
            new File([blob], "record.webm", { type: blob.type }),
          );
          const resp = await fetch(
            getApiUrl("/console/voice/transcribe"),
            {
              method: "POST",
              headers: { ...buildAuthHeaders() },
              body: form,
            },
          );
          const payload = await resp.json();
          if (!resp.ok) {
            message.error(
              t("voiceInput.error", "语音识别失败") +
                `: ${payload?.detail ?? resp.status}`,
            );
            return;
          }
          const text: string = payload.text ?? "";
          if (text) {
            writeInputValue(text);
          }
        } catch (e: any) {
          message.error(t("voiceInput.error", "语音识别失败") + `: ${e}`);
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (e: any) {
      message.error(
        t("voiceInput.micDenied", "无法访问麦克风") + `: ${e?.message ?? e}`,
      );
    }
  };

  return (
    <Tooltip
      title={
        recording
          ? t("voiceInput.stop", "点击结束录音并转文字")
          : t("voiceInput.tooltip", "语音输入：录音后自动转为文字")
      }
      mouseEnterDelay={0.4}
    >
      <button
        type="button"
        className={`${styles.micBtn} ${recording ? styles.micRecording : ""}`}
        onClick={handleClick}
        disabled={transcribing}
        aria-label="voice input"
      >
        {transcribing ? (
          <LoadingOutlined spin />
        ) : (
          <AudioOutlined />
        )}
      </button>
    </Tooltip>
  );
}
