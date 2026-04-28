import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReviewIssue {
  file: string;
  line?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  message: string;
  suggestion?: string;
  confidence?: number;
  evidence?: string[];
  reasoning?: string;
}

export interface ReviewResult {
  id: string;
  summary: string;
  issues: ReviewIssue[];
  stats: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    byCategory: Record<string, number>;
    byFile: Record<string, number>;
  };
  metadata: {
    reviewedAt: string;
    duration: number;
    model: string;
    filesReviewed: number;
    overallRiskLevel?: string;
    approvalRecommendation?: string;
    agentResults?: {
      agent: string;
      issueCount: number;
      confidence: number;
      executionTime: number;
    }[];
  };
}

export interface PRSource {
  type: 'github' | 'bitbucket' | 'local';
  owner?: string;
  repo?: string;
  prNumber?: number;
  branch?: string;
  baseBranch?: string;
  accessToken?: string;
}

interface ReviewState {
  reviews: ReviewResult[];
  currentReview: ReviewResult | null;
  isLoading: boolean;
  error: string | null;
  prSource: PRSource | null;
  
  setReviews: (reviews: ReviewResult[]) => void;
  setCurrentReview: (review: ReviewResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPRSource: (source: PRSource | null) => void;
  addReview: (review: ReviewResult) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      reviews: [],
      currentReview: null,
      isLoading: false,
      error: null,
      prSource: null,

      setReviews: (reviews) => set({ reviews }),
      setCurrentReview: (review) => set({ currentReview: review }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setPRSource: (source) => set({ prSource: source }),
      addReview: (review) => set((state) => ({ 
        reviews: [review, ...state.reviews].slice(0, 50) // Keep last 50 reviews
      })),
    }),
    {
      name: 'pr-reviewer-storage',
      partialize: (state) => ({ reviews: state.reviews }), // Only persist reviews
    }
  )
);
