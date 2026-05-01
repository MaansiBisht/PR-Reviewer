import { LLMProvider } from '../services/llm';
import { Config, ReviewIssue, ProjectContext } from '../types';
import { logger } from '../utils/logger';
import { getResponseCache } from '../services/response-cache';

export interface AgentConfig {
  role: string;
  goal: string;
  backstory: string;
  capabilities: string[];
  focusAreas: string[];
  verbose?: boolean;
}

export interface AgentLog {
  timestamp: Date;
  agent: string;
  action: string;
  message: string;
  details?: Record<string, unknown>;
}

export type AgentLogCallback = (log: AgentLog) => void;

export interface AgentContext {
  diff: string;
  files: string[];
  prDescription?: string;
  baseBranch: string;
  targetBranch: string;
  commitMessages?: string[];
  relatedCode?: Map<string, string>;
  projectContext?: ProjectContext;
  handoffNotes?: AgentHandoff[];
}

export interface AgentHandoff {
  from: string;
  keyFindings: string[];
  areasOfConcern: string[];
  suggestedFocus: string[];
}

export interface AgentResult {
  agentName: string;
  issues: ReviewIssue[];
  summary: string;
  metadata: Record<string, unknown>;
  confidence: number;
  executionTime: number;
  reasoningSteps?: string[];
  handoff?: AgentHandoff;
}

export abstract class BaseAgent {
  protected llm: LLMProvider;
  protected config: Config;
  protected name: string;
  protected agentConfig: AgentConfig;
  protected logCallback?: AgentLogCallback;
  protected verbose: boolean;

  constructor(
    name: string,
    config: Config,
    llm: LLMProvider,
    agentConfig: AgentConfig,
    logCallback?: AgentLogCallback
  ) {
    this.name = name;
    this.config = config;
    this.llm = llm;
    this.agentConfig = agentConfig;
    this.logCallback = logCallback;
    this.verbose = agentConfig.verbose ?? false;
  }

  abstract analyze(context: AgentContext): Promise<AgentResult>;

  protected log(action: string, message: string, details?: Record<string, unknown>): void {
    const logEntry: AgentLog = {
      timestamp: new Date(),
      agent: this.name,
      action,
      message,
      details,
    };

    if (this.verbose) {
      logger.info(`[${this.name}] ${action}: ${message}`);
    } else {
      logger.debug(`[${this.name}] ${action}: ${message}`);
    }

    if (this.logCallback) {
      this.logCallback(logEntry);
    }
  }

  getAgentConfig(): AgentConfig {
    return this.agentConfig;
  }

  getRole(): string {
    return this.agentConfig.role;
  }

  getGoal(): string {
    return this.agentConfig.goal;
  }

  getBackstory(): string {
    return this.agentConfig.backstory;
  }

  getCapabilities(): string[] {
    return this.agentConfig.capabilities;
  }

  protected async generateWithRetry(prompt: string, maxRetries = 3): Promise<string> {
    // Check cache first
    const cache = getResponseCache();
    const cached = cache.get(prompt, this.config.model, this.name);
    if (cached) {
      this.log('llm_cache_hit', `Using cached response (saved ~${Math.round(prompt.length / 100)}s)`);
      return cached;
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.log('llm_request', `Sending request to LLM (attempt ${attempt}/${maxRetries})`);
        const response = await this.llm.generate(prompt);
        this.log('llm_response', `Received response from LLM`, { responseLength: response.length });
        
        // Cache the successful response
        cache.set(prompt, this.config.model, this.name, response);
        
        return response;
      } catch (error) {
        lastError = error as Error;
        this.log('llm_error', `Attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < maxRetries) {
          await this.sleep(1000 * attempt);
        }
      }
    }
    
    throw new Error(`[${this.name}] Failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  protected parseJsonResponse<T>(response: string): T | null {
    try {
      let jsonStr = response.trim();
      
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      const startIndex = jsonStr.indexOf('{');
      const endIndex = jsonStr.lastIndexOf('}');
      
      if (startIndex !== -1 && endIndex !== -1) {
        jsonStr = jsonStr.slice(startIndex, endIndex + 1);
      }
      
      return JSON.parse(jsonStr) as T;
    } catch (error) {
      logger.debug(`[${this.name}] JSON parse error: ${(error as Error).message}`);
      return null;
    }
  }

  protected extractFilesFromDiff(diff: string): string[] {
    const files: string[] = [];
    const regex = /^diff --git a\/(.+?) b\//gm;
    let match;
    
    while ((match = regex.exec(diff)) !== null) {
      files.push(match[1]);
    }
    
    return [...new Set(files)];
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getName(): string {
    return this.name;
  }

  protected buildChainOfThoughtPrompt(basePrompt: string, context: AgentContext): string {
    let prompt = basePrompt;

    // Add project context if available
    if (context.projectContext) {
      const ctx = context.projectContext;
      prompt += `\n\n## Project Context
- Language: ${ctx.language}
- Framework: ${ctx.framework || 'Not detected'}
- Test Framework: ${ctx.testFramework || 'Not detected'}
- Patterns: ${ctx.patterns.join(', ') || 'None detected'}
- Naming Convention: ${ctx.conventions.naming || 'mixed'}
- Key Dependencies: ${ctx.dependencies.slice(0, 10).join(', ')}
`;
    }

    // Add handoff notes from previous agents
    if (context.handoffNotes && context.handoffNotes.length > 0) {
      prompt += `\n\n## Notes from Previous Agents\n`;
      for (const note of context.handoffNotes) {
        prompt += `\n### From ${note.from}:\n`;
        if (note.keyFindings.length > 0) {
          prompt += `- Key Findings: ${note.keyFindings.join('; ')}\n`;
        }
        if (note.areasOfConcern.length > 0) {
          prompt += `- Areas of Concern: ${note.areasOfConcern.join('; ')}\n`;
        }
        if (note.suggestedFocus.length > 0) {
          prompt += `- Suggested Focus: ${note.suggestedFocus.join('; ')}\n`;
        }
      }
    }

    // Add chain-of-thought instruction
    prompt += `\n\n## Analysis Instructions
Think step by step:
1. First, understand what this code change is trying to accomplish
2. Identify patterns, anti-patterns, or areas of concern relevant to your expertise
3. For each issue found, explain WHY it's a problem and provide evidence
4. Rate your confidence (0-100) based on how certain you are about each finding
5. Provide actionable suggestions for fixes

For each issue, include:
- confidence: A score from 0-100 indicating how certain you are
- evidence: Specific code snippets or line references that support your finding
- reasoning: A brief explanation of your analysis process
`;

    return prompt;
  }

  protected generateHandoff(result: AgentResult): AgentHandoff {
    const keyFindings = result.issues
      .filter(i => i.severity === 'critical' || i.severity === 'high')
      .slice(0, 5)
      .map(i => `${i.severity.toUpperCase()}: ${i.message} (${i.file}${i.line ? ':' + i.line : ''})`);

    const areasOfConcern = [...new Set(result.issues.map(i => i.category))];

    const suggestedFocus: string[] = [];
    if (result.issues.some(i => i.category === 'security')) {
      suggestedFocus.push('Verify security-related code paths');
    }
    if (result.issues.some(i => i.category === 'performance')) {
      suggestedFocus.push('Check performance implications');
    }
    if (result.issues.some(i => i.category === 'error-handling')) {
      suggestedFocus.push('Review error handling completeness');
    }

    return {
      from: this.name,
      keyFindings,
      areasOfConcern,
      suggestedFocus,
    };
  }

  protected calculateOverallConfidence(issues: ReviewIssue[]): number {
    if (issues.length === 0) return 85; // High confidence when no issues found
    
    const confidences = issues
      .map(i => i.confidence ?? 70)
      .filter(c => c > 0);
    
    if (confidences.length === 0) return 70;
    
    // Weighted average - higher severity issues weight more
    const weightedSum = issues.reduce((sum, issue) => {
      const weight = issue.severity === 'critical' ? 2 : 
                     issue.severity === 'high' ? 1.5 : 
                     issue.severity === 'medium' ? 1 : 0.5;
      return sum + (issue.confidence ?? 70) * weight;
    }, 0);
    
    const totalWeight = issues.reduce((sum, issue) => {
      return sum + (issue.severity === 'critical' ? 2 : 
                    issue.severity === 'high' ? 1.5 : 
                    issue.severity === 'medium' ? 1 : 0.5);
    }, 0);
    
    return Math.round(weightedSum / totalWeight);
  }
}
