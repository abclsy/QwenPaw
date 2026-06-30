import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

// ── Types ──────────────────────────────────────────────────────────────

export interface Artifact {
  /** 唯一标识（用 URL 做 key） */
  id: string;
  /** 文件名 */
  filename: string;
  /** 预览/下载 URL */
  url: string;
  /** 本地文件绝对路径 */
  filePath: string;
  /** 文件类型标签 */
  fileType: string;
  /** 添加时间戳 */
  timestamp: number;
}

interface ArtifactStore {
  /** 最近产物列表（最新的在前面） */
  artifacts: Artifact[];

  /** 添加一个产物（去重：相同 URL 不重复添加，只更新时间） */
  addArtifact: (artifact: Omit<Artifact, "id" | "timestamp">) => void;

  /** 批量添加产物 */
  addArtifacts: (artifacts: Omit<Artifact, "id" | "timestamp">[]) => void;

  /** 移除单个产物 */
  removeArtifact: (id: string) => void;

  /** 清空所有产物 */
  clearArtifacts: () => void;
}

// ── Storage (sessionStorage) ───────────────────────────────────────────
const STORAGE_KEY = "qwenpaw-artifacts";

const sessionStorageAdapter: PersistStorage<ArtifactStore> = {
  getItem: (_name: string) => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { state: ArtifactStore; version?: number };
    } catch {
      return null;
    }
  },
  setItem: (_name: string, value: { state: ArtifactStore; version?: number }) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* quota exceeded – silently ignore */
    }
  },
  removeItem: (_name: string) => {
    sessionStorage.removeItem(STORAGE_KEY);
  },
};

// ── Store ──────────────────────────────────────────────────────────────

export const useArtifactStore = create<ArtifactStore>()(
  persist(
    (set) => ({
      artifacts: [],

      addArtifact: (artifact) =>
        set((state) => {
          const existingIdx = state.artifacts.findIndex(
            (a) => a.url === artifact.url,
          );
          if (existingIdx >= 1) {
            // 已存在且不是第一条 → 移到最前面（更新时间）
            const updated = [...state.artifacts];
            const [existing] = updated.splice(existingIdx, 1);
            updated.unshift({
              ...existing,
              ...artifact,
              timestamp: Date.now(),
            });
            return { artifacts: updated };
          }
          if (existingIdx === 0) {
            // 已在第一位 → 只更新时间
            const updated = [...state.artifacts];
            updated[0] = {
              ...updated[0],
              ...artifact,
              timestamp: Date.now(),
            };
            return { artifacts: updated };
          }
          // 新增 → 放到最前面
          return {
            artifacts: [
              {
                ...artifact,
                id: artifact.url,
                timestamp: Date.now(),
              },
              ...state.artifacts,
            ],
          };
        }),

      addArtifacts: (items) =>
        set((state) => {
          const existingUrls = new Set(state.artifacts.map((a) => a.url));
          const newItems = items.filter((item) => !existingUrls.has(item.url));
          if (newItems.length === 0) return state;
          return {
            artifacts: [
              ...newItems.map((item) => ({
                ...item,
                id: item.url,
                timestamp: Date.now(),
              })),
              ...state.artifacts,
            ],
          };
        }),

      removeArtifact: (id) =>
        set((state) => ({
          artifacts: state.artifacts.filter((a) => a.id !== id),
        })),

      clearArtifacts: () => set({ artifacts: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: sessionStorageAdapter,
      // 只持久化最近 50 条，避免撑爆 storage
      partialize: (state) => ({
        artifacts: state.artifacts.slice(0, 50),
      }) as unknown as ArtifactStore,
    },
  ),
);
