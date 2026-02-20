export type CardStatus = 'backlog' | 'priority' | 'in_progress' | 'done';

export interface Card {
  id: string;
  repo_id: string | null;
  title: string;
  description: string;
  status: CardStatus;
  branch_name: string | null;
  branch_dir: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Repo {
  id: string;
  name: string;
  local_path: string;
  github_owner: string | null;
  github_repo: string | null;
  default_branch: string;
  created_at: string;
  updated_at: string;
}


export interface CardLabel {
  id: string;
  card_id: string;
  label: string;
  color: string;
}

export interface CardComment {
  id: string;
  card_id: string;
  author: 'user' | 'claude' | 'system';
  body: string;
  created_at: string;
}
