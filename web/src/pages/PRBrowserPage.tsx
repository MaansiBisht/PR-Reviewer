import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, RefreshCw, GitPullRequest, Lock, Unlock, ChevronRight, AlertCircle, ExternalLink } from 'lucide-react';
import api from '../api/client';

type ServiceType = 'github' | 'bitbucket';

interface Repo {
  fullName: string;
  description: string;
  private: boolean;
}

interface PullRequest {
  number: number;
  title: string;
  author: string;
  head: string;
  base: string;
  createdAt: string;
  url: string;
  labels: string[];
}

export default function PRBrowserPage() {
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceType>('github');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState('');

  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [pullsLoading, setPullsLoading] = useState(false);
  const [pullsError, setPullsError] = useState('');

  const [startingReview, setStartingReview] = useState<number | null>(null);

  const loadRepos = async () => {
    setReposLoading(true);
    setReposError('');
    setRepos([]);
    setSelectedRepo('');
    setPulls([]);
    try {
      const res = await api.get(`/api/${service}/repos`);
      setRepos(res.data.repos);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error || (err as Error).message;
      setReposError(msg || 'Failed to load repos');
    } finally {
      setReposLoading(false);
    }
  };

  const loadPulls = async (fullName: string) => {
    setSelectedRepo(fullName);
    setPullsLoading(true);
    setPullsError('');
    setPulls([]);
    const [ownerOrWorkspace, repo] = fullName.split('/');
    try {
      const res = await api.get(`/api/${service}/repos/${ownerOrWorkspace}/${repo}/pulls`);
      setPulls(res.data.pulls);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error || (err as Error).message;
      setPullsError(msg || 'Failed to load pull requests');
    } finally {
      setPullsLoading(false);
    }
  };

  const startReview = async (pr: PullRequest) => {
    setStartingReview(pr.number);
    const [owner, repo] = selectedRepo.split('/');
    try {
      const res = await api.post('/api/reviews', {
        source: { type: service, owner, repo, prNumber: pr.number },
        agents: ['security', 'complexity', 'feature-verification'],
      });
      navigate(`/review/${res.data.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error || (err as Error).message;
      alert(`Failed to start review: ${msg}`);
    } finally {
      setStartingReview(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">PR Browser</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Browse open pull requests and trigger AI reviews directly
        </p>
      </header>

      <div className="space-y-6">
        {/* Service + load */}
        <section className="card p-6 animate-fade-up">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex gap-3 flex-1">
              {(['github', 'bitbucket'] as ServiceType[]).map((s) => (
                <button
                  key={s}
                  onClick={() => { setService(s); setRepos([]); setSelectedRepo(''); setPulls([]); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
                    service === s
                      ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 shadow-glow'
                      : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-surface-300'
                  }`}
                >
                  <Github className="w-4 h-4" />
                  {s === 'github' ? 'GitHub' : 'Bitbucket'}
                </button>
              ))}
            </div>
            <button
              onClick={loadRepos}
              disabled={reposLoading}
              className="btn-primary px-6 py-3 flex items-center gap-2"
            >
              {reposLoading
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Loading...</>
                : <><RefreshCw className="w-4 h-4" />Load Repos</>}
            </button>
          </div>

          {reposError && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{reposError} — check your token in Settings</span>
            </div>
          )}
        </section>

        {/* Repo list + PR list */}
        {repos.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up">
            <section className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-200 dark:border-surface-700">
                <h2 className="text-sm font-semibold text-surface-900 dark:text-white">{repos.length} Repositories</h2>
              </div>
              <ul className="divide-y divide-surface-100 dark:divide-surface-800 max-h-[480px] overflow-y-auto">
                {repos.map((r) => (
                  <li key={r.fullName}>
                    <button
                      onClick={() => loadPulls(r.fullName)}
                      className={`w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors ${
                        selectedRepo === r.fullName ? 'bg-primary-500/5 border-l-2 border-primary-500' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {r.private
                            ? <Lock className="w-3 h-3 text-surface-400 shrink-0" />
                            : <Unlock className="w-3 h-3 text-surface-400 shrink-0" />}
                          <span className="text-sm font-medium text-surface-900 dark:text-white truncate">{r.fullName}</span>
                        </div>
                        {r.description && (
                          <p className="text-xs text-surface-500 mt-0.5 truncate">{r.description}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-surface-400 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-200 dark:border-surface-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-surface-900 dark:text-white">
                  {selectedRepo ? `Open PRs — ${selectedRepo}` : 'Select a repo'}
                </h2>
                {pullsLoading && <RefreshCw className="w-4 h-4 animate-spin text-surface-400" />}
              </div>

              {pullsError && (
                <div className="m-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{pullsError}</span>
                </div>
              )}

              {!pullsLoading && !pullsError && pulls.length === 0 && selectedRepo && (
                <div className="flex flex-col items-center justify-center py-12 text-surface-400">
                  <GitPullRequest className="w-8 h-8 mb-2" />
                  <p className="text-sm">No open pull requests</p>
                </div>
              )}

              <ul className="divide-y divide-surface-100 dark:divide-surface-800 max-h-[480px] overflow-y-auto">
                {pulls.map((pr) => (
                  <li key={pr.number} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-mono text-surface-400">#{pr.number}</span>
                          <span className="text-sm font-medium text-surface-900 dark:text-white leading-snug">{pr.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-surface-500">
                          <span>{pr.author}</span>
                          <span>·</span>
                          <span className="font-mono">{pr.head}</span>
                          <span>→</span>
                          <span className="font-mono">{pr.base}</span>
                        </div>
                        {pr.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {pr.labels.map(l => (
                              <span key={l} className="px-1.5 py-0.5 bg-primary-500/10 text-primary-600 dark:text-primary-400 text-xs rounded-full">{l}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => startReview(pr)}
                          disabled={startingReview === pr.number}
                          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                        >
                          {startingReview === pr.number
                            ? <><RefreshCw className="w-3 h-3 animate-spin" />Starting...</>
                            : <><GitPullRequest className="w-3 h-3" />Review</>}
                        </button>
                        <a href={pr.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 justify-center">
                          <ExternalLink className="w-3 h-3" />Open
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
