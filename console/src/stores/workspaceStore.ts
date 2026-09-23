import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Storage key for the user-selected workspace directory.
 * Persisted to localStorage so it survives across sessions.
 */
const STORAGE_KEY = "qwenpaw-workspace-dir";

/** Max number of recently used workspaces kept for quick switching. */
const MAX_RECENT = 5;

interface WorkspaceDirStore {
  /** User-selected workspace directory path, or empty string if not set. */
  workspaceDir: string;
  /** Recently used workspace paths (most recent first, capped at 5). */
  recentWorkspaces: string[];
  /** Set the workspace directory (also records it into recent history). */
  setWorkspaceDir: (dir: string) => void;
  /** Clear the workspace directory selection (recent history is kept). */
  clearWorkspaceDir: () => void;
}

export const useWorkspaceDirStore = create<WorkspaceDirStore>()(
  persist(
    (set) => ({
      workspaceDir: "",
      recentWorkspaces: [],
      setWorkspaceDir: (dir: string) =>
        set((state) => ({
          workspaceDir: dir,
          recentWorkspaces: [
            dir,
            ...state.recentWorkspaces.filter((d) => d !== dir),
          ].slice(0, MAX_RECENT),
        })),
      clearWorkspaceDir: () => set({ workspaceDir: "" }),
    }),
    {
      name: STORAGE_KEY,
    },
  ),
);
