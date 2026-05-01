export interface ReviewIssue {
  file: string;
  line?: number;
  endLine?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: ReviewCategory;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
  confidence?: number;        // 0-100 confidence score
  evidence?: string[];        // Code snippets/references supporting the finding
  reasoning?: string;         // Brief explanation of why this is an issue
  consensus?: boolean;        // True when multiple agents flagged this issue
  consensusCount?: number;    // Number of agents that agreed on this issue
  sources?: string[];         // Agents that flagged this issue
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
  // Multi-agent specific metadata
  keyFindings?: string[];
  recommendations?: string[];
  overallRiskLevel?: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  approvalRecommendation?: 'approve' | 'request_changes' | 'needs_discussion';
  agentResults?: AgentResultSummary[];
  overallConfidence?: number;  // Aggregated confidence score
  projectContext?: ProjectContext;
  prIntent?: {
    primaryIntent: string;
    secondaryIntents: string[];
    expectedBehaviors: string[];
    breakingChanges: string[];
  };
}

export interface ProjectContext {
  language: string;
  framework?: string;
  testFramework?: string;
  patterns: string[];
  conventions: {
    naming?: 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';
    fileStructure?: 'feature-based' | 'layer-based' | 'flat' | 'mixed';
  };
  dependencies: string[];
}

export interface AgentResultSummary {
  agent: string;
  issueCount: number;
  confidence: number;
  executionTime: number;
}

export interface PRSource {
  type: 'github' | 'bitbucket' | 'local';
  owner?: string;
  repo?: string;
  prNumber?: number;
  branch?: string;
  baseBranch?: string;
  url?: string;
  accessToken?: string;
  repoPath?: string;
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

export interface CacheOptions {
  enabled: boolean;
  directory?: string;
  ttl?: number;
}

export type LLMProviderType = 'ollama' | 'claude' | 'openai';

export interface Config {
  provider: LLMProviderType;
  ollamaUrl: string;
  model: string;
  cloudModel?: string;
  apiKey?: string;
  githubToken?: string;
  bitbucketToken?: string;
  bitbucketUsername?: string;
  baseBranch: string;
  maxChunkSize: number;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  fileFilter: FileFilter;
  reviewFocus: ReviewFocus;
  cache: CacheOptions;
}

export interface ProjectConfig {
  extends?: string;
  model?: string;
  baseBranch?: string;
  fileFilter?: FileFilter;
  reviewFocus?: ReviewFocus;
  customPrompt?: string;
}

export const DEFAULT_CONFIG: Config = {
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder:7b',
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
  cache: {
    enabled: false,
    directory: '.pr-review-cache',
    ttl: 3600000,
  },
};
