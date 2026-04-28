import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, X } from 'lucide-react';
import { reviewApi } from '../api/client';

interface FeedbackButtonsProps {
  reviewId: string;
  issueId: string;
  initialVerdict?: 'confirmed' | 'false_positive' | 'dismissed';
}

export default function FeedbackButtons({ reviewId, issueId, initialVerdict }: FeedbackButtonsProps) {
  const [verdict, setVerdict] = useState<string | undefined>(initialVerdict);
  const [loading, setLoading] = useState(false);

  const submit = async (newVerdict: 'confirmed' | 'false_positive' | 'dismissed') => {
    if (loading) return;
    try {
      setLoading(true);
      await reviewApi.submitFeedback(reviewId, issueId, newVerdict);
      setVerdict(newVerdict);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-200 dark:border-surface-700" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-surface-500 mr-1">Helpful?</span>
      <button
        onClick={() => submit('confirmed')}
        disabled={loading}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
          verdict === 'confirmed'
            ? 'bg-accent-500/10 text-accent-600 dark:text-accent-400 ring-1 ring-accent-500/30'
            : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-accent-500/10 hover:text-accent-600 dark:hover:text-accent-400'
        }`}
        title="Confirmed - this is a real issue"
      >
        {verdict === 'confirmed' ? <Check className="w-3.5 h-3.5" /> : <ThumbsUp className="w-3.5 h-3.5" />}
        Yes
      </button>
      <button
        onClick={() => submit('false_positive')}
        disabled={loading}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
          verdict === 'false_positive'
            ? 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/30'
            : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
        }`}
        title="False positive - not a real issue"
      >
        {verdict === 'false_positive' ? <X className="w-3.5 h-3.5" /> : <ThumbsDown className="w-3.5 h-3.5" />}
        No
      </button>
    </div>
  );
}
