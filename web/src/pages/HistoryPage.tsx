import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Search,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Download,
  Calendar,
  FileCode
} from 'lucide-react';
import { useReviewStore } from '../store/reviewStore';

type SortField = 'date' | 'issues' | 'risk';
type SortOrder = 'asc' | 'desc';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { reviews } = useReviewStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set());

  const filteredReviews = reviews
    .filter(review => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          review.summary?.toLowerCase().includes(query) ||
          review.issues.some(i => i.file.toLowerCase().includes(query)) ||
          review.metadata?.overallRiskLevel?.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .filter(review => {
      if (filterRisk === 'all') return true;
      return review.metadata?.overallRiskLevel === filterRisk;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.metadata.reviewedAt).getTime() - new Date(b.metadata.reviewedAt).getTime();
          break;
        case 'issues':
          comparison = a.stats.totalIssues - b.stats.totalIssues;
          break;
        case 'risk':
          const riskOrder = { critical: 4, high: 3, medium: 2, low: 1, minimal: 0 };
          const aRisk = riskOrder[a.metadata.overallRiskLevel as keyof typeof riskOrder] || 0;
          const bRisk = riskOrder[b.metadata.overallRiskLevel as keyof typeof riskOrder] || 0;
          comparison = aRisk - bRisk;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedReviews);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedReviews(newSelected);
  };

  const selectAll = () => {
    if (selectedReviews.size === filteredReviews.length) {
      setSelectedReviews(new Set());
    } else {
      setSelectedReviews(new Set(filteredReviews.map(r => r.id)));
    }
  };

  const exportSelected = () => {
    const selectedData = reviews.filter(r => selectedReviews.has(r.id));
    const blob = new Blob([JSON.stringify(selectedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviews-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'critical': return 'text-red-500 bg-red-500/10';
      case 'high': return 'text-orange-500 bg-orange-500/10';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10';
      case 'low': return 'text-green-500 bg-green-500/10';
      case 'minimal': return 'text-blue-500 bg-blue-500/10';
      default: return 'text-surface-500 bg-surface-500/10';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="glass border-b border-surface-200 dark:border-surface-800 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
              Review History
            </h1>
            <p className="text-sm text-surface-500 mt-1">
              {reviews.length} reviews total
            </p>
          </div>
          {selectedReviews.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-surface-500">{selectedReviews.size} selected</span>
              <button onClick={exportSelected} className="btn-primary">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          )}
        </div>

        {/* Search and Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search reviews..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-11"
            />
          </div>

          <select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value)}
            className="input w-auto"
          >
            <option value="all">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="minimal">Minimal</option>
          </select>

          <select
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-') as [SortField, SortOrder];
              setSortField(field);
              setSortOrder(order);
            }}
            className="input w-auto"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="issues-desc">Most Issues</option>
            <option value="issues-asc">Least Issues</option>
            <option value="risk-desc">Highest Risk</option>
            <option value="risk-asc">Lowest Risk</option>
          </select>
        </div>
      </header>

      {/* Review List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredReviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="card p-12 text-center max-w-md animate-fade-up">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                <Clock className="w-8 h-8 text-surface-400" />
              </div>
              <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">No Reviews Found</h3>
              <p className="text-sm text-surface-500">
                {reviews.length === 0 ? 'Start a review from the Dashboard' : 'Try adjusting your filters'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {/* Select All */}
            <div className="flex items-center gap-3 px-2">
              <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${
                selectedReviews.size === filteredReviews.length && filteredReviews.length > 0
                  ? 'border-primary-500 bg-primary-500'
                  : 'border-surface-300 dark:border-surface-600 hover:border-primary-400'
              }`} onClick={selectAll}>
                {selectedReviews.size === filteredReviews.length && filteredReviews.length > 0 && (
                  <CheckCircle className="w-3 h-3 text-white" />
                )}
              </div>
              <span className="text-xs text-surface-500 font-medium">Select all ({filteredReviews.length})</span>
            </div>

            {filteredReviews.map((review, index) => (
              <div
                key={review.id}
                className="card card-hover overflow-hidden animate-fade-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center p-5">
                  <div 
                    className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all mr-4 flex-shrink-0 ${
                      selectedReviews.has(review.id)
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-surface-300 dark:border-surface-600 hover:border-primary-400'
                    }`}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(review.id); }}
                  >
                    {selectedReviews.has(review.id) && (
                      <CheckCircle className="w-3 h-3 text-white" />
                    )}
                  </div>
                  
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => navigate(`/review/${review.id}`)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`badge ${getRiskColor(review.metadata.overallRiskLevel)}`}>
                          {review.metadata.overallRiskLevel || 'Unknown'} risk
                        </span>
                        <span className="text-xs text-surface-500 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(review.metadata.reviewedAt)}
                        </span>
                        <span className="text-xs text-surface-500 flex items-center gap-1.5">
                          <FileCode className="w-3.5 h-3.5" />
                          {review.metadata.filesReviewed} files
                        </span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-surface-400 group-hover:text-primary-500 transition-colors" />
                    </div>

                    <p className="text-sm text-surface-700 dark:text-surface-300 line-clamp-2 mb-4 leading-relaxed">
                      {review.summary}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {review.stats.critical > 0 && (
                          <span className="badge severity-critical">
                            <AlertTriangle className="w-3 h-3" />
                            {review.stats.critical} critical
                          </span>
                        )}
                        {review.stats.high > 0 && (
                          <span className="badge severity-high">
                            <AlertCircle className="w-3 h-3" />
                            {review.stats.high} high
                          </span>
                        )}
                        {review.stats.medium > 0 && (
                          <span className="badge severity-medium">
                            {review.stats.medium} medium
                          </span>
                        )}
                        {review.stats.low > 0 && (
                          <span className="badge severity-low">
                            {review.stats.low} low
                          </span>
                        )}
                        {review.stats.totalIssues === 0 && (
                          <span className="badge badge-success">
                            <CheckCircle className="w-3 h-3" />
                            No issues
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-surface-400 font-mono">
                        {(review.metadata.duration / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
