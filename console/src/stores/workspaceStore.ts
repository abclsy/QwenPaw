import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Storage key for the user-selected workspace directory.
 * Persisted to localStorage so it survives across sessions.
 */
const STORAGE_KEY = "qwenpaw-workspace-dir";

interface WorkspaceDirStore {
  /** User-selected workspace directory path, or empty string if not set. */
  workspaceDir: string;
  /** Set the workspace directory. */
  setWorkspaceDir: (dir: string) => void;
  /** Clear the workspace directory selection. */
  clearWorkspaceDir: () => void;
}

export const useWorkspaceDirStore = create<WorkspaceDirStore>()(
  persist(
    (set) => ({
      workspaceDir: "",
      setWorkspaceDir: (dir: string) => set({ workspaceDir: dir }),
      clearWorkspaceDir: () => set({ workspaceDir: "" }),
    }),
    {
      name: STORAGE_KEY,
    },
  ),
);
