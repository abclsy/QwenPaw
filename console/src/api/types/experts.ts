// Built-in expert team (中国中铁专家团队)

export interface ExpertInfo {
  id: string;
  name: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  scenarios: string[];
  emoji: string;
  gradient: string[];
}

export interface ExpertListResponse {
  experts: ExpertInfo[];
  categories: string[];
}

export interface ExpertAgentResponse {
  expert_id: string;
  agent_id: string;
  workspace_dir: string;
  created: boolean;
}
