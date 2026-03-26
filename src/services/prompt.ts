import { DiffChunk, ReviewFocus, ReviewCategory } from '../types';
import { logger } from '../utils/logger';

export interface PromptOptions {
  focus?: ReviewFocus;
  customPrompt?: string;
}

export function buildReviewPrompt(diffChunk: DiffChunk, options: PromptOptions = {}): string {
  const { focus, customPrompt } = options;
  
  const chunkInfo = diffChunk.total > 1 
    ? `\nReviewing chunk ${diffChunk.index + 1} of ${diffChunk.total}. Files: ${diffChunk.files.join(', ')}`
    : '';

  const categories = focus?.categories || ['bug', 'security', 'performance', 'logic', 'error-handling'];
  const categoryList = categories.join(', ');
  
  const contextInfo = focus?.context ? `\nContext: ${focus.context}` : '';
  const customRulesInfo = focus?.customRules?.length 
    ? `\nCustom rules to check:\n${focus.customRules.map(r => `- ${r}`).join('\n')}`
    : '';
  const customPromptInfo = customPrompt ? `\nAdditional instructions: ${customPrompt}` : '';

  const severityGuidance = `
Severity guidelines:
- critical: Security vulnerabilities, data loss, crashes, breaking changes
- high: Bugs that will cause issues in production, major performance problems
- medium: Code quality issues, minor bugs, maintainability concerns
- low: Style issues, minor improvements, suggestions`;

  return `You are an expert code reviewer. Analyze this git diff and output ONLY a JSON object.

**CRITICAL: Your response must be ONLY valid JSON. No explanations, no markdown, no text before or after.**

Focus on these categories: ${categoryList}
${severityGuidance}
${contextInfo}
${customRulesInfo}
${customPromptInfo}

JSON format:
{
  "summary": "Brief assessment of the changes",
  "issues": [
    {
      "file": "path/to/file",
      "line": 42,
      "severity": "high|medium|low|critical",
      "category": "bug|security|performance|style|logic|error-handling|duplication|naming|documentation|testing|architecture|dependency",
      "message": "Clear description of the issue",
      "suggestion": "How to fix it"
    }
  ]
}

If no issues: {"summary": "Code looks good. No significant issues found.", "issues": []}
${chunkInfo}

DIFF:
${diffChunk.content}

JSON:`;
}

export function buildSummaryPrompt(partialReviews: string[]): string {
  return `Consolidate these partial code reviews into one JSON object. Remove duplicates and merge related issues.

**CRITICAL: Output ONLY the JSON object. No explanations, no markdown, no extra text.**

JSON format:
{
  "summary": "Overall assessment",
  "issues": [{"file": "name", "line": 42, "severity": "high", "category": "bug", "message": "desc", "suggestion": "fix"}]
}

PARTIAL REVIEWS:
${partialReviews.map((r, i) => `Chunk ${i + 1}: ${r}`).join('\n')}

JSON output:`;
}

export function parseReviewResponse(response: string): {
  summary: string;
  issues: Array<{
    file: string;
    line?: number;
    endLine?: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: ReviewCategory;
    message: string;
    suggestion?: string;
    codeSnippet?: string;
  }>;
} {
  let jsonStr = response.trim();
  
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  
  const startIndex = jsonStr.indexOf('{');
  const endIndex = jsonStr.lastIndexOf('}');
  
  if (startIndex !== -1 && endIndex !== -1) {
    jsonStr = jsonStr.slice(startIndex, endIndex + 1);
  }
  
  jsonStr = jsonStr.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  
  const braceStack: string[] = [];
  let validEndIndex = -1;
  for (let i = 0; i < jsonStr.length; i++) {
    if (jsonStr[i] === '{' || jsonStr[i] === '[') {
      braceStack.push(jsonStr[i]);
    } else if (jsonStr[i] === '}' || jsonStr[i] === ']') {
      braceStack.pop();
      if (braceStack.length === 0 && jsonStr[i] === '}') {
        validEndIndex = i;
        break;
      }
    }
  }
  
  if (validEndIndex > startIndex) {
    jsonStr = jsonStr.slice(startIndex, validEndIndex + 1);
  }
  
  logger.debug('Raw LLM response (first 500 chars):', response.slice(0, 500));
  logger.debug('Extracted JSON string (first 500 chars):', jsonStr.slice(0, 500));
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    return {
      summary: parsed.summary || 'Review completed.',
      issues: (parsed.issues || []).map((issue: Record<string, unknown>) => ({
        file: String(issue.file || 'unknown'),
        line: typeof issue.line === 'number' ? issue.line : undefined,
        endLine: typeof issue.endLine === 'number' ? issue.endLine : undefined,
        severity: validateSeverity(issue.severity),
        category: validateCategory(issue.category),
        message: String(issue.message || 'No description'),
        suggestion: issue.suggestion ? String(issue.suggestion) : undefined,
        codeSnippet: issue.codeSnippet ? String(issue.codeSnippet) : undefined,
      })),
    };
  } catch (error) {
    logger.debug('JSON parse error:', (error as Error).message);
    logger.debug('Failed JSON string:', jsonStr.slice(0, 1000));
    return {
      summary: 'Failed to parse review response.',
      issues: [{
        file: 'unknown',
        severity: 'low',
        category: 'general',
        message: `Could not parse LLM response. Try running again or use a different model.`,
      }],
    };
  }
}

function validateSeverity(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }
  return 'medium';
}

const VALID_CATEGORIES: ReviewCategory[] = [
  'bug', 'security', 'performance', 'style', 'logic', 'error-handling',
  'duplication', 'naming', 'documentation', 'testing', 'architecture', 'dependency', 'general'
];

function validateCategory(value: unknown): ReviewCategory {
  const strValue = String(value || 'general').toLowerCase().replace(/\s+/g, '-');
  if (VALID_CATEGORIES.includes(strValue as ReviewCategory)) {
    return strValue as ReviewCategory;
  }
  if (strValue.includes('bug')) return 'bug';
  if (strValue.includes('security') || strValue.includes('vuln')) return 'security';
  if (strValue.includes('perf')) return 'performance';
  if (strValue.includes('style') || strValue.includes('format')) return 'style';
  if (strValue.includes('logic')) return 'logic';
  if (strValue.includes('error') || strValue.includes('exception')) return 'error-handling';
  if (strValue.includes('dup')) return 'duplication';
  if (strValue.includes('name') || strValue.includes('naming')) return 'naming';
  if (strValue.includes('doc') || strValue.includes('comment')) return 'documentation';
  if (strValue.includes('test')) return 'testing';
  if (strValue.includes('arch') || strValue.includes('design')) return 'architecture';
  if (strValue.includes('dep')) return 'dependency';
  return 'general';
}
