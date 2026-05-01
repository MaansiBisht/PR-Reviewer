import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Github,
  Play,
  AlertCircle,
  CheckCircle,
  Loader2,
  Shield,
  Gauge,
  CheckCircle2,
  Layers,
  Zap,
  Clock,
  ArrowRight,
  Cpu,
  Activity,
} from 'lucide-react';
import { useReviewStore, PRSource } from '../store/reviewStore';
import { reviewApi, AgentInfo, AgentLog } from '../api/client';

type SourceType = 'local' | 'github' | 'bitbucket';

const AGENT_CONFIGS = [
  {
    id: 'security',
    name: 'SecurityAgent',
    role: 'Security',
    icon: Shield,
    gradient: 'from-red-500 to-rose-600',
    ringColor: 'ring-red-500/40',
    glowColor: 'shadow-[0_0_20px_rgba(239,68,68,0.2)]',
    textColor: 'text-red-500 dark:text-red-400',
    description: 'Scans for vulnerabilities, injection flaws, and security misconfigurations',
  },
  {
    id: 'complexity',
    name: 'ComplexityAgent',
    role: 'Complexity',
    icon: Gauge,
    gradient: 'from-amber-500 to-orange-500',
    ringColor: 'ring-amber-500/40',
    glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]',
    textColor: 'text-amber-500 dark:text-amber-400',
    description: 'Analyzes cyclomatic complexity, Big-O, and performance bottlenecks',
  },
  {
    id: 'feature-verification',
    name: 'FeatureVerificationAgent',
    role: 'Verification',
    icon: CheckCircle2,
    gradient: 'from-emerald-500 to-green-500',
    ringColor: 'ring-emerald-500/40',
    glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]',
    textColor: 'text-emerald-500 dark:text-emerald-400',
    description: 'Verifies implementation matches intent and identifies gaps',
  },
  {
    id: 'synthesis',
    name: 'SynthesisAgent',
    role: 'Synthesis',
    icon: Layers,
    gradient: 'from-violet-500 to-purple-600',
    ringColor: 'ring-violet-500/40',
    glowColor: 'shadow-[0_0_20px_rgba(139,92,246,0.2)]',
    textColor: 'text-violet-500 dark:text-violet-400',
    description: 'Aggregates findings and generates final recommendations',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoading, error, setLoading, setError, addReview } = useReviewStore();

  const [sourceType, setSourceType] = useState<SourceType>('local');
  const [branches, setBranches] = useState<{ local: string[]; remote: string[] }>({ local: [], remote: [] });
  const [repoPath, setRepoPath] = useState('');
  const [repoSuggestions, setRepoSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ branch: '', baseBranch: 'main', owner: '', repo: '', prNumber: '' });
  const [healthStatus, setHealthStatus] = useState<{ ok: boolean; provider: string; model: string; message: string } | null>(null);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, 'idle' | 'running' | 'completed' | 'error'>>({});
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [reviewPhase, setReviewPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [agentStartTimes, setAgentStartTimes] = useState<Record<string, number>>({});

  useEffect(() => {
    checkHealth();
    loadRepos();
  }, []);

  const checkHealth = async () => {
    try {
      const status = await reviewApi.checkHealth();
      setHealthStatus(status);
    } catch {
      setHealthStatus({ ok: false, provider: 'unknown', model: '', message: 'Connection failed' });
    }
  };

  const loadRepos = async (searchPath?: string) => {
    try {
      const data = await reviewApi.getRepos(searchPath);
      setRepoSuggestions(data.repos);
      if (data.repos.length > 0) await selectRepo(data.repos[0]);
    } catch { /* no repos found */ }
  };

  const selectRepo = async (selectedPath: string) => {
    setRepoPath(selectedPath);
    setShowSuggestions(false);
    setBranchError(null);
    setBranches({ local: [], remote: [] });
    try {
      const data = await reviewApi.getBranches(selectedPath);
      setBranches(data);
      const allBranches = [...data.local, ...data.remote];
      const firstBranch = data.local[0] || '';
      const baseBranch =
        data.local.find(b => b === 'main' || b === 'master') ||
        allBranches.find(b => b.endsWith('/main') || b.endsWith('/master')) ||
        data.local[0] || 'main';
      setFormData(prev => ({ ...prev, branch: firstBranch, baseBranch }));
    } catch (err: any) {
      setBranchError(err?.response?.data?.error || 'Not a git repository');
    }
  };

  const handleRepoPathChange = (val: string) => {
    setRepoPath(val);
    const filtered = repoSuggestions.filter(r => r.toLowerCase().includes(val.toLowerCase()));
    setShowSuggestions(filtered.length > 0 && val.length > 0);
  };

  const handleRepoPathBlur = () => {
    setTimeout(() => setShowSuggestions(false), 150);
    if (repoPath && !repoSuggestions.includes(repoPath)) selectRepo(repoPath);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAgentStatuses({});
    setAgentLogs([]);
    setProgress(0);
    setReviewPhase('running');
    setReviewResult(null);
    setElapsedSeconds(0);
    setAgentStartTimes({});
    const startTime = Date.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000)), 1000);

    try {
      const source: PRSource = {
        type: sourceType,
        branch: formData.branch,
        baseBranch: formData.baseBranch,
        ...(sourceType === 'local' ? { repoPath: repoPath || undefined } : {}),
        ...(sourceType !== 'local' ? {
          owner: formData.owner,
          repo: formData.repo,
          prNumber: parseInt(formData.prNumber, 10),
        } : {}),
      };

      const { id } = await reviewApi.startReview({ source });

      const pollStatus = async () => {
        try {
          const status = await reviewApi.getReviewStatus(id);
          setCurrentAgent(status.currentAgent || null);
          setProgress(status.progress || 0);

          if (status.agents && status.agents.length > 0) {
            const statuses: Record<string, 'idle' | 'running' | 'completed' | 'error'> = {};
            status.agents.forEach((a: AgentInfo) => { statuses[a.name] = a.status; });
            setAgentStatuses(statuses);
            setAgentStartTimes(prev => {
              const next = { ...prev };
              status.agents!.forEach((a: AgentInfo) => {
                if (a.status === 'running' && !next[a.name]) next[a.name] = Date.now();
              });
              return next;
            });
          }
          if (status.logs && status.logs.length > 0) setAgentLogs(status.logs);

          if (status.status === 'completed' && status.result) {
            clearInterval(timer);
            setProgress(100);
            setReviewPhase('done');
            setReviewResult(status.result);
            addReview({ ...status.result, id });
            setLoading(false);
          } else if (status.status === 'failed') {
            clearInterval(timer);
            setReviewPhase('error');
            setError(status.error || 'Review failed');
            setLoading(false);
          } else {
            setTimeout(pollStatus, 400);
          }
        } catch {
          setTimeout(pollStatus, 1000);
        }
      };

      pollStatus();
    } catch (err) {
      setReviewPhase('error');
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const getAgentStatus = (agentName: string) => agentStatuses[agentName] || 'idle';
  const getAgentLogs = (agentName: string) => agentLogs.filter(l => l.agent === agentName).slice(-4);

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between animate-fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold text-surface-900 dark:text-white tracking-tight">
              Code Review
            </h1>
            <p className="text-sm text-surface-500 mt-1">
              Multi-agent AI · Security · Complexity · Verification · Synthesis
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {healthStatus?.ok ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-500/10 border border-accent-500/20 rounded-xl text-xs font-medium text-accent-600 dark:text-accent-400">
                <span className="status-dot-success animate-pulse" />
                Connected
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-medium text-red-500">
                <AlertCircle className="w-3.5 h-3.5" />
                Offline
              </div>
            )}
            {healthStatus?.provider && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl">
                <Cpu className="w-3.5 h-3.5 text-primary-500" />
                <span className="text-xs font-mono text-surface-600 dark:text-surface-300 capitalize">{healthStatus.provider}</span>
                {healthStatus.model && (
                  <span className="text-xs font-mono text-surface-400">/ {healthStatus.model}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="card p-5 animate-fade-up delay-75">
          <form onSubmit={handleSubmit} className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest mb-2">
                Source
              </label>
              <div className="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800/60 rounded-xl border border-surface-200 dark:border-surface-700/50">
                {(['local', 'github', 'bitbucket'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSourceType(type)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                      sourceType === type
                        ? 'bg-primary-500 text-white shadow-glow-sm'
                        : 'text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-700/60'
                    }`}
                  >
                    {type === 'github' ? <Github className="w-3.5 h-3.5" /> : <GitBranch className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline capitalize">{type}</span>
                  </button>
                ))}
              </div>
            </div>

            {sourceType === 'local' ? (
              <>
                <div className="flex-1 min-w-[200px] relative">
                  <label className="block text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest mb-2">
                    Repository
                  </label>
                  <input
                    type="text"
                    value={repoPath}
                    onChange={(e) => handleRepoPathChange(e.target.value)}
                    onFocus={() => setShowSuggestions(repoSuggestions.length > 0)}
                    onBlur={handleRepoPathBlur}
                    placeholder="/path/to/repo"
                    className="input font-mono text-sm"
                  />
                  {showSuggestions && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-2 card shadow-elevated max-h-48 overflow-y-auto animate-slide-down">
                      {repoSuggestions
                        .filter(r => !repoPath || r.toLowerCase().includes(repoPath.toLowerCase()))
                        .map(r => (
                          <button
                            key={r}
                            type="button"
                            onMouseDown={() => selectRepo(r)}
                            className="w-full text-left px-4 py-2.5 text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-mono truncate transition-colors"
                          >
                            {r}
                          </button>
                        ))}
                    </div>
                  )}
                  {branchError && <p className="absolute -bottom-5 left-0 text-xs text-red-500">{branchError}</p>}
                </div>
                <div className="w-40">
                  <label className="block text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest mb-2">Branch</label>
                  <select value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })} className="input text-sm" disabled={branches.local.length === 0}>
                    {branches.local.map(b => <option key={b} value={b}>{b}</option>)}
                    {branches.remote.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest mb-2">Base</label>
                  <select value={formData.baseBranch} onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })} className="input text-sm" disabled={branches.local.length === 0}>
                    {branches.local.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="w-36">
                  <label className="block text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest mb-2">Owner</label>
                  <input type="text" value={formData.owner} onChange={(e) => setFormData({ ...formData, owner: e.target.value })} placeholder="owner" className="input text-sm" />
                </div>
                <div className="w-36">
                  <label className="block text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest mb-2">Repo</label>
                  <input type="text" value={formData.repo} onChange={(e) => setFormData({ ...formData, repo: e.target.value })} placeholder="repo-name" className="input text-sm" />
                </div>
                <div className="w-28">
                  <label className="block text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest mb-2">PR #</label>
                  <input type="number" value={formData.prNumber} onChange={(e) => setFormData({ ...formData, prNumber: e.target.value })} placeholder="42" className="input text-sm" />
                </div>
              </>
            )}

            <button type="submit" disabled={isLoading || !healthStatus?.ok} className="btn-primary px-6 py-2.5 self-end">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isLoading ? 'Analyzing…' : 'Run Review'}
            </button>
          </form>
        </div>

        {/* Agent Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {AGENT_CONFIGS.map((agent, index) => {
            const status = getAgentStatus(agent.name);
            const logs = getAgentLogs(agent.name);
            const Icon = agent.icon;
            const isRunning = status === 'running';
            const isDone = status === 'completed';

            return (
              <div
                key={agent.id}
                className={`relative card overflow-hidden transition-all duration-300 animate-fade-up scan-hover ${
                  isRunning ? `ring-2 ${agent.ringColor} ${agent.glowColor}` :
                  isDone ? 'ring-1 ring-accent-500/30' :
                  status === 'error' ? 'ring-1 ring-red-500/30' : ''
                }`}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {isRunning && (
                  <div className="absolute inset-0 bg-gradient-to-b from-primary-500/5 to-transparent pointer-events-none" />
                )}

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${agent.gradient}`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-300 ${
                      isRunning ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' :
                      isDone ? 'bg-accent-500/10 text-accent-600 dark:text-accent-400' :
                      status === 'error' ? 'bg-red-500/10 text-red-500' :
                      'bg-surface-100 dark:bg-surface-800 text-surface-400'
                    }`}>
                      {status === 'idle' && <Clock className="w-3 h-3" />}
                      {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
                      {isDone && <CheckCircle className="w-3 h-3" />}
                      {status === 'error' && <AlertCircle className="w-3 h-3" />}
                      <span className="hidden sm:inline capitalize">{status}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className={`font-display font-semibold text-sm mb-0.5 ${agent.textColor}`}>
                      {agent.role}
                    </h3>
                    <p className="text-xs text-surface-500 leading-relaxed line-clamp-2">{agent.description}</p>
                  </div>

                  {isRunning && (
                    <div className="flex items-center gap-2 text-xs">
                      <Activity className="w-3 h-3 text-primary-500 animate-pulse" />
                      <span className="font-mono text-primary-600 dark:text-primary-400">
                        {agentStartTimes[agent.name]
                          ? `${Math.floor((Date.now() - agentStartTimes[agent.name]) / 1000)}s`
                          : `${elapsedSeconds}s`}
                      </span>
                      <span className="text-surface-400 animate-pulse">analyzing…</span>
                    </div>
                  )}

                  {logs.length > 0 && (
                    <div className="space-y-1.5">
                      {logs.map((log, i) => (
                        <div key={i} className="flex items-start gap-1.5 animate-fade-in">
                          <Zap className="w-2.5 h-2.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <span className="text-[11px] text-surface-500 dark:text-surface-400 leading-snug">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-0.5 bg-surface-100 dark:bg-surface-800">
                  {isRunning && <div className={`h-full bg-gradient-to-r ${agent.gradient} animate-shimmer`} style={{ width: '65%' }} />}
                  {isDone && <div className="h-full bg-accent-400 w-full transition-all duration-700" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        {(isLoading || reviewPhase === 'done') && (
          <div className="card p-5 animate-fade-up">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {reviewPhase === 'done' ? (
                  <div className="p-2 bg-accent-500/10 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-accent-500" />
                  </div>
                ) : (
                  <div className="p-2 bg-primary-500/10 rounded-xl">
                    <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-surface-900 dark:text-white">
                    {reviewPhase === 'done' ? 'Analysis Complete' : currentAgent ? `Running ${currentAgent}` : 'Starting…'}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5 font-mono">{elapsedSeconds}s elapsed</p>
                </div>
              </div>
              <span className="font-display text-2xl font-bold gradient-text">{progress}%</span>
            </div>
            <div className="progress-bar h-2">
              <div
                className={`progress-bar-fill ${reviewPhase === 'done' ? '!bg-accent-400' : ''}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {reviewPhase === 'error' && error && (
          <div className="card border-red-500/30 bg-red-500/5 p-5 flex items-start gap-4 animate-fade-up">
            <div className="p-2 bg-red-500/10 rounded-xl flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Review Failed</p>
              <p className="text-sm text-red-500/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Result */}
        {reviewPhase === 'done' && reviewResult && (
          <div className="card overflow-hidden animate-fade-up">
            <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-800">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-accent-500/10 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-accent-500" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-surface-900 dark:text-white">Analysis Complete</h2>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {reviewResult.stats?.totalIssues ?? 0} issues · {reviewResult.metadata?.filesReviewed ?? 0} files
                    {reviewResult.metadata?.overallRiskLevel && (
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        reviewResult.metadata.overallRiskLevel === 'high' ? 'bg-red-500/10 text-red-500' :
                        reviewResult.metadata.overallRiskLevel === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-accent-500/10 text-accent-500'
                      }`}>
                        {reviewResult.metadata.overallRiskLevel} risk
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {reviewResult.stats?.critical > 0 && <span className="badge severity-critical">{reviewResult.stats.critical} critical</span>}
                {reviewResult.stats?.high > 0 && <span className="badge severity-high">{reviewResult.stats.high} high</span>}
                {reviewResult.stats?.medium > 0 && <span className="badge severity-medium">{reviewResult.stats.medium} med</span>}
                {reviewResult.stats?.low > 0 && <span className="badge severity-low">{reviewResult.stats.low} low</span>}
              </div>
            </div>

            <div className="p-5 border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
              <p className="text-sm text-surface-700 dark:text-surface-300 leading-relaxed">{reviewResult.summary}</p>
            </div>

            {reviewResult.issues?.length > 0 && (
              <div className="p-5">
                <h3 className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest mb-4">Top Issues</h3>
                <div className="space-y-2">
                  {reviewResult.issues.slice(0, 5).map((issue: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3.5 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700/50 hover:border-primary-500/20 transition-all duration-200 scan-hover">
                      <span className={`badge flex-shrink-0 mt-0.5 ${
                        issue.severity === 'critical' ? 'severity-critical' :
                        issue.severity === 'high' ? 'severity-high' :
                        issue.severity === 'medium' ? 'severity-medium' : 'severity-low'
                      }`}>{issue.severity}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-surface-800 dark:text-surface-200 leading-relaxed">{issue.message}</p>
                        {issue.file && (
                          <p className="text-[11px] text-surface-400 mt-1 font-mono">{issue.file}{issue.line ? `:${issue.line}` : ''}</p>
                        )}
                        {issue.suggestion && (
                          <p className="text-xs text-surface-500 mt-2 italic border-l-2 border-primary-500/30 pl-3">{issue.suggestion}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {reviewResult.issues.length > 5 && (
                  <button onClick={() => navigate(`/review/${reviewResult.id || ''}`)} className="btn-secondary mt-4 w-full group">
                    View all {reviewResult.issues.length} issues
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {reviewPhase === 'idle' && (
          <div className="card p-12 text-center animate-fade-up delay-200">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center animate-float">
              <Layers className="w-7 h-7 text-primary-500" />
            </div>
            <h3 className="font-display text-xl font-bold text-surface-800 dark:text-surface-200 mb-2">
              Ready to Analyze
            </h3>
            <p className="text-sm text-surface-500 max-w-xs mx-auto leading-relaxed">
              Select a repository and branch above, then click{' '}
              <strong className="text-surface-700 dark:text-surface-300">Run Review</strong> to begin.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
