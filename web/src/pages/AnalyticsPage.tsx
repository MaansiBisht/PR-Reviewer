import { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  FileWarning,
  Shield,
  Gauge,
  CheckSquare,
  Layers,
  Database,
  Trash2,
  RefreshCw,
  Zap,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { reviewApi, AnalyticsData } from '../api/client';
import { BarChart, LineChart, PieChart } from '../components/Charts';

const severityColors: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};

const agentIcons: Record<string, typeof Shield> = {
  SecurityAgent: Shield,
  ComplexityAgent: Gauge,
  FeatureVerificationAgent: CheckSquare,
  SynthesisAgent: Layers,
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reviewApi.getAnalytics();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Clear the response cache? This will force re-analysis on next review.')) return;
    try {
      await reviewApi.clearCache();
      loadAnalytics();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="card p-8 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 dark:text-white mb-2">Failed to Load</h3>
          <p className="text-sm text-surface-500 mb-4">{error}</p>
          <button onClick={loadAnalytics} className="btn-primary">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.totalReviews === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="card p-12 text-center max-w-md animate-fade-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">No Analytics Yet</h3>
          <p className="text-sm text-surface-500">Complete some reviews to see insights here</p>
        </div>
      </div>
    );
  }

  const severityData = Object.entries(data.bySeverity)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({ label, value, color: severityColors[label] || '#6b7280' }));

  const categoryData = Object.entries(data.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  const reviewTrendsData = data.reviewsOverTime.map(d => ({ date: d.date, value: d.count }));
  const issueTrendsData = data.reviewsOverTime.map(d => ({ date: d.date, value: d.issues }));

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <header className="glass border-b border-surface-200 dark:border-surface-800 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Analytics</h1>
            <p className="text-sm text-surface-500 mt-1">
              Insights across {data.totalReviews} reviews and {data.totalIssues} issues
            </p>
          </div>
          <button onClick={loadAnalytics} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Overview Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Total Reviews"
            value={data.totalReviews.toString()}
            color="blue"
          />
          <StatCard
            icon={<FileWarning className="w-5 h-5" />}
            label="Total Issues"
            value={data.totalIssues.toString()}
            color="orange"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="Cache Hit Rate"
            value={`${data.cache.hitRate.toFixed(0)}%`}
            color="green"
            sub={`${data.cache.hits} hits / ${data.cache.size} cached`}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Avg Issues/Review"
            value={data.totalReviews > 0 ? (data.totalIssues / data.totalReviews).toFixed(1) : '0'}
            color="purple"
          />
        </div>

        {/* Trends Over Time */}
        <div className="card p-6 animate-fade-up">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-primary-500" />
            </div>
            <h2 className="font-semibold text-surface-900 dark:text-white">Reviews Over Time</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-surface-500 mb-3">Reviews per day</p>
              <LineChart data={reviewTrendsData} color="#6366f1" />
            </div>
            <div>
              <p className="text-xs font-medium text-surface-500 mb-3">Issues per day</p>
              <LineChart data={issueTrendsData} color="#f97316" />
            </div>
          </div>
        </div>

        {/* Severity & Category Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="font-semibold text-surface-900 dark:text-white">Severity Distribution</h2>
            </div>
            {severityData.length > 0 ? (
              <PieChart data={severityData} size={160} />
            ) : (
              <p className="text-sm text-surface-500">No issues found</p>
            )}
          </div>

          <div className="card p-6 animate-fade-up" style={{ animationDelay: '150ms' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <Layers className="w-5 h-5 text-violet-500" />
              </div>
              <h2 className="font-semibold text-surface-900 dark:text-white">Issues by Category</h2>
            </div>
            {categoryData.length > 0 ? (
              <BarChart
                data={categoryData.map((d, i) => ({
                  ...d,
                  color: `hsl(${220 + (i * 30)}, 70%, 55%)`,
                }))}
              />
            ) : (
              <p className="text-sm text-surface-500">No categories</p>
            )}
          </div>
        </div>

        {/* Agent Performance */}
        <div className="card p-6 animate-fade-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-accent-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-accent-500" />
            </div>
            <h2 className="font-semibold text-surface-900 dark:text-white">Agent Performance</h2>
          </div>
          {data.agentPerformance.length === 0 ? (
            <p className="text-sm text-surface-500">No agent data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-surface-500 uppercase border-b border-surface-200 dark:border-surface-700">
                    <th className="pb-3 font-medium">Agent</th>
                    <th className="pb-3 font-medium">Issues</th>
                    <th className="pb-3 font-medium">Confidence</th>
                    <th className="pb-3 font-medium">Avg Time</th>
                    <th className="pb-3 font-medium">Confirmed</th>
                    <th className="pb-3 font-medium">False Pos.</th>
                    <th className="pb-3 font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agentPerformance.map((agent) => {
                    const Icon = agentIcons[agent.agent] || Layers;
                    const totalFeedback = agent.confirmedCount + agent.falsePositiveCount;
                    const accuracy = totalFeedback > 0 
                      ? Math.round((agent.confirmedCount / totalFeedback) * 100) 
                      : null;
                    return (
                      <tr key={agent.agent} className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-surface-100 dark:bg-surface-800 rounded-lg">
                              <Icon className="w-4 h-4 text-surface-500" />
                            </div>
                            <span className="font-medium text-surface-900 dark:text-white">
                              {agent.agent.replace('Agent', '')}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 text-surface-700 dark:text-surface-300 font-medium">{agent.totalIssues}</td>
                        <td className="py-4">
                          <span className={`badge font-mono ${
                            agent.avgConfidence >= 80 ? 'badge-success' :
                            agent.avgConfidence >= 50 ? 'badge-warning' :
                            'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400'
                          }`}>
                            {agent.avgConfidence}%
                          </span>
                        </td>
                        <td className="py-4 text-surface-500 font-mono text-xs">
                          {(agent.avgExecutionTime / 1000).toFixed(1)}s
                        </td>
                        <td className="py-4">
                          <span className="inline-flex items-center gap-1.5 text-accent-600 dark:text-accent-400">
                            <ThumbsUp className="w-3.5 h-3.5" />
                            {agent.confirmedCount}
                          </span>
                        </td>
                        <td className="py-4">
                          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
                            <ThumbsDown className="w-3.5 h-3.5" />
                            {agent.falsePositiveCount}
                          </span>
                        </td>
                        <td className="py-4">
                          {accuracy !== null ? (
                            <span className={`font-mono text-sm font-medium ${
                              accuracy >= 80 ? 'text-accent-600 dark:text-accent-400' :
                              accuracy >= 50 ? 'text-amber-600 dark:text-amber-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {accuracy}%
                            </span>
                          ) : (
                            <span className="text-surface-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Files (Hotspots) */}
        <div className="card p-6 animate-fade-up" style={{ animationDelay: '250ms' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <FileWarning className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="font-semibold text-surface-900 dark:text-white">Hotspot Files</h2>
          </div>
          {data.topFiles.length === 0 ? (
            <p className="text-sm text-surface-500">No files analyzed yet</p>
          ) : (
            <BarChart
              data={data.topFiles.map(f => ({
                label: f.file.split('/').slice(-2).join('/'),
                value: f.issueCount,
                color: '#ef4444',
              }))}
            />
          )}
        </div>

        {/* Cache Stats */}
        <div className="card p-6 animate-fade-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Database className="w-5 h-5 text-blue-500" />
              </div>
              <h2 className="font-semibold text-surface-900 dark:text-white">Response Cache</h2>
            </div>
            <button onClick={handleClearCache} className="btn-ghost text-red-600 dark:text-red-400 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
              <p className="text-3xl font-bold text-surface-900 dark:text-white">{data.cache.size}</p>
              <p className="text-xs text-surface-500 mt-1">Cached Responses</p>
            </div>
            <div className="text-center p-4 bg-accent-500/5 rounded-xl">
              <p className="text-3xl font-bold text-accent-600 dark:text-accent-400">{data.cache.hits}</p>
              <p className="text-xs text-surface-500 mt-1">Total Hits</p>
            </div>
            <div className="text-center p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
              <p className="text-3xl font-bold text-surface-900 dark:text-white">{data.cache.hitRate.toFixed(1)}%</p>
              <p className="text-xs text-surface-500 mt-1">Hit Rate</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'blue' | 'orange' | 'green' | 'purple' | 'red';
  sub?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-500',
    orange: 'bg-orange-500/10 text-orange-500',
    green: 'bg-accent-500/10 text-accent-500',
    purple: 'bg-violet-500/10 text-violet-500',
    red: 'bg-red-500/10 text-red-500',
  };

  return (
    <div className="card p-5 card-hover animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${colorClasses[color]}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-surface-900 dark:text-white">{value}</p>
      <p className="text-xs text-surface-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-surface-400 mt-0.5">{sub}</p>}
    </div>
  );
}
