import axios, { AxiosInstance } from 'axios';
import { PRSource } from '../types';
import { PRProvider, PRDetails, PRComment, PRCommit } from './base';
import { GitService } from '../services/git';
import { logger } from '../utils/logger';

interface GitHubPR {
  title: string;
  body: string;
  head: { ref: string; sha: string };
  base: { ref: string };
  user: { login: string };
  labels: { name: string }[];
  html_url: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
}

export class GitHubProvider extends PRProvider {
  private client: AxiosInstance;
  private git: GitService;

  constructor(source: PRSource, git: GitService) {
    super(source);
    this.git = git;
    
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(source.accessToken && { 'Authorization': `Bearer ${source.accessToken}` }),
      },
    });
  }

  async fetchPRDetails(): Promise<PRDetails> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('GitHub PR requires owner, repo, and prNumber');
    }

    try {
      const [prResponse, commitsResponse] = await Promise.all([
        this.client.get<GitHubPR>(`/repos/${this.source.owner}/${this.source.repo}/pulls/${this.source.prNumber}`),
        this.client.get<GitHubCommit[]>(`/repos/${this.source.owner}/${this.source.repo}/pulls/${this.source.prNumber}/commits`),
      ]);

      const pr = prResponse.data;
      const commits = commitsResponse.data;

      return {
        title: pr.title,
        description: pr.body,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        author: pr.user.login,
        commits: commits.map(c => ({
          sha: c.sha,
          message: c.commit.message,
          author: c.commit.author.name,
          date: c.commit.author.date,
        })),
        labels: pr.labels.map(l => l.name),
        url: pr.html_url,
      };
    } catch (error) {
      logger.error(`Failed to fetch GitHub PR details: ${(error as Error).message}`);
      throw error;
    }
  }

  async fetchDiff(): Promise<string> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('GitHub PR requires owner, repo, and prNumber');
    }

    try {
      const response = await this.client.get(
        `/repos/${this.source.owner}/${this.source.repo}/pulls/${this.source.prNumber}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3.diff',
          },
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch GitHub PR diff: ${(error as Error).message}`);
      throw error;
    }
  }

  async postComment(comment: PRComment): Promise<void> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('GitHub PR requires owner, repo, and prNumber');
    }

    try {
      const prDetails = await this.fetchPRDetails();
      
      await this.client.post(
        `/repos/${this.source.owner}/${this.source.repo}/pulls/${this.source.prNumber}/comments`,
        {
          body: comment.body,
          commit_id: prDetails.commits?.[prDetails.commits.length - 1]?.sha,
          path: comment.file,
          line: comment.line,
        }
      );
    } catch (error) {
      logger.error(`Failed to post GitHub comment: ${(error as Error).message}`);
      throw error;
    }
  }

  async postReview(comments: PRComment[], summary: string, approve: boolean): Promise<void> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('GitHub PR requires owner, repo, and prNumber');
    }

    try {
      const prDetails = await this.fetchPRDetails();
      const latestCommit = prDetails.commits?.[prDetails.commits.length - 1]?.sha;

      await this.client.post(
        `/repos/${this.source.owner}/${this.source.repo}/pulls/${this.source.prNumber}/reviews`,
        {
          commit_id: latestCommit,
          body: summary,
          event: approve ? 'APPROVE' : 'REQUEST_CHANGES',
          comments: comments.map(c => ({
            path: c.file,
            line: c.line,
            body: `**[${c.severity?.toUpperCase() || 'INFO'}]** ${c.body}`,
          })),
        }
      );

      logger.info(`Posted GitHub review with ${comments.length} comments`);
    } catch (error) {
      logger.error(`Failed to post GitHub review: ${(error as Error).message}`);
      throw error;
    }
  }
}
