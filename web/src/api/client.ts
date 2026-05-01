import axios from 'axios';
import { PRSource, ReviewResult } from '../store/reviewStore';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface StartReviewRequest {
  source: PRSource;
  agents?: string[];
}

export interface AgentLog {
  timestamp: string;
  agent: string;
  action: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AgentInfo {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  capabilities: string[];
  focusAreas: string[];
  status: 'idle' | 'running' | 'completed' | 'error';
}

export interface ReviewStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentAgent?: string;
  result?: ReviewResult;
  error?: string;
  logs?: AgentLog[];
  agents?: AgentInfo[];
}

export const reviewApi = {
  startReview: async (request: StartReviewRequest): Promise<{ id: string }> => {
    const response = await api.post('/reviews', request);
    return response.data;
  },

  getReviewStatus: async (id: string): Promise<ReviewStatus> => {
    const response = await api.get(`/reviews/${id}`);
    return response.data;
  },

  getReviews: async (): Promise<ReviewResult[]> => {
    const response = await api.get('/reviews');
    return response.data;
  },

  getReview: async (id: string): Promise<ReviewResult> => {
    const response = await api.get(`/reviews/${id}/result`);
    return response.data;
  },

  checkHealth: async (): Promise<{ ok: boolean; provider: string; model: string; message: string }> => {
    const response = await api.get('/health');
    return response.data;
  },

  getBranches: async (repoPath?: string): Promise<{ local: string[]; remote: string[]; repoPath?: string }> => {
    const response = await api.get('/branches', { params: repoPath ? { repoPath } : {} });
    return response.data;
  },

  getRepos: async (searchPath?: string): Promise<{ repos: string[]; searchPath: string }> => {
    const response = await api.get('/repos', { params: searchPath ? { path: searchPath } : {} });
    return response.data;
  },

  getModels: async (): Promise<{ models: string[] }> => {
    const response = await api.get('/models');
    return response.data;
  },

  getConfig: async (): Promise<Record<string, unknown>> => {
    const response = await api.get('/config');
    return response.data;
  },

  updateConfig: async (config: Record<string, unknown>): Promise<void> => {
    await api.put('/config', config);
  },

  getAgents: async (): Promise<AgentInfo[]> => {
    const response = await api.get('/agents');
    return response.data;
  },

  getReviewLogs: async (id: string, since?: number): Promise<{ logs: AgentLog[]; total: number; agents: AgentInfo[] }> => {
    const response = await api.get(`/reviews/${id}/logs`, { params: { since } });
    return response.data;
  },

  getAnalytics: async (): Promise<AnalyticsData> => {
    const response = await api.get('/analytics');
    return response.data;
  },

  submitFeedback: async (
    reviewId: string,
    issueId: string,
    verdict: 'confirmed' | 'false_positive' | 'dismissed',
    notes?: string
  ): Promise<void> => {
    await api.post(`/reviews/${reviewId}/feedback`, { issueId, verdict, notes });
  },

  getFeedback: async (reviewId: string): Promise<{ feedback: IssueFeedback[] }> => {
    const response = await api.get(`/reviews/${reviewId}/feedback`);
    return response.data;
  },

  getSimilarFindings: async (file: string, category: string, message: string): Promise<{ similar: SimilarFinding[] }> => {
    const response = await api.get('/memory/similar', { params: { file, category, message } });
    return response.data;
  },

  clearCache: async (): Promise<void> => {
    await api.delete('/cache');
  },

  getCacheStats: async (): Promise<CacheStats> => {
    const response = await api.get('/cache/stats');
    return response.data;
  },
};

export interface AnalyticsData {
  totalReviews: number;
  totalIssues: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  byAgent: Record<string, number>;
  reviewsOverTime: Array<{ date: string; count: number; issues: number }>;
  topFiles: Array<{ file: string; issueCount: number }>;
  agentPerformance: Array<{
    agent: string;
    totalIssues: number;
    avgConfidence: number;
    avgExecutionTime: number;
    confirmedCount: number;
    falsePositiveCount: number;
  }>;
  cache: CacheStats;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  maxEntries: number;
  ttlMs: number;
}

export interface IssueFeedback {
  issueId: string;
  verdict: 'confirmed' | 'false_positive' | 'dismissed';
  notes?: string;
  timestamp: string;
}

export interface SimilarFinding {
  reviewId: string;
  reviewDate: string;
  issue: {
    file: string;
    line?: number;
    category: string;
    message: string;
    severity: string;
  };
  feedback?: IssueFeedback;
}

export default api;
