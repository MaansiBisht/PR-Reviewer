import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReviewResult } from '../types';
import { logger } from '../utils/logger';

export interface StoredReview extends ReviewResult {
  id: string;
  repoPath?: string;
  branch?: string;
  baseBranch?: string;
  feedback?: Record<string, IssueFeedback>;
}

export interface IssueFeedback {
  issueId: string;
  verdict: 'confirmed' | 'false_positive' | 'dismissed';
  notes?: string;
  timestamp: string;
}

export interface ReviewStoreStats {
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
}

const STORE_DIR = path.join(os.homedir(), '.pr-reviewer');
const REVIEWS_FILE = path.join(STORE_DIR, 'reviews.json');
const FEEDBACK_FILE = path.join(STORE_DIR, 'feedback.json');

export class ReviewStore {
  private reviews: StoredReview[] = [];
  private feedback: Record<string, IssueFeedback[]> = {}; // reviewId -> feedback[]

  constructor() {
    this.ensureStoreDir();
    this.loadReviews();
    this.loadFeedback();
  }

  private ensureStoreDir(): void {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
  }

  private loadReviews(): void {
    try {
      if (fs.existsSync(REVIEWS_FILE)) {
        const data = fs.readFileSync(REVIEWS_FILE, 'utf-8');
        this.reviews = JSON.parse(data);
        logger.debug(`Loaded ${this.reviews.length} reviews from store`);
      }
    } catch (error) {
      logger.warn(`Failed to load reviews: ${(error as Error).message}`);
      this.reviews = [];
    }
  }

  private loadFeedback(): void {
    try {
      if (fs.existsSync(FEEDBACK_FILE)) {
        const data = fs.readFileSync(FEEDBACK_FILE, 'utf-8');
        this.feedback = JSON.parse(data);
      }
    } catch (error) {
      logger.warn(`Failed to load feedback: ${(error as Error).message}`);
      this.feedback = {};
    }
  }

  private saveReviews(): void {
    try {
      // Keep last 200 reviews max to prevent unbounded growth
      const toSave = this.reviews.slice(0, 200);
      fs.writeFileSync(REVIEWS_FILE, JSON.stringify(toSave, null, 2));
    } catch (error) {
      logger.error(`Failed to save reviews: ${(error as Error).message}`);
    }
  }

  private saveFeedback(): void {
    try {
      fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(this.feedback, null, 2));
    } catch (error) {
      logger.error(`Failed to save feedback: ${(error as Error).message}`);
    }
  }

  addReview(review: StoredReview): void {
    this.reviews.unshift(review);
    this.saveReviews();
  }

  getReview(id: string): StoredReview | undefined {
    return this.reviews.find(r => r.id === id);
  }

  getAllReviews(): StoredReview[] {
    return this.reviews;
  }

  deleteReview(id: string): boolean {
    const idx = this.reviews.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this.reviews.splice(idx, 1);
    delete this.feedback[id];
    this.saveReviews();
    this.saveFeedback();
    return true;
  }

  addFeedback(reviewId: string, feedback: IssueFeedback): void {
    if (!this.feedback[reviewId]) {
      this.feedback[reviewId] = [];
    }
    // Replace existing feedback for same issueId
    const existingIdx = this.feedback[reviewId].findIndex(f => f.issueId === feedback.issueId);
    if (existingIdx !== -1) {
      this.feedback[reviewId][existingIdx] = feedback;
    } else {
      this.feedback[reviewId].push(feedback);
    }
    this.saveFeedback();
  }

  getFeedback(reviewId: string): IssueFeedback[] {
    return this.feedback[reviewId] || [];
  }

  getAllFeedback(): Record<string, IssueFeedback[]> {
    return this.feedback;
  }

  /**
   * Compute aggregate statistics across all reviews for analytics
   */
  getStats(): ReviewStoreStats {
    const stats: ReviewStoreStats = {
      totalReviews: this.reviews.length,
      totalIssues: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byCategory: {},
      byAgent: {},
      reviewsOverTime: [],
      topFiles: [],
      agentPerformance: [],
    };

    const fileCount = new Map<string, number>();
    const dateCount = new Map<string, { count: number; issues: number }>();
    const agentStats = new Map<string, {
      totalIssues: number;
      totalConfidence: number;
      totalExecutionTime: number;
      count: number;
      confirmed: number;
      falsePositives: number;
    }>();

    for (const review of this.reviews) {
      stats.totalIssues += review.issues.length;

      // Group by date (YYYY-MM-DD)
      const date = review.metadata.reviewedAt.split('T')[0];
      const existing = dateCount.get(date) || { count: 0, issues: 0 };
      dateCount.set(date, {
        count: existing.count + 1,
        issues: existing.issues + review.issues.length,
      });

      // Aggregate issues
      for (const issue of review.issues) {
        stats.bySeverity[issue.severity] = (stats.bySeverity[issue.severity] || 0) + 1;
        stats.byCategory[issue.category] = (stats.byCategory[issue.category] || 0) + 1;
        fileCount.set(issue.file, (fileCount.get(issue.file) || 0) + 1);
      }

      // Agent stats from metadata
      const agentResults = review.metadata.agentResults || [];
      for (const ar of agentResults) {
        const existing = agentStats.get(ar.agent) || {
          totalIssues: 0, totalConfidence: 0, totalExecutionTime: 0, count: 0,
          confirmed: 0, falsePositives: 0,
        };
        existing.totalIssues += ar.issueCount;
        existing.totalConfidence += ar.confidence;
        existing.totalExecutionTime += ar.executionTime;
        existing.count += 1;
        agentStats.set(ar.agent, existing);

        stats.byAgent[ar.agent] = (stats.byAgent[ar.agent] || 0) + ar.issueCount;
      }

      // Feedback stats
      const reviewFeedback = this.feedback[review.id] || [];
      for (const fb of reviewFeedback) {
        // Match feedback to agent (best-effort via issue source)
        for (const ar of agentResults) {
          const existing = agentStats.get(ar.agent);
          if (existing) {
            if (fb.verdict === 'confirmed') existing.confirmed += 1;
            if (fb.verdict === 'false_positive') existing.falsePositives += 1;
          }
        }
      }
    }

    // Top 10 files
    stats.topFiles = Array.from(fileCount.entries())
      .map(([file, count]) => ({ file, issueCount: count }))
      .sort((a, b) => b.issueCount - a.issueCount)
      .slice(0, 10);

    // Reviews over time (last 30 days)
    stats.reviewsOverTime = Array.from(dateCount.entries())
      .map(([date, d]) => ({ date, count: d.count, issues: d.issues }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // Agent performance
    stats.agentPerformance = Array.from(agentStats.entries()).map(([agent, d]) => ({
      agent,
      totalIssues: d.totalIssues,
      avgConfidence: d.count > 0 ? Math.round(d.totalConfidence / d.count) : 0,
      avgExecutionTime: d.count > 0 ? Math.round(d.totalExecutionTime / d.count) : 0,
      confirmedCount: d.confirmed,
      falsePositiveCount: d.falsePositives,
    }));

    return stats;
  }

  /**
   * Find similar past findings for memory/learning
   */
  findSimilarFindings(file: string, category: string, message: string): Array<{
    reviewId: string;
    reviewDate: string;
    issue: any;
    feedback?: IssueFeedback;
  }> {
    const results: any[] = [];
    const normalizedMessage = message.toLowerCase().slice(0, 50);

    for (const review of this.reviews.slice(0, 50)) { // Search recent 50
      for (let i = 0; i < review.issues.length; i++) {
        const issue = review.issues[i];
        if (issue.file === file && issue.category === category) {
          const similarity = issue.message.toLowerCase().slice(0, 50) === normalizedMessage ? 1.0 : 0.5;
          if (similarity > 0.4) {
            const fb = (this.feedback[review.id] || []).find(f => f.issueId === `${i}`);
            results.push({
              reviewId: review.id,
              reviewDate: review.metadata.reviewedAt,
              issue,
              feedback: fb,
            });
          }
        }
      }
    }
    return results.slice(0, 5);
  }
}

// Singleton
let _store: ReviewStore | null = null;
export function getReviewStore(): ReviewStore {
  if (!_store) {
    _store = new ReviewStore();
  }
  return _store;
}
