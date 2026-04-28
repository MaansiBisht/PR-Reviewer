import { PRSource } from '../types';
import { PRProvider, PRDetails, PRComment } from './base';
import { GitService, CommitInfo } from '../services/git';
import { logger } from '../utils/logger';

export class LocalProvider extends PRProvider {
  private git: GitService;

  constructor(source: PRSource, git?: GitService) {
    super(source);
    this.git = git ?? new GitService(source.repoPath || process.cwd());
  }

  async fetchPRDetails(): Promise<PRDetails> {
    const baseBranch = this.source.baseBranch || 'main';
    const headBranch = this.source.branch || await this.git.getCurrentBranch();

    try {
      const commits: CommitInfo[] = await this.git.getCommitsBetween(baseBranch, headBranch);
      
      return {
        title: `Local PR: ${headBranch} → ${baseBranch}`,
        description: commits.length > 0 ? commits[0].message : undefined,
        baseBranch,
        headBranch,
        commits: commits.map((c: CommitInfo) => ({
          sha: c.hash,
          message: c.message,
          author: c.author,
          date: c.date,
        })),
      };
    } catch (error) {
      logger.debug(`Failed to get commit details: ${(error as Error).message}`);
      return {
        baseBranch,
        headBranch,
      };
    }
  }

  async fetchDiff(): Promise<string> {
    const baseBranch = this.source.baseBranch || 'main';
    const headBranch = this.source.branch || 'HEAD';

    try {
      const { diff } = await this.git.getDiffForPR(baseBranch, headBranch, {
        fetch: false,
        remote: 'origin',
      });
      
      return diff;
    } catch (error) {
      logger.error(`Failed to fetch local diff: ${(error as Error).message}`);
      throw error;
    }
  }

  async postComment(comment: PRComment): Promise<void> {
    logger.info(`[Local] Would post comment on ${comment.file}:${comment.line}: ${comment.body}`);
  }

  async postReview(comments: PRComment[], summary: string, approve: boolean): Promise<void> {
    logger.info(`[Local] Review summary: ${summary}`);
    logger.info(`[Local] ${comments.length} comments, approve: ${approve}`);
    
    for (const comment of comments) {
      logger.info(`  - ${comment.file}:${comment.line} [${comment.severity}]: ${comment.body.slice(0, 100)}`);
    }
  }
}
