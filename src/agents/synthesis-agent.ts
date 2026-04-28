import { BaseAgent, AgentContext, AgentResult, AgentConfig, AgentLogCallback } from './base-agent';
import { Config, ReviewIssue, ReviewResult, ReviewStats, ReviewMetadata } from '../types';
import { OllamaClient } from '../services/ollama';
import { logger } from '../utils/logger';

const SYNTHESIS_AGENT_CONFIG: AgentConfig = {
  role: 'Review Synthesis Coordinator',
  goal: 'Aggregate, deduplicate, prioritize, and synthesize findings from all agents into a coherent final review',
  backstory: `You are a principal engineer and team lead with 15+ years of experience coordinating 
large-scale code reviews. You've managed review processes for teams of 100+ developers and have 
a talent for distilling complex technical findings into actionable insights. You understand that 
different perspectives (security, performance, correctness) must be balanced and prioritized 
based on context. Your reviews are known for being fair, comprehensive, and actionable. You 
believe in constructive feedback that helps developers grow while maintaining code quality.`,
  capabilities: [
    'Multi-agent result aggregation',
    'Issue deduplication and merging',
    'Priority scoring and ranking',
    'Executive summary generation',
    'Risk level assessment',
    'Approval recommendation',
  ],
  focusAreas: [
    'Cross-agent correlation',
    'Issue prioritization',
    'Actionable recommendations',
    'Risk assessment',
    'Review coherence',
    'Developer experience',
  ],
};

interface SynthesisInput {
  agentResults: AgentResult[];
  context: AgentContext;
}

interface PrioritizedIssue extends ReviewIssue {
  priority: number;
  sources: string[];
  consensus?: boolean;           // True when multiple agents flagged it
  consensusCount?: number;       // How many agents agreed
}

interface SynthesizedAnalysis {
  executiveSummary: string;
  keyFindings: string[];
  prioritizedIssues: PrioritizedIssue[];
  recommendations: string[];
  overallRiskLevel: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  approvalRecommendation: 'approve' | 'request_changes' | 'needs_discussion';
  confidenceScore: number;
}

export class SynthesisAgent extends BaseAgent {
  constructor(config: Config, ollama: OllamaClient, logCallback?: AgentLogCallback) {
    super('SynthesisAgent', config, ollama, SYNTHESIS_AGENT_CONFIG, logCallback);
  }

  async analyze(context: AgentContext): Promise<AgentResult> {
    throw new Error('Use synthesize() method instead');
  }

  async synthesize(input: SynthesisInput): Promise<ReviewResult> {
    const startTime = Date.now();
    this.log('start', 'Starting synthesis of agent results', {
      role: this.agentConfig.role,
      agentCount: input.agentResults.length,
      agents: input.agentResults.map(r => r.agentName),
    });

    this.log('collect', 'Collecting issues from all agents');
    const allIssues = this.collectAllIssues(input.agentResults);
    this.log('collect_complete', `Collected ${allIssues.length} total issues`);
    
    this.log('deduplicate', 'Deduplicating overlapping issues');
    const deduplicatedIssues = this.deduplicateIssues(allIssues);
    this.log('deduplicate_complete', `Reduced to ${deduplicatedIssues.length} unique issues`);
    
    this.log('prioritize', 'Calculating priority scores and ranking issues');
    const prioritizedIssues = this.prioritizeIssues(deduplicatedIssues);
    this.log('prioritize_complete', 'Issues ranked by severity, category, and cross-agent agreement');
    
    this.log('llm_synthesis', 'Generating executive summary and recommendations via LLM');
    const llmSynthesis = await this.runLLMSynthesis(input, prioritizedIssues);
    this.log('llm_complete', `Generated synthesis with ${llmSynthesis?.keyFindings?.length || 0} key findings`);
    
    this.log('finalize', 'Finalizing review result');
    const finalIssues = this.applyLLMPrioritization(prioritizedIssues, llmSynthesis);
    
    const stats = this.calculateStats(finalIssues);
    const metadata = this.createMetadata(input, startTime);

    this.log('complete', 'Synthesis completed', {
      totalIssues: finalIssues.length,
      recommendation: llmSynthesis?.approvalRecommendation || 'unknown',
      riskLevel: llmSynthesis?.overallRiskLevel || 'unknown',
      executionTime: Date.now() - startTime,
    });

    // Calculate overall confidence from all agents
    const overallConfidence = this.calculateAggregateConfidence(input.agentResults);

    return {
      summary: llmSynthesis?.executiveSummary || this.generateFallbackSummary(input.agentResults),
      issues: finalIssues,
      stats,
      metadata: {
        ...metadata,
        keyFindings: llmSynthesis?.keyFindings || [],
        recommendations: llmSynthesis?.recommendations || [],
        overallRiskLevel: llmSynthesis?.overallRiskLevel || this.calculateRiskLevel(stats),
        approvalRecommendation: llmSynthesis?.approvalRecommendation || this.calculateApprovalRecommendation(stats),
        overallConfidence,
        agentResults: input.agentResults.map(r => ({
          agent: r.agentName,
          issueCount: r.issues.length,
          confidence: r.confidence,
          executionTime: r.executionTime,
        })),
      },
    };
  }

  private calculateAggregateConfidence(agentResults: AgentResult[]): number {
    if (agentResults.length === 0) return 0;
    
    // Weight by number of issues found - agents with more findings have more influence
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const result of agentResults) {
      const weight = Math.max(1, result.issues.length);
      weightedSum += result.confidence * weight;
      totalWeight += weight;
    }
    
    return Math.round(weightedSum / totalWeight);
  }

  private collectAllIssues(agentResults: AgentResult[]): Array<ReviewIssue & { source: string }> {
    const allIssues: Array<ReviewIssue & { source: string }> = [];
    
    for (const result of agentResults) {
      for (const issue of result.issues) {
        allIssues.push({
          ...issue,
          source: result.agentName,
        });
      }
    }
    
    return allIssues;
  }

  private deduplicateIssues(issues: Array<ReviewIssue & { source: string }>): PrioritizedIssue[] {
    const issueMap = new Map<string, PrioritizedIssue>();
    
    for (const issue of issues) {
      const key = this.generateIssueKey(issue);
      
      if (issueMap.has(key)) {
        const existing = issueMap.get(key)!;
        if (!existing.sources.includes(issue.source)) {
          existing.sources.push(issue.source);
        }
        existing.priority = Math.max(existing.priority, this.calculateBasePriority(issue));
        
        if (this.severityToNumber(issue.severity) > this.severityToNumber(existing.severity)) {
          existing.severity = issue.severity;
        }

        // Merge evidence
        if (issue.evidence && issue.evidence.length > 0) {
          existing.evidence = [...(existing.evidence || []), ...issue.evidence];
        }

        // Boost confidence when multiple agents agree (consensus boost)
        if (existing.sources.length > 1) {
          const baseConfidence = Math.max(issue.confidence ?? 70, existing.confidence ?? 70);
          // +5% per additional agent, capped at 98%
          const boost = (existing.sources.length - 1) * 5;
          existing.confidence = Math.min(98, baseConfidence + boost);
          existing.consensus = true;
          existing.consensusCount = existing.sources.length;
        }
      } else {
        issueMap.set(key, {
          ...issue,
          priority: this.calculateBasePriority(issue),
          sources: [issue.source],
          consensus: false,
          consensusCount: 1,
        });
      }
    }
    
    return Array.from(issueMap.values());
  }

  private generateIssueKey(issue: ReviewIssue): string {
    const normalizedMessage = issue.message.toLowerCase().slice(0, 50);
    return `${issue.file}:${issue.line || 0}:${issue.category}:${normalizedMessage}`;
  }

  private calculateBasePriority(issue: ReviewIssue): number {
    const severityScore = {
      critical: 100,
      high: 75,
      medium: 50,
      low: 25,
    };
    
    const categoryScore: Record<string, number> = {
      security: 20,
      bug: 15,
      'error-handling': 10,
      performance: 10,
      logic: 10,
      architecture: 5,
      style: 0,
      documentation: 0,
      naming: 0,
      duplication: 5,
      testing: 5,
      dependency: 10,
      general: 0,
    };
    
    return severityScore[issue.severity] + (categoryScore[issue.category] || 0);
  }

  private severityToNumber(severity: string): number {
    const map: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return map[severity] || 0;
  }

  private prioritizeIssues(issues: PrioritizedIssue[]): PrioritizedIssue[] {
    for (const issue of issues) {
      if (issue.sources.length > 1) {
        issue.priority += issue.sources.length * 10;
      }
    }
    
    return issues.sort((a, b) => b.priority - a.priority);
  }

  private async runLLMSynthesis(
    input: SynthesisInput,
    prioritizedIssues: PrioritizedIssue[]
  ): Promise<SynthesizedAnalysis | null> {
    const prompt = this.buildSynthesisPrompt(input, prioritizedIssues);
    
    try {
      const response = await this.generateWithRetry(prompt);
      return this.parseJsonResponse<SynthesizedAnalysis>(response);
    } catch (error) {
      logger.error(`[${this.name}] LLM synthesis failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildSynthesisPrompt(input: SynthesisInput, issues: PrioritizedIssue[]): string {
    const agentSummaries = input.agentResults
      .map(r => `${r.agentName}: ${r.summary} (${r.issues.length} issues, confidence: ${(r.confidence * 100).toFixed(0)}%)`)
      .join('\n');

    const topIssues = issues.slice(0, 10).map((issue, i) => 
      `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.message} (${issue.file}:${issue.line || '?'})`
    ).join('\n');

    return `You are a senior code reviewer synthesizing multiple agent analyses into a final review.

**CRITICAL: Output ONLY valid JSON. No explanations, no markdown outside JSON.**

Agent Summaries:
${agentSummaries}

Top Issues Found:
${topIssues}

Total Issues: ${issues.length}
- Critical: ${issues.filter(i => i.severity === 'critical').length}
- High: ${issues.filter(i => i.severity === 'high').length}
- Medium: ${issues.filter(i => i.severity === 'medium').length}
- Low: ${issues.filter(i => i.severity === 'low').length}

Provide:
1. Executive summary for the PR author
2. Key findings (most important points)
3. Prioritized recommendations
4. Overall risk assessment
5. Approval recommendation

JSON format:
{
  "executiveSummary": "Concise summary of the review findings",
  "keyFindings": [
    "Most important finding 1",
    "Most important finding 2"
  ],
  "prioritizedIssues": [],
  "recommendations": [
    "Top recommendation 1",
    "Top recommendation 2"
  ],
  "overallRiskLevel": "critical|high|medium|low|minimal",
  "approvalRecommendation": "approve|request_changes|needs_discussion",
  "confidenceScore": 0.85
}

JSON:`;
  }

  private applyLLMPrioritization(
    issues: PrioritizedIssue[],
    _synthesis: SynthesizedAnalysis | null
  ): ReviewIssue[] {
    return issues.map(issue => ({
      file: issue.file,
      line: issue.line,
      endLine: issue.endLine,
      severity: issue.severity,
      category: issue.category,
      message: issue.message,
      suggestion: issue.suggestion,
      codeSnippet: issue.codeSnippet,
      confidence: issue.confidence,
      evidence: issue.evidence,
      reasoning: issue.reasoning,
      consensus: issue.consensus,
      consensusCount: issue.consensusCount,
      sources: issue.sources,
    }));
  }

  private calculateStats(issues: ReviewIssue[]): ReviewStats {
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

  private createMetadata(input: SynthesisInput, startTime: number): ReviewMetadata {
    const totalExecutionTime = input.agentResults.reduce((sum, r) => sum + r.executionTime, 0);
    const filesReviewed = new Set(input.agentResults.flatMap(r => r.issues.map(i => i.file))).size;
    
    return {
      reviewedAt: new Date().toISOString(),
      duration: Date.now() - startTime + totalExecutionTime,
      model: this.config.model,
      filesReviewed,
      linesReviewed: input.context.diff.split('\n').length,
      chunksProcessed: input.agentResults.length,
    };
  }

  private calculateRiskLevel(stats: ReviewStats): 'critical' | 'high' | 'medium' | 'low' | 'minimal' {
    if (stats.critical > 0) return 'critical';
    if (stats.high > 2) return 'high';
    if (stats.high > 0 || stats.medium > 5) return 'medium';
    if (stats.medium > 0 || stats.low > 10) return 'low';
    return 'minimal';
  }

  private calculateApprovalRecommendation(stats: ReviewStats): 'approve' | 'request_changes' | 'needs_discussion' {
    if (stats.critical > 0 || stats.high > 2) return 'request_changes';
    if (stats.high > 0 || stats.medium > 5) return 'needs_discussion';
    return 'approve';
  }

  private generateFallbackSummary(agentResults: AgentResult[]): string {
    const totalIssues = agentResults.reduce((sum, r) => sum + r.issues.length, 0);
    const agentNames = agentResults.map(r => r.agentName).join(', ');
    
    return `Multi-agent review completed by ${agentNames}. Found ${totalIssues} total issues across all analyses.`;
  }
}
