import { Config, ReviewResult, PRSource, ProjectContext } from '../types';
import { OllamaClient, createOllamaClient } from '../services/ollama';
import { createGitService, GitService } from '../services/git';
import { 
  BaseAgent, 
  AgentContext, 
  AgentResult,
  AgentLog,
  AgentLogCallback,
  AgentConfig,
  SecurityAgent,
  ComplexityAgent,
  FeatureVerificationAgent,
  SynthesisAgent
} from '../agents';
import { logger } from '../utils/logger';
import { extractProjectContext } from '../services/context-extractor';
import { GitHubProvider } from '../providers/github';
import { BitbucketProvider } from '../providers/bitbucket';
import { LocalProvider } from '../providers/local';
import { PRProvider, PRDetails } from '../providers/base';

export { AgentLog, AgentLogCallback, AgentConfig };

export interface AgentInfo {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  capabilities: string[];
  focusAreas: string[];
  status: 'idle' | 'running' | 'completed' | 'error';
}

export interface OrchestratorOptions {
  agents?: ('security' | 'complexity' | 'feature-verification')[];
  parallel?: boolean;
  fetchRelatedCode?: boolean;
  extractContext?: boolean;
  prSource?: PRSource;
  onAgentLog?: AgentLogCallback;
  verbose?: boolean;
}

export class Orchestrator {
  private config: Config;
  private ollama: OllamaClient;
  private git: GitService;
  private agents: BaseAgent[] = [];
  private synthesisAgent: SynthesisAgent;
  private options: OrchestratorOptions;
  private agentLogs: AgentLog[] = [];

  constructor(config: Config, options: OrchestratorOptions = {}) {
    this.config = config;
    this.options = {
      agents: options.agents || ['security', 'complexity', 'feature-verification'],
      parallel: options.parallel ?? false,
      fetchRelatedCode: options.fetchRelatedCode ?? true,
      extractContext: options.extractContext ?? true,
      prSource: options.prSource,
      onAgentLog: options.onAgentLog,
      verbose: options.verbose ?? false,
    };
    
    this.ollama = createOllamaClient(config);
    this.git = createGitService();
    this.synthesisAgent = new SynthesisAgent(config, this.ollama, this.createLogCallback());
    
    this.initializeAgents();
  }

  private createLogCallback(): AgentLogCallback {
    return (log: AgentLog) => {
      this.agentLogs.push(log);
      if (this.options.onAgentLog) {
        this.options.onAgentLog(log);
      }
    };
  }

  private initializeAgents(): void {
    const logCallback = this.createLogCallback();
    
    const agentMap: Record<string, () => BaseAgent> = {
      'security': () => new SecurityAgent(this.config, this.ollama, logCallback),
      'complexity': () => new ComplexityAgent(this.config, this.ollama, logCallback),
      'feature-verification': () => new FeatureVerificationAgent(this.config, this.ollama, logCallback),
    };

    for (const agentName of this.options.agents || []) {
      if (agentMap[agentName]) {
        this.agents.push(agentMap[agentName]());
        logger.debug(`Initialized agent: ${agentName}`);
      }
    }
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
        message: `Model "${this.config.model}" not found. Available models: ${models.join(', ') || 'none'}`,
      };
    }

    return { ok: true, message: 'All prerequisites met.' };
  }

  async reviewPR(prSource: PRSource): Promise<ReviewResult> {
    logger.info('Starting multi-agent PR review...');
    const startTime = Date.now();

    const provider = this.getProvider(prSource);
    const prDetails = await provider.fetchPRDetails();
    
    logger.info(`Reviewing PR: ${prDetails.title || prSource.branch}`);
    logger.debug(`Base: ${prDetails.baseBranch}, Head: ${prDetails.headBranch}`);

    const diff = await provider.fetchDiff();
    
    if (!diff || diff.trim().length === 0) {
      return this.createEmptyResult('No changes found to review.');
    }

    // Pass repoPath for context extraction
    const repoPath = prSource.repoPath || process.cwd();
    const context = await this.buildContext(diff, prDetails, provider, repoPath);
    
    const agentResults = await this.runAgents(context);
    
    const result = await this.synthesisAgent.synthesize({
      agentResults,
      context,
    });

    // Add project context to result metadata
    if (context.projectContext) {
      result.metadata.projectContext = context.projectContext;
    }

    logger.info(`Review completed in ${Date.now() - startTime}ms`);
    return result;
  }

  async reviewDiff(diff: string, options: { baseBranch?: string; targetBranch?: string } = {}): Promise<ReviewResult> {
    logger.info('Starting multi-agent diff review...');
    
    if (!diff || diff.trim().length === 0) {
      return this.createEmptyResult('No changes found to review.');
    }

    const context: AgentContext = {
      diff,
      files: this.extractFilesFromDiff(diff),
      baseBranch: options.baseBranch || this.config.baseBranch,
      targetBranch: options.targetBranch || 'HEAD',
    };

    if (this.options.fetchRelatedCode) {
      context.relatedCode = await this.fetchRelatedCode(context.files);
    }

    const agentResults = await this.runAgents(context);
    
    return this.synthesisAgent.synthesize({
      agentResults,
      context,
    });
  }

  private getProvider(prSource: PRSource): PRProvider {
    switch (prSource.type) {
      case 'github':
        return new GitHubProvider(prSource, this.git);
      case 'bitbucket':
        return new BitbucketProvider(prSource, this.git);
      case 'local':
      default:
        // Use repoPath-aware git service if provided
        const localGit = prSource.repoPath
          ? createGitService(prSource.repoPath)
          : this.git;
        return new LocalProvider(prSource, localGit);
    }
  }

  private async buildContext(diff: string, prDetails: PRDetails, provider: PRProvider, repoPath?: string): Promise<AgentContext> {
    const files = this.extractFilesFromDiff(diff);
    
    const context: AgentContext = {
      diff,
      files,
      prDescription: prDetails.description,
      baseBranch: prDetails.baseBranch,
      targetBranch: prDetails.headBranch,
      commitMessages: prDetails.commits?.map(c => c.message),
      handoffNotes: [],
    };

    if (this.options.fetchRelatedCode) {
      context.relatedCode = await this.fetchRelatedCode(files);
    }

    // Extract project context for smarter analysis
    if (this.options.extractContext && repoPath) {
      try {
        logger.debug('Extracting project context...');
        context.projectContext = await extractProjectContext(repoPath);
        logger.info(`Project context: ${context.projectContext.language}${context.projectContext.framework ? ` / ${context.projectContext.framework}` : ''}`);
      } catch (error) {
        logger.debug(`Context extraction failed: ${(error as Error).message}`);
      }
    }

    return context;
  }

  private async runAgents(context: AgentContext): Promise<AgentResult[]> {
    logger.info(`Running ${this.agents.length} agents...`);

    if (this.options.parallel) {
      const results = await Promise.all(
        this.agents.map(agent => this.runAgentSafely(agent, context))
      );
      return results.filter((r): r is AgentResult => r !== null);
    } else {
      // Sequential mode with handoffs between agents
      const results: AgentResult[] = [];
      const runningContext = { ...context, handoffNotes: [...(context.handoffNotes || [])] };
      
      for (const agent of this.agents) {
        const result = await this.runAgentSafely(agent, runningContext);
        if (result) {
          results.push(result);
          
          // Generate handoff notes for next agent
          if (result.handoff) {
            runningContext.handoffNotes = [...runningContext.handoffNotes, result.handoff];
            logger.debug(`${agent.getName()} passed ${result.handoff.keyFindings.length} findings to next agent`);
          }
        }
      }
      return results;
    }
  }

  private async runAgentSafely(agent: BaseAgent, context: AgentContext): Promise<AgentResult | null> {
    try {
      logger.debug(`Running ${agent.getName()}...`);
      return await agent.analyze(context);
    } catch (error) {
      logger.error(`Agent ${agent.getName()} failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async fetchRelatedCode(files: string[]): Promise<Map<string, string>> {
    const relatedCode = new Map<string, string>();
    
    try {
      for (const file of files.slice(0, 5)) {
        const importers = await this.git.findImporters(file);
        
        for (const importer of importers.slice(0, 3)) {
          if (!relatedCode.has(importer)) {
            const content = await this.git.getFileContent(importer);
            if (content) {
              relatedCode.set(importer, content);
            }
          }
        }
      }
    } catch (error) {
      logger.debug(`Failed to fetch related code: ${(error as Error).message}`);
    }

    return relatedCode;
  }

  private extractFilesFromDiff(diff: string): string[] {
    const files: string[] = [];
    const regex = /^diff --git a\/(.+?) b\//gm;
    let match;
    
    while ((match = regex.exec(diff)) !== null) {
      files.push(match[1]);
    }
    
    return [...new Set(files)];
  }

  private createEmptyResult(summary: string): ReviewResult {
    return {
      summary,
      issues: [],
      stats: {
        totalIssues: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        byCategory: {},
        byFile: {},
      },
      metadata: {
        reviewedAt: new Date().toISOString(),
        duration: 0,
        model: this.config.model,
        filesReviewed: 0,
        linesReviewed: 0,
        chunksProcessed: 0,
      },
    };
  }

  getAgentNames(): string[] {
    return this.agents.map(a => a.getName());
  }

  getAgentInfos(): AgentInfo[] {
    return this.agents.map(agent => {
      const config = agent.getAgentConfig();
      return {
        name: agent.getName(),
        role: config.role,
        goal: config.goal,
        backstory: config.backstory,
        capabilities: config.capabilities,
        focusAreas: config.focusAreas,
        status: 'idle' as const,
      };
    });
  }

  getLogs(): AgentLog[] {
    return [...this.agentLogs];
  }

  clearLogs(): void {
    this.agentLogs = [];
  }
}

export function createOrchestrator(config: Config, options?: OrchestratorOptions): Orchestrator {
  return new Orchestrator(config, options);
}
