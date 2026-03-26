export interface ReviewIssue {
  file: string;
  line?: number;
  endLine?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: ReviewCategory;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
}

export type ReviewCategory = 
  | 'bug'
  | 'security'
  | 'performance'
  | 'style'
  | 'logic'
  | 'error-handling'
  | 'duplication'
  | 'naming'
  | 'documentation'
  | 'testing'
  | 'architecture'
  | 'dependency'
  | 'general';

export interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
  stats: ReviewStats;
  metadata: ReviewMetadata;
}

export interface ReviewStats {
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byCategory: Record<string, number>;
  byFile: Record<string, number>;
}

export interface ReviewMetadata {
  reviewedAt: string;
  duration: number;
  model: string;
  filesReviewed: number;
  linesReviewed: number;
  chunksProcessed: number;
}

export interface DiffChunk {
  content: string;
  files: string[];
  index: number;
  total: number;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export interface FileFilter {
  include?: string[];
  exclude?: string[];
  maxFileSize?: number;
}

export interface ReviewFocus {
  categories?: ReviewCategory[];
  severityThreshold?: 'low' | 'medium' | 'high' | 'critical';
  customRules?: string[];
  context?: string;
}

export interface OutputOptions {
  format: 'cli' | 'json' | 'markdown' | 'html';
  outputFile?: string;
  includeCodeSnippets?: boolean;
  groupBy?: 'file' | 'severity' | 'category';
}

export interface CacheOptions {
  enabled: boolean;
  directory?: string;
  ttl?: number;
}

export interface Config {
  ollamaUrl: string;
  model: string;
  baseBranch: string;
  maxChunkSize: number;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  fileFilter: FileFilter;
  reviewFocus: ReviewFocus;
  output: OutputOptions;
  cache: CacheOptions;
}

export interface ProjectConfig {
  extends?: string;
  model?: string;
  baseBranch?: string;
  fileFilter?: FileFilter;
  reviewFocus?: ReviewFocus;
  output?: Partial<OutputOptions>;
  customPrompt?: string;
}

export const DEFAULT_CONFIG: Config = {
  ollamaUrl: 'http://localhost:11434',
  model: 'deepseek-coder',
  baseBranch: 'main',
  maxChunkSize: 4000,
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 300000,
  fileFilter: {
    include: ['*'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      '*.min.js',
      '*.min.css',
      '*.map',
      '.git/**',
    ],
    maxFileSize: 100000,
  },
  reviewFocus: {
    categories: ['bug', 'security', 'performance', 'logic', 'error-handling'],
    severityThreshold: 'low',
  },
  output: {
    format: 'cli',
    includeCodeSnippets: true,
    groupBy: 'file',
  },
  cache: {
    enabled: false,
    directory: '.pr-review-cache',
    ttl: 3600000,
  },
};
