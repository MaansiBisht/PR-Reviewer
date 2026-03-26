import { Config, ReviewResult, ReviewIssue, DiffChunk, ReviewStats, ReviewMetadata } from '../types';
import { OllamaClient, createOllamaClient } from './ollama';
import { chunkDiff } from './chunker';
import { buildReviewPrompt, parseReviewResponse, PromptOptions } from './prompt';
import { logger } from '../utils/logger';
import { formatProgress, clearProgress } from './formatter';
import { filterDiff } from '../utils/file-filter';
import { ReviewCache } from '../utils/cache';

export class Reviewer {
  private ollama: OllamaClient;
  private config: Config;
  private cache: ReviewCache;
  private startTime: number = 0;

  constructor(config: Config) {
    this.config = config;
    this.ollama = createOllamaClient(config);
    this.cache = new ReviewCache(config.cache);
  }

  async checkPrerequisites(): Promise<{ ok: boolean; message: string }> {
    const available = await this.ollama.isAvailable();
    if (!available) {
      return {
        ok: false,
        message: `Ollama is not running at ${this.config.ollamaUrl}. Please start Ollama first.`,
      };
    }

    const hasModel = await this.ollama.hasModel(this.config.model);
    if (!hasModel) {
      const models = await this.ollama.listModels();
      return {
        ok: false,
        message: `Model "${this.config.model}" not found. Available models: ${models.join(', ') || 'none'}. Run: ollama pull ${this.config.model}`,
      };
    }

    return { ok: true, message: 'All prerequisites met.' };
  }

  async review(diff: string): Promise<ReviewResult> {
    this.startTime = Date.now();
    
    if (!diff || diff.trim().length === 0) {
      return this.createEmptyResult('No changes to review.');
    }

    const filteredDiff = filterDiff(diff, this.config.fileFilter);
    
    if (!filteredDiff || filteredDiff.trim().length === 0) {
      return this.createEmptyResult('No reviewable files found after filtering.');
    }

    const cachedResult = this.cache.get<ReviewResult>(filteredDiff);
    if (cachedResult) {
      logger.info('Using cached review result');
      return cachedResult;
    }

    const chunks = chunkDiff(filteredDiff, this.config.maxChunkSize);
    
    if (chunks.length === 0) {
      return this.createEmptyResult('No changes to review.');
    }

    logger.info(`Reviewing ${chunks.length} chunk(s)...`);

    const linesCount = filteredDiff.split('\n').length;
    const filesCount = this.countFiles(filteredDiff);

    let result: ReviewResult;
    if (chunks.length === 1) {
      result = await this.reviewSingleChunk(chunks[0], linesCount, filesCount);
    } else {
      result = await this.reviewMultipleChunks(chunks, linesCount, filesCount);
    }

    this.cache.set(filteredDiff, result);
    return result;
  }

  private createEmptyResult(summary: string): ReviewResult {
    return {
      summary,
      issues: [],
      stats: this.createStats([]),
      metadata: this.createMetadata(0, 0, 0),
    };
  }

  private countFiles(diff: string): number {
    const matches = diff.match(/^diff --git/gm);
    return matches ? matches.length : 0;
  }

  private async reviewSingleChunk(
    chunk: DiffChunk,
    linesCount: number,
    filesCount: number
  ): Promise<ReviewResult> {
    formatProgress('Analyzing code changes...');
    
    const promptOptions: PromptOptions = {
      focus: this.config.reviewFocus,
    };
    
    const prompt = buildReviewPrompt(chunk, promptOptions);
    const response = await this.ollama.generate(prompt);
    
    clearProgress();
    
    const parsed = parseReviewResponse(response);
    const filteredIssues = this.filterBySeverity(parsed.issues);
    
    return this.buildResult(parsed.summary, filteredIssues, linesCount, filesCount, 1);
  }

  private async reviewMultipleChunks(
    chunks: DiffChunk[],
    linesCount: number,
    filesCount: number
  ): Promise<ReviewResult> {
    const allIssues: ReviewIssue[] = [];
    const summaries: string[] = [];
    
    const promptOptions: PromptOptions = {
      focus: this.config.reviewFocus,
    };

    for (const chunk of chunks) {
      formatProgress(`Analyzing chunk ${chunk.index + 1}/${chunk.total}...`);
      
      const prompt = buildReviewPrompt(chunk, promptOptions);
      const response = await this.ollama.generate(prompt);
      
      logger.debug(`Chunk ${chunk.index + 1} response length: ${response.length}`);
      
      const parsed = parseReviewResponse(response);
      
      if (parsed.summary && !parsed.summary.includes('Failed to parse')) {
        summaries.push(parsed.summary);
      }
      
      for (const issue of parsed.issues) {
        allIssues.push(issue);
      }
      
      logger.debug(`Completed chunk ${chunk.index + 1}/${chunk.total}: ${parsed.issues.length} issues found`);
    }

    clearProgress();

    const uniqueIssues = this.deduplicateIssues(allIssues);
    const filteredIssues = this.filterBySeverity(uniqueIssues);
    const summary = summaries.length > 0 
      ? this.consolidateSummaries(summaries)
      : 'Review completed across multiple chunks.';
    
    return this.buildResult(summary, filteredIssues, linesCount, filesCount, chunks.length);
  }

  private consolidateSummaries(summaries: string[]): string {
    const uniqueSummaries = [...new Set(summaries)];
    if (uniqueSummaries.length === 1) {
      return uniqueSummaries[0];
    }
    return uniqueSummaries.slice(0, 3).join(' ');
  }

  private filterBySeverity(issues: ReviewIssue[]): ReviewIssue[] {
    const threshold = this.config.reviewFocus.severityThreshold || 'low';
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const thresholdIndex = severityOrder.indexOf(threshold);
    
    return issues.filter(issue => {
      const issueIndex = severityOrder.indexOf(issue.severity);
      return issueIndex >= thresholdIndex;
    });
  }

  private deduplicateIssues(issues: ReviewIssue[]): ReviewIssue[] {
    const seen = new Set<string>();
    const unique: ReviewIssue[] = [];
    
    for (const issue of issues) {
      const key = `${issue.file}:${issue.line || 0}:${issue.message.slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(issue);
      }
    }
    
    return unique;
  }

  private buildResult(
    summary: string,
    issues: ReviewIssue[],
    linesCount: number,
    filesCount: number,
    chunksCount: number
  ): ReviewResult {
    return {
      summary,
      issues,
      stats: this.createStats(issues),
      metadata: this.createMetadata(linesCount, filesCount, chunksCount),
    };
  }

  private createStats(issues: ReviewIssue[]): ReviewStats {
    const byCategory: Record<string, number> = {};
    const byFile: Record<string, number> = {};

    for (const issue of issues) {
      byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
      byFile[issue.file] = (byFile[issue.file] || 0) + 1;
    }

    return {
      totalIssues: issues.length,
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
      byCategory,
      byFile,
    };
  }

  private createMetadata(
    linesCount: number,
    filesCount: number,
    chunksCount: number
  ): ReviewMetadata {
    return {
      reviewedAt: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      model: this.config.model,
      filesReviewed: filesCount,
      linesReviewed: linesCount,
      chunksProcessed: chunksCount,
    };
  }
}

export const createReviewer = (config: Config): Reviewer => {
  return new Reviewer(config);
};
