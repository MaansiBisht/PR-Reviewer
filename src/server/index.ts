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
        ok: prereq.ok,
        provider: config.provider,
        model: config.provider === 'ollama' ? config.model : (config.cloudModel || ''),
        message: prereq.message,
      });
    } catch (error) {
      res.json({
        ok: false,
        provider: config.provider,
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
    if (config.provider !== 'ollama') {
      res.json({ models: [], provider: config.provider });
      return;
    }
    try {
      const response = await axios.get(`${config.ollamaUrl}/api/tags`);
      const models: string[] = (response.data.models || []).map((m: { name: string }) => m.name);
      res.json({ models, provider: 'ollama' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message, models: [] });
    }
  });

  app.get('/api/config', (_req: Request, res: Response) => {
    const { apiKey: _apiKey, ...safeConfig } = config;
    res.json(safeConfig);
  });

  app.put('/api/config', (req: Request, res: Response) => {
    const updates = req.body as Partial<Config>;
    if (updates.provider) config.provider = updates.provider;
    if (updates.apiKey !== undefined) config.apiKey = updates.apiKey;
    if (updates.cloudModel) config.cloudModel = updates.cloudModel;
    if (updates.githubToken !== undefined) config.githubToken = updates.githubToken;
    if (updates.bitbucketToken !== undefined) config.bitbucketToken = updates.bitbucketToken;
    if (updates.bitbucketUsername !== undefined) config.bitbucketUsername = updates.bitbucketUsername;
    if (updates.model) config.model = updates.model;
    if (updates.ollamaUrl) config.ollamaUrl = updates.ollamaUrl;
    if (updates.baseBranch) config.baseBranch = updates.baseBranch;
    if (updates.maxChunkSize) config.maxChunkSize = updates.maxChunkSize;
    const { apiKey: _apiKey, ...safeConfig } = config;
    res.json({ success: true, config: safeConfig });
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

  addPRBrowserRoutes(app, config);

  // Serve compiled React frontend in production (web/dist must exist)
  const webDist = path.join(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

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

function createGitHubClient(token: string) {
  return axios.create({
    baseURL: 'https://api.github.com',
    headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `Bearer ${token}` },
  });
}

function createBitbucketClient(token: string) {
  return axios.create({
    baseURL: 'https://api.bitbucket.org/2.0',
    headers: { 'Authorization': `Bearer ${token}` },
  });
}

function addPRBrowserRoutes(app: ReturnType<typeof express>, config: Config) {
  // ── GitHub ──────────────────────────────────────────────────────────────
  app.get('/api/github/repos', async (_req: Request, res: Response) => {
    if (!config.githubToken) { res.status(400).json({ error: 'GitHub token not configured' }); return; }
    try {
      const gh = createGitHubClient(config.githubToken);
      const response = await gh.get('/user/repos', { params: { sort: 'updated', per_page: 50, type: 'all' } });
      const repos = response.data.map((r: { full_name: string; description: string; private: boolean; open_issues_count: number }) => ({
        fullName: r.full_name,
        description: r.description,
        private: r.private,
        openPRs: r.open_issues_count,
      }));
      res.json({ repos });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/github/repos/:owner/:repo/pulls', async (req: Request, res: Response) => {
    if (!config.githubToken) { res.status(400).json({ error: 'GitHub token not configured' }); return; }
    try {
      const { owner, repo } = req.params;
      const gh = createGitHubClient(config.githubToken);
      const response = await gh.get(`/repos/${owner}/${repo}/pulls`, { params: { state: 'open', per_page: 50 } });
      const pulls = response.data.map((pr: {
        number: number; title: string; user: { login: string };
        head: { ref: string }; base: { ref: string }; created_at: string; html_url: string;
        labels: { name: string }[];
      }) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        head: pr.head.ref,
        base: pr.base.ref,
        createdAt: pr.created_at,
        url: pr.html_url,
        labels: pr.labels.map((l: { name: string }) => l.name),
      }));
      res.json({ pulls, owner, repo });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Bitbucket ────────────────────────────────────────────────────────────
  app.get('/api/bitbucket/repos', async (_req: Request, res: Response) => {
    if (!config.bitbucketToken) { res.status(400).json({ error: 'Bitbucket token not configured' }); return; }
    try {
      const bb = createBitbucketClient(config.bitbucketToken);
      const response = await bb.get('/repositories', { params: { role: 'member', pagelen: 50 } });
      const repos = response.data.values.map((r: { full_name: string; description: string; is_private: boolean }) => ({
        fullName: r.full_name,
        description: r.description,
        private: r.is_private,
      }));
      res.json({ repos });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/bitbucket/repos/:workspace/:repo/pulls', async (req: Request, res: Response) => {
    if (!config.bitbucketToken) { res.status(400).json({ error: 'Bitbucket token not configured' }); return; }
    try {
      const { workspace, repo } = req.params;
      const bb = createBitbucketClient(config.bitbucketToken);
      const response = await bb.get(`/repositories/${workspace}/${repo}/pullrequests`, { params: { state: 'OPEN' } });
      const pulls = response.data.values.map((pr: {
        id: number; title: string; author: { display_name: string };
        source: { branch: { name: string } }; destination: { branch: { name: string } };
        created_on: string; links: { html: { href: string } };
      }) => ({
        number: pr.id,
        title: pr.title,
        author: pr.author.display_name,
        head: pr.source.branch.name,
        base: pr.destination.branch.name,
        createdAt: pr.created_on,
        url: pr.links.html.href,
        labels: [],
      }));
      res.json({ pulls, workspace, repo });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}

export function startServer(config: Config, port: number = 3001) {
  const app = createServer(config);
  
  app.listen(port, () => {
    logger.info(`PR Reviewer API server running on http://localhost:${port}`);
  });
  
  return app;
}
