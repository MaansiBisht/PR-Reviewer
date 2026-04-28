import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createOrchestrator, OrchestratorOptions, AgentLog, AgentInfo } from '../orchestrator';
import { createGitService } from '../services/git';
import { Config, DEFAULT_CONFIG, PRSource, ReviewResult } from '../types';
import { loadProjectConfig, mergeConfig } from '../utils/config-loader';
import { logger } from '../utils/logger';
import { getReviewStore, IssueFeedback, StoredReview } from '../services/review-store';
import { getResponseCache } from '../services/response-cache';

interface ReviewJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentAgent?: string;
  result?: ReviewResult;
  error?: string;
  createdAt: Date;
  logs: AgentLog[];
  agents: AgentInfo[];
}

const reviewJobs = new Map<string, ReviewJob>();

export function createServer(config: Config) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const orchestrator = createOrchestrator(config);
      const prereq = await orchestrator.checkPrerequisites();
      
      res.json({
        ollama: prereq.ok,
        model: config.model,
        message: prereq.message,
      });
    } catch (error) {
      res.json({
        ollama: false,
        model: config.model,
        message: (error as Error).message,
      });
    }
  });

  app.get('/api/repos', async (req: Request, res: Response) => {
    const searchPath = (req.query.path as string) || os.homedir();
    try {
      const repos = findGitRepos(searchPath, 2);
      res.json({ repos, searchPath });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/branches', async (req: Request, res: Response) => {
    const repoPath = (req.query.repoPath as string) || process.cwd();
    try {
      const git = createGitService(repoPath);
      const isRepo = await git.isGitRepository();
      if (!isRepo) {
        res.status(400).json({ error: `Not a git repository: ${repoPath}` });
        return;
      }
      const [local, remote] = await Promise.all([
        git.getLocalBranches(),
        git.getRemoteBranches(),
      ]);
      res.json({ local, remote, repoPath });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/models', async (_req: Request, res: Response) => {
    try {
      const response = await axios.get(`${config.ollamaUrl}/api/tags`);
      const models: string[] = (response.data.models || []).map((m: { name: string }) => m.name);
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message, models: [] });
    }
  });

  app.get('/api/config', (_req: Request, res: Response) => {
    const projectConfig = loadProjectConfig();
    const merged = mergeConfig({}, projectConfig);
    res.json(merged);
  });

  app.put('/api/config', (req: Request, res: Response) => {
    const updates = req.body as Partial<Config>;
    if (updates.model) config.model = updates.model;
    if (updates.ollamaUrl) config.ollamaUrl = updates.ollamaUrl;
    if (updates.baseBranch) config.baseBranch = updates.baseBranch;
    if (updates.maxChunkSize) config.maxChunkSize = updates.maxChunkSize;
    res.json({ success: true, config });
  });

  app.post('/api/reviews', async (req: Request, res: Response) => {
    try {
      const { source, agents } = req.body as { source: PRSource; agents?: string[] };
      
      const jobId = uuidv4();
      const job: ReviewJob = {
        id: jobId,
        status: 'pending',
        progress: 0,
        createdAt: new Date(),
        logs: [],
        agents: [],
      };
      
      reviewJobs.set(jobId, job);
      
      runReviewJob(jobId, source, agents, config);
      
      res.json({ id: jobId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/reviews/:id', (req: Request, res: Response) => {
    const job = reviewJobs.get(req.params.id);
    
    if (!job) {
      // Try persisted store as fallback
      const stored = getReviewStore().getReview(req.params.id);
      if (stored) {
        res.json({
          id: stored.id,
          status: 'completed',
          progress: 100,
          result: stored,
          logs: [],
          agents: [],
        });
        return;
      }
      res.status(404).json({ error: 'Review not found' });
      return;
    }
    
    res.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      currentAgent: job.currentAgent,
      result: job.result,
      error: job.error,
      logs: job.logs,
      agents: job.agents,
    });
  });

  app.get('/api/reviews/:id/logs', (req: Request, res: Response) => {
    const job = reviewJobs.get(req.params.id);
    
    if (!job) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }
    
    const since = req.query.since ? parseInt(req.query.since as string, 10) : 0;
    const logs = job.logs.filter((_, index) => index >= since);
    
    res.json({
      logs,
      total: job.logs.length,
      agents: job.agents,
    });
  });

  app.get('/api/agents', (_req: Request, res: Response) => {
    const orchestrator = createOrchestrator(config);
    const agents = orchestrator.getAgentInfos();
    res.json(agents);
  });

  app.get('/api/reviews/:id/result', (req: Request, res: Response) => {
    const job = reviewJobs.get(req.params.id);
    
    if (!job) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }
    
    if (!job.result) {
      res.status(400).json({ error: 'Review not completed' });
      return;
    }
    
    res.json(job.result);
  });

  app.get('/api/reviews', (_req: Request, res: Response) => {
    // Include both in-memory and persisted reviews
    const store = getReviewStore();
    const inMemory = Array.from(reviewJobs.values())
      .filter(job => job.status === 'completed' && job.result)
      .map(job => ({
        id: job.id,
        ...job.result,
      }));
    
    const persisted = store.getAllReviews();
    
    // Merge, preferring in-memory (more recent)
    const merged = [...inMemory];
    for (const p of persisted) {
      if (!merged.find(m => m.id === p.id)) {
        merged.push(p);
      }
    }
    
    res.json(merged.slice(0, 50));
  });

  // === ANALYTICS ENDPOINTS ===
  app.get('/api/analytics', (_req: Request, res: Response) => {
    try {
      const store = getReviewStore();
      const stats = store.getStats();
      const cacheStats = getResponseCache().getStats();
      res.json({
        ...stats,
        cache: cacheStats,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // === FEEDBACK ENDPOINTS ===
  app.post('/api/reviews/:id/feedback', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { issueId, verdict, notes } = req.body as {
        issueId: string;
        verdict: 'confirmed' | 'false_positive' | 'dismissed';
        notes?: string;
      };

      if (!issueId || !verdict) {
        res.status(400).json({ error: 'issueId and verdict are required' });
        return;
      }

      const store = getReviewStore();
      const feedback: IssueFeedback = {
        issueId,
        verdict,
        notes,
        timestamp: new Date().toISOString(),
      };
      store.addFeedback(id, feedback);
      res.json({ success: true, feedback });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/reviews/:id/feedback', (req: Request, res: Response) => {
    try {
      const store = getReviewStore();
      const feedback = store.getFeedback(req.params.id);
      res.json({ feedback });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // === MEMORY/LEARNING ENDPOINT ===
  app.get('/api/memory/similar', (req: Request, res: Response) => {
    try {
      const { file, category, message } = req.query as Record<string, string>;
      if (!file || !category || !message) {
        res.status(400).json({ error: 'file, category, and message required' });
        return;
      }
      const store = getReviewStore();
      const similar = store.findSimilarFindings(file, category, message);
      res.json({ similar });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // === CACHE MANAGEMENT ===
  app.delete('/api/cache', (_req: Request, res: Response) => {
    getResponseCache().clear();
    res.json({ success: true, message: 'Cache cleared' });
  });

  app.get('/api/cache/stats', (_req: Request, res: Response) => {
    res.json(getResponseCache().getStats());
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(`Server error: ${err.message}`);
    res.status(500).json({ error: err.message });
  });

  return app;
}

async function runReviewJob(
  jobId: string,
  source: PRSource,
  agents: string[] | undefined,
  config: Config
) {
  const job = reviewJobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'running';
    job.progress = 10;
    job.logs = [];

    const options: OrchestratorOptions = {
      agents: agents as OrchestratorOptions['agents'],
      prSource: source,
      onAgentLog: (log: AgentLog) => {
        job.logs.push(log);
        job.currentAgent = log.agent;
        
        // Update progress based on agent activity
        if (log.action === 'start') {
          const agentIndex = job.agents.findIndex(a => a.name === log.agent);
          if (agentIndex !== -1) {
            job.agents[agentIndex].status = 'running';
          }
        } else if (log.action === 'complete') {
          const agentIndex = job.agents.findIndex(a => a.name === log.agent);
          if (agentIndex !== -1) {
            job.agents[agentIndex].status = 'completed';
          }
          // Update progress
          const completedCount = job.agents.filter(a => a.status === 'completed').length;
          job.progress = 20 + Math.floor((completedCount / job.agents.length) * 70);
        }
      },
      verbose: true,
    };

    const orchestrator = createOrchestrator(config, options);
    
    // Store agent info
    job.agents = orchestrator.getAgentInfos();
    job.progress = 20;
    job.currentAgent = 'Orchestrator';

    const result = await orchestrator.reviewPR(source);
    
    job.status = 'completed';
    job.progress = 100;
    job.result = result;
    job.currentAgent = undefined;
    
    // Mark all agents as completed
    job.agents.forEach(a => a.status = 'completed');
    
    // Persist to review store for analytics & history
    try {
      const storedReview: StoredReview = {
        ...result,
        id: jobId,
        repoPath: source.repoPath,
        branch: source.branch,
        baseBranch: source.baseBranch,
      };
      getReviewStore().addReview(storedReview);
      logger.debug(`Persisted review ${jobId} to store`);
    } catch (storeError) {
      logger.warn(`Failed to persist review: ${(storeError as Error).message}`);
    }
    
    logger.info(`Review ${jobId} completed successfully`);
  } catch (error) {
    job.status = 'failed';
    job.error = (error as Error).message;
    
    // Mark current agent as error
    if (job.currentAgent) {
      const agentIndex = job.agents.findIndex(a => a.name === job.currentAgent);
      if (agentIndex !== -1) {
        job.agents[agentIndex].status = 'error';
      }
    }
    
    logger.error(`Review ${jobId} failed: ${job.error}`);
  }
}

function findGitRepos(searchPath: string, maxDepth: number): string[] {
  const repos: string[] = [];
  
  const scan = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    try {
      const gitDir = path.join(dir, '.git');
      if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
        repos.push(dir);
        return; // Don't recurse into nested repos
      }
      if (depth < maxDepth) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scan(path.join(dir, entry.name), depth + 1);
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  };

  scan(searchPath, 0);
  return repos;
}

export function startServer(config: Config, port: number = 3001) {
  const app = createServer(config);
  
  app.listen(port, () => {
    logger.info(`PR Reviewer API server running on http://localhost:${port}`);
  });
  
  return app;
}
