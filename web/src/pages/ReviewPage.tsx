import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  FileCode,
  Shield,
  Gauge,
  CheckSquare,
  Layers,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Download,
  Code,
  List,
  Filter,
  ChevronDown,
  ChevronUp,
  Search
} from 'lucide-react';
import { reviewApi } from '../api/client';
import { ReviewResult, ReviewIssue } from '../store/reviewStore';
import ExportOptions from '../components/ExportOptions';
import DiffViewer from '../components/DiffViewer';
import FeedbackButtons from '../components/FeedbackButtons';

const severityConfig = {
  critical: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  high: { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  medium: { icon: Info, color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  low: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
};

const agentIcons: Record<string, typeof Shield> = {
  SecurityAgent: Shield,
  ComplexityAgent: Gauge,
  FeatureVerificationAgent: CheckSquare,
  SynthesisAgent: Layers,
};

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'file' | 'severity' | 'category'>('file');
  const [viewMode, setViewMode] = useState<'issues' | 'diff'>('issues');
  const [showExport, setShowExport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (id) {
      loadReview(id);
    }
  }, [id]);

  const loadReview = async (reviewId: string) => {
    try {
      const data = await reviewApi.getReview(reviewId);
      setReview(data);
    } catch (error) {
      console.error('Failed to load review:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleIssueExpand = (index: number) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedIssues(newExpanded);
  };

  const filteredIssues = review?.issues.filter(issue => {
    if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        issue.message.toLowerCase().includes(query) ||
        issue.file.toLowerCase().includes(query) ||
        issue.category.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="card p-12 text-center max-w-md animate-fade-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">Review Not Found</h3>
          <p className="text-sm text-surface-500">The requested review could not be loaded.</p>
        </div>
      </div>
    );
  }

  const groupedIssues = groupIssues(filteredIssues, groupBy);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="glass border-b border-surface-200 dark:border-surface-800 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
              Review Results
            </h1>
            <p className="text-sm text-surface-500 mt-1">
              {review.metadata.filesReviewed} files reviewed in {(review.metadata.duration / 1000).toFixed(1)}s
              {(review.metadata as any).overallConfidence && ` · ${(review.metadata as any).overallConfidence}% confidence`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
              review.metadata.approvalRecommendation === 'approve' 
                ? 'bg-accent-500/10 text-accent-600 dark:text-accent-400' 
                : review.metadata.approvalRecommendation === 'request_changes'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {review.metadata.approvalRecommendation === 'approve' ? (
                <ThumbsUp className="w-5 h-5" />
              ) : review.metadata.approvalRecommendation === 'request_changes' ? (
                <ThumbsDown className="w-5 h-5" />
              ) : (
                <MessageSquare className="w-5 h-5" />
              )}
              <span className="font-medium capitalize">
                {review.metadata.approvalRecommendation?.replace('_', ' ') || 'Unknown'}
              </span>
            </div>
            <button onClick={() => setShowExport(!showExport)} className="btn-secondary">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* View Mode Toggle & Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-xl">
            <button
              onClick={() => setViewMode('issues')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                viewMode === 'issues' 
                  ? 'bg-primary-600 text-white shadow-glow' 
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              }`}
            >
              <List className="w-4 h-4" />
              Issues
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                viewMode === 'diff' 
                  ? 'bg-primary-600 text-white shadow-glow' 
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              }`}
            >
              <Code className="w-4 h-4" />
              Diff View
            </button>
          </div>

          {viewMode === 'issues' && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10 w-56"
                />
              </div>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="input w-auto"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Export Panel */}
      {showExport && (
        <div className="absolute right-6 top-36 z-20 w-80">
          <ExportOptions review={review as any} onClose={() => setShowExport(false)} />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Summary & Stats */}
        <div className="w-80 border-r border-surface-200 dark:border-surface-800 overflow-y-auto bg-surface-50 dark:bg-surface-900/50">
          {/* Summary */}
          <div className="p-5 border-b border-surface-200 dark:border-surface-800">
            <h2 className="font-semibold text-surface-900 dark:text-white mb-3 text-sm uppercase tracking-wider">Summary</h2>
            <p className="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">{review.summary}</p>
          </div>

          {/* Stats */}
          <div className="p-5 border-b border-surface-200 dark:border-surface-800">
            <h2 className="font-semibold text-surface-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Issues</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Critical" value={review.stats.critical} color="red" />
              <StatCard label="High" value={review.stats.high} color="orange" />
              <StatCard label="Medium" value={review.stats.medium} color="yellow" />
              <StatCard label="Low" value={review.stats.low} color="blue" />
            </div>
          </div>

          {/* Agent Results */}
          {review.metadata.agentResults && (
            <div className="p-5 border-b border-surface-200 dark:border-surface-800">
              <h2 className="font-semibold text-surface-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Agent Results</h2>
              <div className="space-y-2">
                {review.metadata.agentResults.map((agent) => {
                  const Icon = agentIcons[agent.agent] || Layers;
                  return (
                    <div key={agent.agent} className="flex items-center justify-between p-3 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-surface-100 dark:bg-surface-700 rounded-lg">
                          <Icon className="w-4 h-4 text-surface-500" />
                        </div>
                        <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{agent.agent.replace('Agent', '')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-surface-500">{agent.issueCount}</span>
                        <span className="badge badge-success font-mono">{(agent.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group By */}
          <div className="p-5">
            <h2 className="font-semibold text-surface-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Group By</h2>
            <div className="flex gap-2">
              {(['file', 'severity', 'category'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setGroupBy(option)}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 ${
                    groupBy === option
                      ? 'bg-primary-600 text-white shadow-glow'
                      : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700'
                  }`}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Issues or Diff */}
        <div className="flex-1 overflow-y-auto p-6">
          {viewMode === 'issues' ? (
            <>
              {/* Results count */}
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm text-surface-500">
                  Showing {filteredIssues.length} of {review.issues.length} issues
                </span>
              </div>

              {filteredIssues.length === 0 ? (
                <div className="card p-12 text-center animate-fade-up">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                    <Filter className="w-8 h-8 text-surface-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">No Issues Found</h3>
                  <p className="text-sm text-surface-500">Try adjusting your filters</p>
                </div>
              ) : (
                Object.entries(groupedIssues).map(([group, issues]) => (
                  <div key={group} className="mb-8">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-700 dark:text-surface-300 mb-4">
                      {groupBy === 'file' && <FileCode className="w-4 h-4 text-surface-500" />}
                      <span>{group}</span>
                      <span className="badge bg-surface-100 dark:bg-surface-800 text-surface-500">{issues.length}</span>
                    </h3>
                    <div className="space-y-3">
                      {issues.map((issue, index) => {
                        const globalIndex = review.issues.indexOf(issue);
                        const isExpanded = expandedIssues.has(globalIndex);
                        return (
                          <IssueCardEnhanced 
                            key={`${group}-${index}`} 
                            issue={issue} 
                            issueId={`${globalIndex}`}
                            reviewId={id || ''}
                            showFile={groupBy !== 'file'}
                            isExpanded={isExpanded}
                            onToggle={() => toggleIssueExpand(globalIndex)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="card p-4 bg-surface-50 dark:bg-surface-800/50">
                <p className="text-sm text-surface-500">
                  Diff view with inline annotations. Click on highlighted lines to see issue details.
                </p>
              </div>
              <DiffViewer 
                diff={(review as any).diff || '// No diff available'} 
                annotations={review.issues.map(issue => ({
                  line: issue.line || 0,
                  severity: issue.severity,
                  message: issue.message,
                  suggestion: issue.suggestion,
                  confidence: (issue as any).confidence,
                }))}
                fileName="Review Diff"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    red: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
    orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
    yellow: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  };

  return (
    <div className={`p-3 rounded-xl text-center ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

function IssueCardEnhanced({ 
  issue, 
  issueId,
  reviewId,
  showFile, 
  isExpanded, 
  onToggle 
}: { 
  issue: ReviewIssue; 
  issueId: string;
  reviewId: string;
  showFile: boolean; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = severityConfig[issue.severity];
  const Icon = config.icon;
  const extendedIssue = issue as any;

  const severityClasses: Record<string, string> = {
    critical: 'border-l-red-500 bg-red-500/5',
    high: 'border-l-orange-500 bg-orange-500/5',
    medium: 'border-l-amber-500 bg-amber-500/5',
    low: 'border-l-blue-500 bg-blue-500/5',
  };

  return (
    <div className={`card overflow-hidden border-l-4 ${severityClasses[issue.severity] || ''}`}>
      <div 
        className="p-4 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`badge ${
                issue.severity === 'critical' ? 'severity-critical' :
                issue.severity === 'high' ? 'severity-high' :
                issue.severity === 'medium' ? 'severity-medium' : 'severity-low'
              }`}>
                {issue.severity}
              </span>
              <span className="badge bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400">
                {issue.category}
              </span>
              {extendedIssue.confidence !== undefined && (
                <span className={`badge font-mono ${
                  extendedIssue.confidence >= 80 ? 'badge-success' :
                  extendedIssue.confidence >= 50 ? 'badge-warning' :
                  'bg-surface-100 dark:bg-surface-800 text-surface-500'
                }`}>
                  {extendedIssue.confidence}%
                </span>
              )}
              {extendedIssue.consensus && extendedIssue.consensusCount > 1 && (
                <span className="badge bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {extendedIssue.consensusCount} agents
                </span>
              )}
              {showFile && (
                <span className="text-xs text-surface-500 font-mono">
                  {issue.file}:{issue.line || '?'}
                </span>
              )}
              {!showFile && issue.line && (
                <span className="text-xs text-surface-500">Line {issue.line}</span>
              )}
              <span className="ml-auto">
                {isExpanded ? <ChevronUp className="w-4 h-4 text-surface-400" /> : <ChevronDown className="w-4 h-4 text-surface-400" />}
              </span>
            </div>
            <p className="text-sm text-surface-800 dark:text-surface-200 leading-relaxed">{issue.message}</p>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-3 border-t border-surface-200 dark:border-surface-700 space-y-4 bg-surface-50 dark:bg-surface-800/30">
          {issue.suggestion && (
            <div className="pl-11">
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Suggestion</h4>
              <p className="text-sm text-surface-600 dark:text-surface-400 pl-3 border-l-2 border-primary-500">
                {issue.suggestion}
              </p>
            </div>
          )}
          
          {extendedIssue.reasoning && (
            <div className="pl-11">
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Why this is an issue</h4>
              <p className="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                {extendedIssue.reasoning}
              </p>
            </div>
          )}

          {extendedIssue.evidence && extendedIssue.evidence.length > 0 && (
            <div className="pl-11">
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Evidence</h4>
              <ul className="space-y-1.5">
                {extendedIssue.evidence.map((e: string, i: number) => (
                  <li key={i} className="font-mono text-xs bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 px-3 py-1.5 rounded-lg">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extendedIssue.sources && extendedIssue.sources.length > 0 && (
            <div className="pl-11">
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Detected by</h4>
              <div className="flex flex-wrap gap-1.5">
                {extendedIssue.sources.map((source: string, i: number) => (
                  <span key={i} className="badge bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400">
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showFile && (
            <div className="pl-11">
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Location</h4>
              <p className="text-sm font-mono text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 px-3 py-1.5 rounded-lg inline-block">
                {issue.file}{issue.line ? `:${issue.line}` : ''}
              </p>
            </div>
          )}

          <div className="pl-11">
            <FeedbackButtons reviewId={reviewId} issueId={issueId} />
          </div>
        </div>
      )}
    </div>
  );
}

function groupIssues(issues: ReviewIssue[], by: 'file' | 'severity' | 'category'): Record<string, ReviewIssue[]> {
  const grouped: Record<string, ReviewIssue[]> = {};
  
  for (const issue of issues) {
    const key = issue[by];
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(issue);
  }

  if (by === 'severity') {
    const order = ['critical', 'high', 'medium', 'low'];
    const sorted: Record<string, ReviewIssue[]> = {};
    for (const sev of order) {
      if (grouped[sev]) {
        sorted[sev] = grouped[sev];
      }
    }
    return sorted;
  }

  return grouped;
}
