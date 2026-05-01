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
  Clock
} from 'lucide-react';
import { useReviewStore, PRSource } from '../store/reviewStore';
import { reviewApi, AgentInfo, AgentLog } from '../api/client';

type SourceType = 'local' | 'github' | 'bitbucket';

const AGENT_CONFIGS = [
  {
    id: 'security',
    name: 'SecurityAgent',
    role: 'Security Auditor',
    icon: Shield,
    color: 'from-red-500 to-rose-600',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    description: 'Scans for vulnerabilities, injection flaws, and security misconfigurations',
  },
  {
    id: 'complexity',
    name: 'ComplexityAgent',
    role: 'Complexity Analyst',
    icon: Gauge,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    description: 'Analyzes cyclomatic complexity, Big-O, and performance bottlenecks',
  },
  {
    id: 'feature-verification',
    name: 'FeatureVerificationAgent',
    role: 'Feature Verifier',
    icon: CheckCircle2,
    color: 'from-emerald-500 to-green-600',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    description: 'Verifies implementation matches intent and identifies gaps',
  },
  {
    id: 'synthesis',
    name: 'SynthesisAgent',
    role: 'Synthesis Coordinator',
    icon: Layers,
    color: 'from-violet-500 to-purple-600',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
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
  const [formData, setFormData] = useState({
    branch: '',
    baseBranch: 'main',
    owner: '',
    repo: '',
    prNumber: '',
  });
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
      if (data.repos.length > 0) {
        await selectRepo(data.repos[0]);
      }
    } catch (error) {
      console.error('Failed to find repos:', error);
    }
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
      const baseBranch = data.local.find(b => b === 'main' || b === 'master') ||
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
    if (repoPath && !repoSuggestions.includes(repoPath)) {
      selectRepo(repoPath);
    }
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
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const source: PRSource = {
        type: sourceType,
        branch: formData.branch,
        baseBranch: formData.baseBranch,
        ...(sourceType === 'local' ? { repoPath: repoPath || undefined } : {}),
        ...(sourceType === 'github' || sourceType === 'bitbucket' ? {
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
            // Track when each agent starts
            setAgentStartTimes(prev => {
              const next = { ...prev };
              status.agents!.forEach((a: AgentInfo) => {
                if (a.status === 'running' && !next[a.name]) next[a.name] = Date.now();
              });
              return next;
            });
          }
          if (status.logs && status.logs.length > 0) {
            setAgentLogs(status.logs);
          }

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
    } catch (error) {
      setReviewPhase('error');
      setError((error as Error).message);
      setLoading(false);
    }
  };

  const getAgentStatus = (agentName: string) => agentStatuses[agentName] || 'idle';
  const getAgentLogs = (agentName: string) => agentLogs.filter(l => l.agent === agentName).slice(-5);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
              Code Review
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              AI-powered multi-agent analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            {healthStatus?.ok ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-accent-500/10 border border-accent-500/20 rounded-xl">
                <span className="w-2 h-2 bg-accent-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-sm font-medium text-accent-600 dark:text-accent-400">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">Offline</span>
              </div>
            )}
            {healthStatus?.provider && (
              <div className="px-4 py-2 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl">
                <span className="text-sm font-mono text-surface-600 dark:text-surface-300 capitalize">{healthStatus.provider}</span>
              </div>
            )}
            {healthStatus?.model && (
              <div className="px-4 py-2 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl">
                <span className="text-sm font-mono text-surface-600 dark:text-surface-300">{healthStatus.model}</span>
              </div>
            )}
          </div>
        </div>

        {/* Input Form Card */}
        <div className="card p-5 mb-6 animate-fade-up">
          <form onSubmit={handleSubmit} className="flex items-end gap-4 flex-wrap">
            {/* Source Type Selector */}
            <div className="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-xl">
              {(['local', 'github', 'bitbucket'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSourceType(type)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    sourceType === type
                      ? 'bg-primary-600 text-white shadow-glow'
                      : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
                  }`}
                >
                  {type === 'local' ? <GitBranch className="w-4 h-4" /> : 
                   type === 'github' ? <Github className="w-4 h-4" /> : 
                   <GitBranch className="w-4 h-4" />}
                  <span className="hidden sm:inline capitalize">{type}</span>
                </button>
              ))}
            </div>

            {/* Dynamic Fields */}
            {sourceType === 'local' ? (
              <>
                {/* Repo path with autocomplete */}
                <div className="flex-1 min-w-[200px] relative">
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">Repository</label>
                  <input
                    type="text"
                    value={repoPath}
                    onChange={(e) => handleRepoPathChange(e.target.value)}
                    onFocus={() => setShowSuggestions(repoSuggestions.length > 0)}
                    onBlur={handleRepoPathBlur}
                    placeholder="/path/to/your/repo"
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
                  {branchError && (
                    <p className="absolute -bottom-5 left-0 text-xs text-red-500">{branchError}</p>
                  )}
                </div>
                {/* Branch selectors */}
                <div className="w-40">
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">Branch</label>
                  <select
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    className="input text-sm"
                    disabled={branches.local.length === 0}
                  >
                    {branches.local.map(b => <option key={b} value={b}>{b}</option>)}
                    {branches.remote.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">Base</label>
                  <select
                    value={formData.baseBranch}
                    onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })}
                    className="input text-sm"
                    disabled={branches.local.length === 0}
                  >
                    {branches.local.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="w-36">
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">Owner</label>
                  <input
                    type="text"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="owner"
                    className="input text-sm"
                  />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">Repository</label>
                  <input
                    type="text"
                    value={formData.repo}
                    onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
                    placeholder="repo"
                    className="input text-sm"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">PR #</label>
                  <input
                    type="number"
                    value={formData.prNumber}
                    onChange={(e) => setFormData({ ...formData, prNumber: e.target.value })}
                    placeholder="123"
                    className="input text-sm"
                  />
                </div>
              </>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !healthStatus?.ok}
              className="btn-primary px-6 py-2.5 shadow-glow"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isLoading ? 'Analyzing...' : 'Start Review'}
            </button>
          </form>
        </div>

        {/* Agent Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {AGENT_CONFIGS.map((agent, index) => {
            const status = getAgentStatus(agent.name);
            const agentLogItems = getAgentLogs(agent.name);
            const Icon = agent.icon;
            return (
              <div
                key={agent.id}
                className={`card overflow-hidden transition-all duration-300 animate-fade-up ${
                  status === 'running' ? 'ring-2 ring-primary-500/50 shadow-glow' :
                  status === 'completed' ? 'ring-1 ring-accent-500/30' :
                  status === 'error' ? 'ring-1 ring-red-500/30' : ''
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Gradient overlay when running */}
                {status === 'running' && (
                  <div className={`absolute inset-0 opacity-5 bg-gradient-to-br ${agent.color} pointer-events-none`} />
                )}
                
                <div className="p-4 relative">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${agent.color} shadow-lg`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className={`p-1.5 rounded-lg ${
                      status === 'running' ? 'bg-primary-500/10' :
                      status === 'completed' ? 'bg-accent-500/10' :
                      status === 'error' ? 'bg-red-500/10' : 'bg-surface-100 dark:bg-surface-800'
                    }`}>
                      {status === 'idle' && <Clock className="w-4 h-4 text-surface-400" />}
                      {status === 'running' && <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />}
                      {status === 'completed' && <CheckCircle className="w-4 h-4 text-accent-500" />}
                      {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                    </div>
                  </div>
                  
                  {/* Title & Description */}
                  <h3 className="font-semibold text-surface-900 dark:text-white text-sm mb-1">{agent.role}</h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mb-3 leading-relaxed line-clamp-2">{agent.description}</p>
                  
                  {/* Running timer */}
                  {status === 'running' && (
                    <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-primary-500/10 rounded-lg">
                      <span className="text-xs text-primary-600 dark:text-primary-400 font-mono font-medium">
                        {agentStartTimes[agent.name]
                          ? `${Math.floor((Date.now() - agentStartTimes[agent.name]) / 1000)}s`
                          : `${elapsedSeconds}s`
                        }
                      </span>
                      <span className="text-xs text-primary-500 animate-pulse">analyzing…</span>
                    </div>
                  )}
                  
                  {/* Live log stream */}
                  <div className="space-y-2 min-h-[80px]">
                    {agentLogItems.length > 0 ? agentLogItems.map((log, i) => (
                      <div key={i} className="flex items-start gap-2 animate-fade-in">
                        <Zap className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-surface-600 dark:text-surface-300 leading-snug">{log.message}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-surface-400 italic">
                        {status === 'idle' ? 'Waiting to start...' : status === 'completed' ? 'Analysis complete' : ''}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Progress indicator */}
                <div className="h-1 bg-surface-100 dark:bg-surface-800">
                  {status === 'running' && (
                    <div className={`h-full bg-gradient-to-r ${agent.color} animate-pulse`} style={{ width: '60%' }} />
                  )}
                  {status === 'completed' && (
                    <div className="h-full bg-accent-500 w-full" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall Progress Bar */}
        {(isLoading || reviewPhase === 'done') && (
          <div className="card p-5 mb-6 animate-fade-up">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {reviewPhase === 'done' ? (
                  <div className="p-2 bg-accent-500/10 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-accent-500" />
                  </div>
                ) : (
                  <div className="p-2 bg-primary-500/10 rounded-lg">
                    <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-surface-900 dark:text-white">
                    {reviewPhase === 'done' ? 'Review Complete' : currentAgent ? `Running ${currentAgent}` : 'Starting analysis...'}
                  </p>
                  <p className="text-xs text-surface-500">{elapsedSeconds}s elapsed</p>
                </div>
              </div>
              <span className="text-lg font-mono font-bold text-primary-600 dark:text-primary-400">{progress}%</span>
            </div>
            <div className="progress-bar h-2">
              <div
                className={`progress-bar-fill ${reviewPhase === 'done' ? '!bg-accent-500' : ''}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Banner */}
        {reviewPhase === 'error' && error && (
          <div className="card border-red-500/30 bg-red-500/5 p-5 mb-6 flex items-start gap-4 animate-fade-up">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Review Failed</p>
              <p className="text-sm text-red-500/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Result Card */}
        {reviewPhase === 'done' && reviewResult && (
          <div className="card overflow-hidden animate-fade-up">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-800">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-accent-500/10 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-accent-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-surface-900 dark:text-white text-lg">Analysis Complete</h2>
                  <p className="text-sm text-surface-500 mt-0.5">
                    {reviewResult.stats?.totalIssues ?? 0} issues found
                    {reviewResult.metadata?.overallRiskLevel && (
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                        reviewResult.metadata.overallRiskLevel === 'high' ? 'bg-red-500/10 text-red-500' :
                        reviewResult.metadata.overallRiskLevel === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-accent-500/10 text-accent-500'
                      }`}>
                        {reviewResult.metadata.overallRiskLevel} risk
                      </span>
                    )}
                    {reviewResult.metadata?.overallConfidence && (
                      <span className="ml-2 text-surface-400">{reviewResult.metadata.overallConfidence}% confidence</span>
                    )}
                  </p>
                </div>
              </div>
              {/* Severity Pills */}
              <div className="flex items-center gap-2">
                {reviewResult.stats?.critical > 0 && (
                  <span className="badge severity-critical">{reviewResult.stats.critical} critical</span>
                )}
                {reviewResult.stats?.high > 0 && (
                  <span className="badge severity-high">{reviewResult.stats.high} high</span>
                )}
                {reviewResult.stats?.medium > 0 && (
                  <span className="badge severity-medium">{reviewResult.stats.medium} medium</span>
                )}
                {reviewResult.stats?.low > 0 && (
                  <span className="badge severity-low">{reviewResult.stats.low} low</span>
                )}
              </div>
            </div>
            
            {/* Summary */}
            <div className="p-5 border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
              <p className="text-sm text-surface-700 dark:text-surface-300 leading-relaxed">{reviewResult.summary}</p>
            </div>
            
            {/* Top Issues */}
            {reviewResult.issues?.length > 0 && (
              <div className="p-5">
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-4">Top Issues</h3>
                <div className="space-y-3">
                  {reviewResult.issues.slice(0, 5).map((issue: any, i: number) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700/50 hover:border-surface-300 dark:hover:border-surface-600 transition-colors">
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <span className={`badge ${
                          issue.severity === 'critical' ? 'severity-critical' :
                          issue.severity === 'high' ? 'severity-high' :
                          issue.severity === 'medium' ? 'severity-medium' :
                          'severity-low'
                        }`}>{issue.severity}</span>
                        {issue.confidence !== undefined && (
                          <span className={`badge font-mono ${
                            issue.confidence >= 80 ? 'badge-success' :
                            issue.confidence >= 50 ? 'badge-warning' :
                            'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400'
                          }`}>{issue.confidence}%</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-surface-800 dark:text-surface-200 leading-relaxed">{issue.message}</p>
                        {issue.file && (
                          <p className="text-xs text-surface-500 mt-1.5 font-mono bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded inline-block">
                            {issue.file}{issue.line ? `:${issue.line}` : ''}
                          </p>
                        )}
                        {issue.suggestion && (
                          <p className="text-xs text-surface-500 mt-2 italic border-l-2 border-primary-500/30 pl-3">{issue.suggestion}</p>
                        )}
                        {issue.reasoning && (
                          <details className="mt-3 group">
                            <summary className="text-xs text-primary-600 dark:text-primary-400 cursor-pointer hover:text-primary-500 font-medium">
                              View reasoning
                            </summary>
                            <p className="text-xs text-surface-500 mt-2 pl-3 border-l-2 border-surface-300 dark:border-surface-700">{issue.reasoning}</p>
                          </details>
                        )}
                        {issue.evidence && issue.evidence.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-400 font-medium">
                              Evidence ({issue.evidence.length})
                            </summary>
                            <ul className="text-xs text-surface-500 mt-2 pl-3 border-l-2 border-surface-300 dark:border-surface-700 space-y-1">
                              {issue.evidence.slice(0, 3).map((e: string, j: number) => (
                                <li key={j} className="font-mono">{e}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {reviewResult.issues.length > 5 && (
                  <button
                    onClick={() => navigate(`/review/${reviewResult.id || ''}`)}
                    className="btn-secondary mt-4 w-full"
                  >
                    View all {reviewResult.issues.length} issues
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {reviewPhase === 'idle' && (
          <div className="card p-12 text-center animate-fade-up">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
              <Layers className="w-8 h-8 text-surface-400" />
            </div>
            <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">Ready to Review</h3>
            <p className="text-sm text-surface-500 max-w-sm mx-auto">
              Select a repository and branch above, then click Start Review to begin AI-powered code analysis.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
