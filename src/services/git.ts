import simpleGit, { SimpleGit } from 'simple-git';
import { logger } from '../utils/logger';

export class GitService {
  private git: SimpleGit;

  constructor(workingDir: string = process.cwd()) {
    this.git = simpleGit(workingDir);
  }

  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  async getRemotes(): Promise<string[]> {
    const remotes = await this.git.getRemotes();
    return remotes.map(r => r.name);
  }

  async fetchRemote(remote: string = 'origin'): Promise<void> {
    logger.debug(`Fetching from remote: ${remote}`);
    await this.git.fetch(remote);
  }

  async fetchAll(): Promise<void> {
    logger.debug('Fetching all remotes');
    await this.git.fetch(['--all']);
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.git.revparse(['--verify', branchName]);
      return true;
    } catch {
      return false;
    }
  }

  async getRemoteBranches(): Promise<string[]> {
    const result = await this.git.branch(['-r']);
    return result.all;
  }

  async getLocalBranches(): Promise<string[]> {
    const result = await this.git.branchLocal();
    return result.all;
  }

  async resolveBranchRef(branch: string, useRemote: boolean = false, remote: string = 'origin'): Promise<string> {
    if (useRemote) {
      const remoteBranch = `${remote}/${branch}`;
      if (await this.branchExists(remoteBranch)) {
        return remoteBranch;
      }
      if (await this.branchExists(branch)) {
        return branch;
      }
      throw new Error(`Branch not found: ${branch} (tried ${remoteBranch} and ${branch})`);
    }
    
    if (await this.branchExists(branch)) {
      return branch;
    }
    const remoteBranch = `origin/${branch}`;
    if (await this.branchExists(remoteBranch)) {
      return remoteBranch;
    }
    throw new Error(`Branch not found: ${branch}`);
  }

  async getDiffBetweenBranches(baseBranch: string, targetBranch: string = 'HEAD'): Promise<string> {
    logger.debug(`Getting diff between ${baseBranch} and ${targetBranch}`);
    
    try {
      const diff = await this.git.diff([`${baseBranch}...${targetBranch}`]);
      return diff;
    } catch (error) {
      logger.warn(`Failed to get diff with three-dot notation, trying two-dot`);
      const diff = await this.git.diff([baseBranch, targetBranch]);
      return diff;
    }
  }

  async getDiffForPR(
    baseBranch: string,
    prBranch: string,
    options: { fetch?: boolean; remote?: string } = {}
  ): Promise<{ diff: string; baseRef: string; prRef: string }> {
    const { fetch = false, remote = 'origin' } = options;

    if (fetch) {
      logger.info(`Fetching latest from ${remote}...`);
      await this.fetchRemote(remote);
    }

    const baseRef = await this.resolveBranchRef(baseBranch, fetch, remote);
    const prRef = await this.resolveBranchRef(prBranch, fetch, remote);

    logger.debug(`Resolved refs: base=${baseRef}, pr=${prRef}`);

    const diff = await this.getDiffBetweenBranches(baseRef, prRef);
    return { diff, baseRef, prRef };
  }

  async getMergeBase(branch1: string, branch2: string): Promise<string> {
    const result = await this.git.raw(['merge-base', branch1, branch2]);
    return result.trim();
  }

  async getCommitCount(baseBranch: string, targetBranch: string): Promise<number> {
    try {
      const result = await this.git.raw(['rev-list', '--count', `${baseBranch}..${targetBranch}`]);
      return parseInt(result.trim(), 10);
    } catch {
      return 0;
    }
  }

  async getStagedDiff(): Promise<string> {
    logger.debug('Getting staged changes diff');
    const diff = await this.git.diff(['--cached']);
    return diff;
  }

  async getUnstagedDiff(): Promise<string> {
    logger.debug('Getting unstaged changes diff');
    const diff = await this.git.diff();
    return diff;
  }

  async getAllChanges(): Promise<string> {
    const staged = await this.getStagedDiff();
    const unstaged = await this.getUnstagedDiff();
    return staged + unstaged;
  }

  async getChangedFiles(baseBranch: string, targetBranch: string = 'HEAD'): Promise<string[]> {
    try {
      const result = await this.git.diff(['--name-only', `${baseBranch}...${targetBranch}`]);
      return result.split('\n').filter(Boolean);
    } catch {
      const result = await this.git.diff(['--name-only', baseBranch, targetBranch]);
      return result.split('\n').filter(Boolean);
    }
  }

  async hasChanges(): Promise<boolean> {
    const status = await this.git.status();
    return status.files.length > 0;
  }

  async getCommitsBetween(baseBranch: string, targetBranch: string = 'HEAD'): Promise<CommitInfo[]> {
    try {
      const log = await this.git.log([`${baseBranch}..${targetBranch}`]);
      return log.all.map((commit) => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
      }));
    } catch {
      return [];
    }
  }

  async findImporters(filePath: string): Promise<string[]> {
    try {
      const fileName = filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
      const result = await this.git.raw([
        'grep',
        '-l',
        `import.*${fileName}\\|require.*${fileName}`,
        '--',
        '*.ts',
        '*.tsx',
        '*.js',
        '*.jsx',
      ]);
      return result.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  async getFileContent(filePath: string, ref: string = 'HEAD'): Promise<string | null> {
    try {
      const content = await this.git.show([`${ref}:${filePath}`]);
      return content;
    } catch {
      return null;
    }
  }
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export const createGitService = (workingDir?: string): GitService => {
  return new GitService(workingDir);
};
