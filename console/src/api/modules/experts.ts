import { request } from "../request";
import type {
  ExpertAgentResponse,
  ExpertListResponse,
} from "../types/experts";

// Built-in expert team API (中国中铁专家团队)
export const expertsApi = {
  // List all built-in experts with categories
  listExperts: () => request<ExpertListResponse>("/experts"),

  // Create (or reuse) the agent backing an expert
  createExpertAgent: (expertId: string) =>
    request<ExpertAgentResponse>(`/experts/${expertId}/agents`, {
      method: "POST",
    }),
};
