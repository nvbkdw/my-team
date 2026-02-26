import { Octokit } from '@octokit/rest';

export interface PRData {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  user: { login: string; avatar_url: string };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

export interface PRComment {
  id: number;
  user: { login: string; avatar_url: string };
  body: string;
  created_at: string;
  path?: string;
  line?: number;
}

export class GitHubService {
  private getOctokit(pat: string): Octokit {
    return new Octokit({ auth: pat });
  }

  async createPR(
    pat: string,
    owner: string,
    repo: string,
    head: string,
    base: string,
    title: string,
    body: string
  ): Promise<PRData> {
    const octokit = this.getOctokit(pat);
    const { data } = await octokit.pulls.create({
      owner,
      repo,
      head,
      base,
      title,
      body,
    });
    return data as unknown as PRData;
  }

  async getPR(
    pat: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRData> {
    const octokit = this.getOctokit(pat);
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    return data as unknown as PRData;
  }

  async getPRFiles(
    pat: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRFile[]> {
    const octokit = this.getOctokit(pat);
    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });
    return data as unknown as PRFile[];
  }

  async getPRComments(
    pat: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRComment[]> {
    const octokit = this.getOctokit(pat);
    const [issueComments, reviewComments] = await Promise.all([
      octokit.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
      }),
      octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number: prNumber,
      }),
    ]);

    const all: PRComment[] = [
      ...issueComments.data.map((c) => ({
        id: c.id,
        user: { login: c.user?.login ?? 'unknown', avatar_url: c.user?.avatar_url ?? '' },
        body: c.body ?? '',
        created_at: c.created_at,
      })),
      ...reviewComments.data.map((c) => ({
        id: c.id,
        user: { login: c.user.login, avatar_url: c.user.avatar_url },
        body: c.body,
        created_at: c.created_at,
        path: c.path,
        line: c.line ?? undefined,
      })),
    ];

    return all.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  async closePR(
    pat: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRData> {
    const octokit = this.getOctokit(pat);
    const { data } = await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    });
    return data as unknown as PRData;
  }

  async getPRChecks(
    pat: string,
    owner: string,
    repo: string,
    ref: string
  ): Promise<Array<{ name: string; status: string; conclusion: string | null }>> {
    const octokit = this.getOctokit(pat);
    const { data } = await octokit.checks.listForRef({
      owner,
      repo,
      ref,
    });
    return data.check_runs.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
    }));
  }
}

export const githubService = new GitHubService();
