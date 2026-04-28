import { PRSource } from '../types';

export interface PRCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface PRDetails {
  title?: string;
  description?: string;
  baseBranch: string;
  headBranch: string;
  author?: string;
  commits?: PRCommit[];
  labels?: string[];
  url?: string;
}

export interface PRComment {
  file: string;
  line: number;
  body: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export abstract class PRProvider {
  protected source: PRSource;

  constructor(source: PRSource) {
    this.source = source;
  }

  abstract fetchPRDetails(): Promise<PRDetails>;
  abstract fetchDiff(): Promise<string>;
  abstract postComment?(comment: PRComment): Promise<void>;
  abstract postReview?(comments: PRComment[], summary: string, approve: boolean): Promise<void>;

  getSource(): PRSource {
    return this.source;
  }
}
