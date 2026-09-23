import { request } from "../request";

export interface UpdateState {
  status: "idle" | "checking" | "downloading" | "downloaded" | "applying" | "error";
  current_version: string;
  latest_version: string | null;
  has_update: boolean | null;
  release_notes: string;
  download_progress: number;
  download_total: number;
  download_downloaded: number;
  error: string;
}

export const updateApi = {
  getStatus: () => request<UpdateState>("/update/status"),

  check: () =>
    request<UpdateState>("/update/check", { method: "POST" }),

  download: () =>
    request<UpdateState>("/update/download", { method: "POST" }),

  apply: () =>
    request<{ success: boolean; error?: string; message?: string }>(
      "/update/apply",
      { method: "POST" },
    ),
};
