import { buildAuthHeaders } from "../authHeaders";
import { getApiUrl } from "../config";

/**
 * Prompt enhance API — the "sparkle button" backend.
 * Streams the rewritten prompt as SSE text deltas.
 */

export interface EnhanceCallbacks {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export const promptApi = {
  /**
   * Enhance a rough prompt (SSE stream).
   * Returns an abort function.
   */
  enhance(
    content: string,
    language: string,
    callbacks: EnhanceCallbacks,
  ): () => void {
    const controller = new AbortController();

    const run = async () => {
      try {
        const resp = await fetch(getApiUrl("/console/prompt/enhance"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeaders(),
          },
          body: JSON.stringify({ content, language }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          callbacks.onError(`HTTP ${resp.status}`);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames separated by blank lines
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.error) {
                callbacks.onError(payload.error);
                return;
              }
              if (payload.done) {
                callbacks.onDone();
                return;
              }
              if (payload.text) callbacks.onDelta(payload.text);
            } catch {
              // ignore malformed frame
            }
          }
        }
        callbacks.onDone();
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        callbacks.onError(String(e ?? "network error"));
      }
    };

    void run();
    return () => controller.abort();
  },

  /** Non-streaming convenience used by tests */
  enhanceUrl: () => getApiUrl("/console/prompt/enhance"),
};

export default promptApi;
