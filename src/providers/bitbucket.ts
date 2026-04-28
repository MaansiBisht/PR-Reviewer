import axios, { AxiosInstance } from 'axios';
import { PRSource } from '../types';
import { PRProvider, PRDetails, PRComment, PRCommit } from './base';
import { GitService } from '../services/git';
import { logger } from '../utils/logger';

interface BitbucketPR {
  title: string;
  description: string;
  source: { branch: { name: string } };
  destination: { branch: { name: string } };
  author: { display_name: string };
  links: { html: { href: string } };
}

interface BitbucketCommit {
  hash: string;
  message: string;
  author: { raw: string };
  date: string;
}

export class BitbucketProvider extends PRProvider {
  private client: AxiosInstance;
  private git: GitService;

  constructor(source: PRSource, git: GitService) {
    super(source);
    this.git = git;
    
    const auth = source.accessToken 
      ? { headers: { 'Authorization': `Bearer ${source.accessToken}` } }
      : {};

    this.client = axios.create({
      baseURL: 'https://api.bitbucket.org/2.0',
      ...auth,
    });
  }

  async fetchPRDetails(): Promise<PRDetails> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('Bitbucket PR requires owner (workspace), repo, and prNumber');
    }

    try {
      const [prResponse, commitsResponse] = await Promise.all([
        this.client.get<BitbucketPR>(
          `/repositories/${this.source.owner}/${this.source.repo}/pullrequests/${this.source.prNumber}`
        ),
        this.client.get<{ values: BitbucketCommit[] }>(
          `/repositories/${this.source.owner}/${this.source.repo}/pullrequests/${this.source.prNumber}/commits`
        ),
      ]);

      const pr = prResponse.data;
      const commits = commitsResponse.data.values;

      return {
        title: pr.title,
        description: pr.description,
        baseBranch: pr.destination.branch.name,
        headBranch: pr.source.branch.name,
        author: pr.author.display_name,
        commits: commits.map(c => ({
          sha: c.hash,
          message: c.message,
          author: c.author.raw,
          date: c.date,
        })),
        url: pr.links.html.href,
      };
    } catch (error) {
      logger.error(`Failed to fetch Bitbucket PR details: ${(error as Error).message}`);
      throw error;
    }
  }

  async fetchDiff(): Promise<string> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('Bitbucket PR requires owner (workspace), repo, and prNumber');
    }

    try {
      const response = await this.client.get(
        `/repositories/${this.source.owner}/${this.source.repo}/pullrequests/${this.source.prNumber}/diff`,
        { responseType: 'text' }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch Bitbucket PR diff: ${(error as Error).message}`);
      throw error;
    }
  }

  async postComment(comment: PRComment): Promise<void> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('Bitbucket PR requires owner (workspace), repo, and prNumber');
    }

    try {
      await this.client.post(
        `/repositories/${this.source.owner}/${this.source.repo}/pullrequests/${this.source.prNumber}/comments`,
        {
          content: {
            raw: comment.body,
          },
          inline: {
            path: comment.file,
            to: comment.line,
          },
        }
      );
    } catch (error) {
      logger.error(`Failed to post Bitbucket comment: ${(error as Error).message}`);
      throw error;
    }
  }

  async postReview(comments: PRComment[], summary: string, approve: boolean): Promise<void> {
    if (!this.source.owner || !this.source.repo || !this.source.prNumber) {
      throw new Error('Bitbucket PR requires owner (workspace), repo, and prNumber');
    }

    try {
      await this.client.post(
        `/repositories/${this.source.owner}/${this.source.repo}/pullrequests/${this.source.prNumber}/comments`,
        {
          content: {
            raw: `## AI Code Review\n\n${summary}\n\n---\n\n${comments.length} issues found.`,
          },
        }
      );

      for (const comment of comments) {
        await this.postComment(comment);
      }

      if (approve) {
        await this.client.post(
          `/repositories/${this.source.owner}/${this.source.repo}/pullrequests/${this.source.prNumber}/approve`
        );
      }

      logger.info(`Posted Bitbucket review with ${comments.length} comments`);
    } catch (error) {
      logger.error(`Failed to post Bitbucket review: ${(error as Error).message}`);
      throw error;
    }
  }
}
