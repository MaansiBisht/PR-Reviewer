import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface Annotation {
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  suggestion?: string;
  confidence?: number;
}

interface DiffViewerProps {
  diff: string;
  annotations?: Annotation[];
  fileName?: string;
}

const severityIcons = {
  critical: AlertTriangle,
  high: AlertCircle,
  medium: Info,
  low: CheckCircle,
};

const severityColors = {
  critical: 'border-red-500 bg-red-500/10',
  high: 'border-orange-500 bg-orange-500/10',
  medium: 'border-yellow-500 bg-yellow-500/10',
  low: 'border-blue-500 bg-blue-500/10',
};

export default function DiffViewer({ diff, annotations = [], fileName }: DiffViewerProps) {
  const [expandedAnnotations, setExpandedAnnotations] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const parsedDiff = useMemo(() => parseDiff(diff), [diff]);

  const toggleAnnotation = (line: number) => {
    const newExpanded = new Set(expandedAnnotations);
    if (newExpanded.has(line)) {
      newExpanded.delete(line);
    } else {
      newExpanded.add(line);
    }
    setExpandedAnnotations(newExpanded);
  };

  const getAnnotationsForLine = (lineNum: number) => {
    return annotations.filter(a => a.line === lineNum);
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-sm font-mono text-gray-300">{fileName || 'Diff'}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('unified')}
            className={`px-2 py-1 text-xs rounded ${
              viewMode === 'unified' 
                ? 'bg-primary-600 text-white' 
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Unified
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`px-2 py-1 text-xs rounded ${
              viewMode === 'split' 
                ? 'bg-primary-600 text-white' 
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Split
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <tbody>
            {parsedDiff.map((line, index) => {
              const lineAnnotations = line.newLineNum ? getAnnotationsForLine(line.newLineNum) : [];
              const hasAnnotations = lineAnnotations.length > 0;
              const isExpanded = line.newLineNum ? expandedAnnotations.has(line.newLineNum) : false;

              return (
                <>
                  <tr
                    key={index}
                    className={`
                      ${line.type === 'add' ? 'bg-green-900/20' : ''}
                      ${line.type === 'remove' ? 'bg-red-900/20' : ''}
                      ${line.type === 'header' ? 'bg-blue-900/20' : ''}
                      ${hasAnnotations ? 'cursor-pointer hover:bg-gray-800' : ''}
                    `}
                    onClick={() => hasAnnotations && line.newLineNum && toggleAnnotation(line.newLineNum)}
                  >
                    {viewMode === 'unified' ? (
                      <>
                        <td className="w-12 px-2 py-0.5 text-right text-gray-600 select-none border-r border-gray-800">
                          {line.oldLineNum || ''}
                        </td>
                        <td className="w-12 px-2 py-0.5 text-right text-gray-600 select-none border-r border-gray-800">
                          {line.newLineNum || ''}
                        </td>
                        <td className="w-6 px-1 py-0.5 text-center select-none">
                          {line.type === 'add' && <span className="text-green-400">+</span>}
                          {line.type === 'remove' && <span className="text-red-400">-</span>}
                          {hasAnnotations && (
                            isExpanded ? <ChevronDown className="w-3 h-3 text-yellow-400 inline" /> : <ChevronRight className="w-3 h-3 text-yellow-400 inline" />
                          )}
                        </td>
                        <td className={`px-2 py-0.5 whitespace-pre ${
                          line.type === 'add' ? 'text-green-300' :
                          line.type === 'remove' ? 'text-red-300' :
                          line.type === 'header' ? 'text-blue-300' :
                          'text-gray-300'
                        }`}>
                          {line.content}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="w-12 px-2 py-0.5 text-right text-gray-600 select-none border-r border-gray-800">
                          {line.oldLineNum || ''}
                        </td>
                        <td className={`w-1/2 px-2 py-0.5 whitespace-pre border-r border-gray-700 ${
                          line.type === 'remove' ? 'bg-red-900/30 text-red-300' : 'text-gray-400'
                        }`}>
                          {line.type !== 'add' ? line.content : ''}
                        </td>
                        <td className="w-12 px-2 py-0.5 text-right text-gray-600 select-none border-r border-gray-800">
                          {line.newLineNum || ''}
                        </td>
                        <td className={`w-1/2 px-2 py-0.5 whitespace-pre ${
                          line.type === 'add' ? 'bg-green-900/30 text-green-300' : 'text-gray-400'
                        }`}>
                          {line.type !== 'remove' ? line.content : ''}
                        </td>
                      </>
                    )}
                  </tr>
                  {/* Inline Annotations */}
                  {isExpanded && lineAnnotations.map((annotation, aIndex) => {
                    const Icon = severityIcons[annotation.severity];
                    return (
                      <tr key={`annotation-${index}-${aIndex}`}>
                        <td colSpan={viewMode === 'unified' ? 4 : 5} className="p-0">
                          <div className={`mx-4 my-2 p-3 rounded-lg border-l-4 ${severityColors[annotation.severity]}`}>
                            <div className="flex items-start gap-2">
                              <Icon className={`w-4 h-4 mt-0.5 ${
                                annotation.severity === 'critical' ? 'text-red-400' :
                                annotation.severity === 'high' ? 'text-orange-400' :
                                annotation.severity === 'medium' ? 'text-yellow-400' :
                                'text-blue-400'
                              }`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium uppercase text-gray-400">
                                    {annotation.severity}
                                  </span>
                                  {annotation.confidence !== undefined && (
                                    <span className="text-xs text-gray-500">
                                      {annotation.confidence}% confidence
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-200">{annotation.message}</p>
                                {annotation.suggestion && (
                                  <p className="text-sm text-gray-400 mt-2 pl-3 border-l-2 border-gray-600">
                                    💡 {annotation.suggestion}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const rawLines = diff.split('\n');
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of rawLines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (match) {
        oldLineNum = parseInt(match[1], 10) - 1;
        newLineNum = parseInt(match[2], 10) - 1;
      }
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      newLineNum++;
      lines.push({ type: 'add', content: line.slice(1), newLineNum });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      oldLineNum++;
      lines.push({ type: 'remove', content: line.slice(1), oldLineNum });
    } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      lines.push({ type: 'header', content: line });
    } else {
      oldLineNum++;
      newLineNum++;
      lines.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, oldLineNum, newLineNum });
    }
  }

  return lines;
}
