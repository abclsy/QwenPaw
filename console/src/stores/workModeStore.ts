import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Work-mode store: the ask / plan / craft tri-state.
 *
 * - ask   — lightweight Q&A: no tools, single-pass reply (fastest)
 * - plan  — plan first, user confirms, then execute
 * - craft — full autonomous execution (default, previous behavior)
 *
 * The mode is a per-session UI choice persisted to localStorage so a
 * page refresh keeps the selection. The selected mode is attached to
 * each outgoing query request body (`mode` field) and consumed by the
 * backend runner (see runner.py work-mode extraction).
 */

export type WorkMode = "ask" | "plan" | "craft";

interface WorkModeStore {
  mode: WorkMode;
  /** Session-scoped overrides: session_id -> mode (beats global default) */
  sessionModes: Record<string, WorkMode>;
  setMode: (mode: WorkMode, sessionId?: string) => void;
  getMode: (sessionId?: string) => WorkMode;
}

/** Parse and validate a persisted value; falls back to "craft". */
function coerceMode(value: unknown): WorkMode {
  return value === "ask" || value === "plan" || value === "craft"
    ? value
    : "craft";
}

export const useWorkModeStore = create<WorkModeStore>()(
  persist(
    (set, get) => ({
      mode: "craft",
      sessionModes: {},
      setMode: (mode, sessionId) => {
        if (sessionId) {
          set((state) => ({
            sessionModes: { ...state.sessionModes, [sessionId]: mode },
          }));
        } else {
          set({ mode });
        }
      },
      getMode: (sessionId) => {
        const state = get();
        if (sessionId && state.sessionModes[sessionId]) {
          return state.sessionModes[sessionId];
        }
        return state.mode;
      },
    }),
    {
      name: "qwenpaw-work-mode",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkModeStore>;
        return {
          ...current,
          mode: coerceMode(p.mode),
          sessionModes: Object.fromEntries(
            Object.entries(p.sessionModes ?? {}).map(([k, v]) => [
              k,
              coerceMode(v),
            ]),
          ),
        };
      },
    },
  ),
);
