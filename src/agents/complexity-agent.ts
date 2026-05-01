import { BaseAgent, AgentContext, AgentResult, AgentConfig, AgentLogCallback } from './base-agent';
import { Config, ReviewIssue } from '../types';
import { LLMProvider } from '../services/llm';
import { logger } from '../utils/logger';

const COMPLEXITY_AGENT_CONFIG: AgentConfig = {
  role: 'Code Complexity Analyst',
  goal: 'Analyze code complexity, identify performance bottlenecks, and evaluate algorithmic efficiency',
  backstory: `You are a senior software architect with deep expertise in algorithm design and code optimization. 
You've spent 12+ years optimizing critical systems at scale - from high-frequency trading platforms to 
large-scale distributed systems. You have an intuitive understanding of Big-O complexity and can spot 
inefficient algorithms at a glance. Your reviews have prevented countless production incidents caused 
by O(n²) algorithms sneaking into hot paths. You believe that readable, maintainable code and 
performant code are not mutually exclusive.`,
  capabilities: [
    'Cyclomatic complexity calculation',
    'Cognitive complexity analysis',
    'Big-O time/space complexity evaluation',
    'Nesting depth analysis',
    'Function size and parameter analysis',
    'Performance hotspot identification',
  ],
  focusAreas: [
    'Algorithm efficiency',
    'Code maintainability',
    'Function complexity',
    'Nested control structures',
    'Performance bottlenecks',
    'Refactoring opportunities',
  ],
};

interface ComplexityMetric {
  file: string;
  function: string;
  line: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  nestingDepth: number;
  parameterCount: number;
}

interface BigOAnalysis {
  file: string;
  function: string;
  line: number;
  timeComplexity: string;
  spaceComplexity: string;
  explanation: string;
  optimizationSuggestion?: string;
}

interface ComplexityAnalysis {
  metrics: ComplexityMetric[];
  bigOAnalysis: BigOAnalysis[];
  summary: string;
  averageComplexity: number;
  hotspots: string[];
  reasoningSteps?: string[];
}

export class ComplexityAgent extends BaseAgent {
  private readonly CYCLOMATIC_THRESHOLD = 10;
  private readonly COGNITIVE_THRESHOLD = 15;
  private readonly NESTING_THRESHOLD = 4;
  private readonly LOC_THRESHOLD = 50;
  private readonly PARAM_THRESHOLD = 5;

  constructor(config: Config, llm: LLMProvider, logCallback?: AgentLogCallback) {
    super('ComplexityAgent', config, llm, COMPLEXITY_AGENT_CONFIG, logCallback);
  }

  async analyze(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.log('start', 'Starting complexity analysis', {
      role: this.agentConfig.role,
      filesCount: context.files.length,
    });

    this.log('static_analysis', 'Running static complexity metrics calculation');
    const staticMetrics = this.runStaticAnalysis(context.diff);
    this.log('static_complete', `Analyzed ${staticMetrics.length} functions`, {
      functionsAnalyzed: staticMetrics.length,
    });
    
    this.log('llm_analysis', 'Performing LLM-powered Big-O and deep complexity analysis');
    const llmAnalysis = await this.runLLMAnalysis(context);
    this.log('llm_complete', `LLM identified ${llmAnalysis?.bigOAnalysis?.length || 0} algorithmic concerns`);
    
    this.log('merge', 'Merging static and LLM analysis results');
    const mergedMetrics = this.mergeMetrics(staticMetrics, llmAnalysis?.metrics || []);
    const bigOAnalysis = llmAnalysis?.bigOAnalysis || [];
    
    this.log('generate_issues', 'Generating complexity issues and recommendations');
    const issues = this.generateIssues(mergedMetrics, bigOAnalysis);
    
    const executionTime = Date.now() - startTime;
    this.log('complete', 'Complexity analysis completed', {
      issuesFound: issues.length,
      functionsAnalyzed: mergedMetrics.length,
      hotspots: this.identifyHotspots(mergedMetrics),
      executionTime,
    });

    const result: AgentResult = {
      agentName: this.name,
      issues,
      summary: llmAnalysis?.summary || this.generateSummary(mergedMetrics, bigOAnalysis),
      metadata: {
        metrics: mergedMetrics,
        bigOAnalysis,
        averageComplexity: this.calculateAverageComplexity(mergedMetrics),
        hotspots: this.identifyHotspots(mergedMetrics),
      },
      confidence: this.calculateOverallConfidence(issues),
      executionTime,
      reasoningSteps: llmAnalysis?.reasoningSteps,
    };

    // Generate handoff for next agent
    result.handoff = this.generateHandoff(result);

    return result;
  }

  private runStaticAnalysis(diff: string): ComplexityMetric[] {
    const metrics: ComplexityMetric[] = [];
    const lines = diff.split('\n');
    let currentFile = '';
    let lineNumber = 0;
    let functionBuffer: string[] = [];
    let functionName = '';
    let functionStartLine = 0;
    let braceCount = 0;
    let inFunction = false;

    for (const line of lines) {
      const fileMatch = line.match(/^diff --git a\/(.+?) b\//);
      if (fileMatch) {
        if (inFunction && functionBuffer.length > 0) {
          metrics.push(this.analyzeFunction(currentFile, functionName, functionStartLine, functionBuffer));
        }
        currentFile = fileMatch[1];
        lineNumber = 0;
        functionBuffer = [];
        inFunction = false;
        braceCount = 0;
        continue;
      }

      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (hunkMatch) {
        lineNumber = parseInt(hunkMatch[1], 10) - 1;
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        lineNumber++;
        const addedLine = line.slice(1);

        const funcMatch = addedLine.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*(?:=>|{)|(?:async\s+)?(\w+)\s*\([^)]*\)\s*{)/);
        
        if (funcMatch && !inFunction) {
          functionName = funcMatch[1] || funcMatch[2] || funcMatch[3] || funcMatch[4] || 'anonymous';
          functionStartLine = lineNumber;
          functionBuffer = [addedLine];
          braceCount = (addedLine.match(/{/g) || []).length - (addedLine.match(/}/g) || []).length;
          inFunction = braceCount > 0 || addedLine.includes('=>');
        } else if (inFunction) {
          functionBuffer.push(addedLine);
          braceCount += (addedLine.match(/{/g) || []).length - (addedLine.match(/}/g) || []).length;
          
          if (braceCount <= 0) {
            metrics.push(this.analyzeFunction(currentFile, functionName, functionStartLine, functionBuffer));
            functionBuffer = [];
            inFunction = false;
            braceCount = 0;
          }
        }
      } else if (!line.startsWith('-')) {
        lineNumber++;
      }
    }

    if (inFunction && functionBuffer.length > 0) {
      metrics.push(this.analyzeFunction(currentFile, functionName, functionStartLine, functionBuffer));
    }

    return metrics;
  }

  private analyzeFunction(file: string, name: string, line: number, code: string[]): ComplexityMetric {
    const codeStr = code.join('\n');
    
    return {
      file,
      function: name,
      line,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(codeStr),
      cognitiveComplexity: this.calculateCognitiveComplexity(codeStr),
      linesOfCode: code.filter(l => l.trim() && !l.trim().startsWith('//')).length,
      nestingDepth: this.calculateNestingDepth(codeStr),
      parameterCount: this.countParameters(codeStr),
    };
  }

  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1;
    
    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\s*[^:]+:/g,
      /&&/g,
      /\|\|/g,
      /\?\?/g,
    ];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  private calculateCognitiveComplexity(code: string): number {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (/\b(if|for|while|switch)\b/.test(trimmed)) {
        complexity += 1 + nestingLevel;
        if (trimmed.includes('{')) nestingLevel++;
      }
      
      if (/\belse\s+if\b/.test(trimmed)) {
        complexity += 1;
      } else if (/\belse\b/.test(trimmed)) {
        complexity += 1;
      }
      
      if (/\bcatch\b/.test(trimmed)) {
        complexity += 1 + nestingLevel;
      }
      
      const ternaryCount = (trimmed.match(/\?[^?:]*:/g) || []).length;
      complexity += ternaryCount * (1 + nestingLevel);
      
      const logicalOps = (trimmed.match(/&&|\|\|/g) || []).length;
      complexity += logicalOps;
      
      if (trimmed === '}' && nestingLevel > 0) {
        nestingLevel--;
      }
    }

    return complexity;
  }

  private calculateNestingDepth(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of code) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  private countParameters(code: string): number {
    const funcMatch = code.match(/\(([^)]*)\)/);
    if (!funcMatch || !funcMatch[1].trim()) return 0;
    
    return funcMatch[1].split(',').filter(p => p.trim()).length;
  }

  private async runLLMAnalysis(context: AgentContext): Promise<ComplexityAnalysis | null> {
    const prompt = this.buildComplexityPrompt(context);
    
    try {
      const response = await this.generateWithRetry(prompt);
      return this.parseJsonResponse<ComplexityAnalysis>(response);
    } catch (error) {
      logger.error(`[${this.name}] LLM analysis failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildComplexityPrompt(context: AgentContext): string {
    let basePrompt = `You are an expert code analyst specializing in complexity analysis and algorithm optimization.

**CRITICAL: Output ONLY valid JSON. No explanations, no markdown outside JSON.**

Analyze this code diff for:
1. Function complexity (cyclomatic, cognitive)
2. Big-O time and space complexity
3. Performance bottlenecks
4. Optimization opportunities

JSON format:
{
  "reasoningSteps": [
    "Step 1: I identified the key functions and their control flow...",
    "Step 2: I analyzed loop structures and recursion patterns...",
    "Step 3: I assessed algorithmic complexity based on..."
  ],
  "metrics": [
    {
      "file": "path/to/file",
      "function": "functionName",
      "line": 42,
      "cyclomaticComplexity": 15,
      "cognitiveComplexity": 20,
      "linesOfCode": 45,
      "nestingDepth": 5,
      "parameterCount": 3
    }
  ],
  "bigOAnalysis": [
    {
      "file": "path/to/file",
      "function": "functionName",
      "line": 42,
      "timeComplexity": "O(n²)",
      "spaceComplexity": "O(n)",
      "explanation": "Nested loops over input array",
      "optimizationSuggestion": "Use a hash map to reduce to O(n)",
      "confidence": 85,
      "evidence": ["for loop at line X iterates over array, inner loop at line Y"]
    }
  ],
  "summary": "overall complexity assessment",
  "averageComplexity": 12.5,
  "hotspots": ["file.ts:functionName", "other.ts:anotherFunc"]
}`;

    // Use chain-of-thought prompt builder for context and handoff notes
    basePrompt = this.buildChainOfThoughtPrompt(basePrompt, context);

    return `${basePrompt}

DIFF:
${context.diff}

JSON:`;
  }

  private mergeMetrics(staticMetrics: ComplexityMetric[], llmMetrics: ComplexityMetric[]): ComplexityMetric[] {
    const merged = [...staticMetrics];
    
    for (const llmMetric of llmMetrics) {
      const existing = merged.find(
        m => m.file === llmMetric.file && m.function === llmMetric.function
      );
      
      if (existing) {
        existing.cyclomaticComplexity = Math.max(existing.cyclomaticComplexity, llmMetric.cyclomaticComplexity);
        existing.cognitiveComplexity = Math.max(existing.cognitiveComplexity, llmMetric.cognitiveComplexity);
      } else {
        merged.push(llmMetric);
      }
    }
    
    return merged;
  }

  private generateIssues(metrics: ComplexityMetric[], bigOAnalysis: BigOAnalysis[]): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    for (const metric of metrics) {
      if (metric.cyclomaticComplexity > this.CYCLOMATIC_THRESHOLD) {
        issues.push({
          file: metric.file,
          line: metric.line,
          severity: metric.cyclomaticComplexity > 20 ? 'high' : 'medium',
          category: 'performance',
          message: `Function '${metric.function}' has high cyclomatic complexity (${metric.cyclomaticComplexity}). Consider refactoring.`,
          suggestion: 'Break down into smaller functions, reduce conditional branches, or use polymorphism.',
        });
      }

      if (metric.cognitiveComplexity > this.COGNITIVE_THRESHOLD) {
        issues.push({
          file: metric.file,
          line: metric.line,
          severity: metric.cognitiveComplexity > 25 ? 'high' : 'medium',
          category: 'logic',
          message: `Function '${metric.function}' has high cognitive complexity (${metric.cognitiveComplexity}). Hard to understand and maintain.`,
          suggestion: 'Simplify control flow, extract helper functions, reduce nesting.',
        });
      }

      if (metric.nestingDepth > this.NESTING_THRESHOLD) {
        issues.push({
          file: metric.file,
          line: metric.line,
          severity: 'medium',
          category: 'style',
          message: `Function '${metric.function}' has deep nesting (${metric.nestingDepth} levels).`,
          suggestion: 'Use early returns, extract nested logic to separate functions.',
        });
      }

      if (metric.linesOfCode > this.LOC_THRESHOLD) {
        issues.push({
          file: metric.file,
          line: metric.line,
          severity: 'low',
          category: 'architecture',
          message: `Function '${metric.function}' is too long (${metric.linesOfCode} lines).`,
          suggestion: 'Split into smaller, focused functions following single responsibility principle.',
        });
      }

      if (metric.parameterCount > this.PARAM_THRESHOLD) {
        issues.push({
          file: metric.file,
          line: metric.line,
          severity: 'low',
          category: 'architecture',
          message: `Function '${metric.function}' has too many parameters (${metric.parameterCount}).`,
          suggestion: 'Consider using an options object or builder pattern.',
        });
      }
    }

    for (const analysis of bigOAnalysis) {
      const isInefficient = this.isInefficientComplexity(analysis.timeComplexity);
      
      if (isInefficient) {
        issues.push({
          file: analysis.file,
          line: analysis.line,
          severity: this.getComplexitySeverity(analysis.timeComplexity),
          category: 'performance',
          message: `Function '${analysis.function}' has ${analysis.timeComplexity} time complexity. ${analysis.explanation}`,
          suggestion: analysis.optimizationSuggestion || 'Consider algorithmic optimization.',
        });
      }
    }

    return issues;
  }

  private isInefficientComplexity(complexity: string): boolean {
    const inefficient = ['O(n²)', 'O(n^2)', 'O(n³)', 'O(n^3)', 'O(2^n)', 'O(n!)', 'O(n*m)'];
    return inefficient.some(c => complexity.includes(c));
  }

  private getComplexitySeverity(complexity: string): 'critical' | 'high' | 'medium' | 'low' {
    if (complexity.includes('O(n!)') || complexity.includes('O(2^n)')) return 'critical';
    if (complexity.includes('O(n³)') || complexity.includes('O(n^3)')) return 'high';
    if (complexity.includes('O(n²)') || complexity.includes('O(n^2)')) return 'medium';
    return 'low';
  }

  private calculateAverageComplexity(metrics: ComplexityMetric[]): number {
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, m) => sum + m.cyclomaticComplexity, 0);
    return Math.round((total / metrics.length) * 10) / 10;
  }

  private identifyHotspots(metrics: ComplexityMetric[]): string[] {
    return metrics
      .filter(m => m.cyclomaticComplexity > this.CYCLOMATIC_THRESHOLD || m.cognitiveComplexity > this.COGNITIVE_THRESHOLD)
      .map(m => `${m.file}:${m.function}`)
      .slice(0, 5);
  }

  private generateSummary(metrics: ComplexityMetric[], bigOAnalysis: BigOAnalysis[]): string {
    if (metrics.length === 0 && bigOAnalysis.length === 0) {
      return 'No significant complexity issues detected in the code changes.';
    }

    const highComplexity = metrics.filter(m => m.cyclomaticComplexity > this.CYCLOMATIC_THRESHOLD);
    const inefficientAlgos = bigOAnalysis.filter(a => this.isInefficientComplexity(a.timeComplexity));

    const parts: string[] = [];
    
    if (highComplexity.length > 0) {
      parts.push(`${highComplexity.length} function(s) with high cyclomatic complexity`);
    }
    
    if (inefficientAlgos.length > 0) {
      parts.push(`${inefficientAlgos.length} algorithm(s) with suboptimal time complexity`);
    }

    if (parts.length === 0) {
      return 'Code complexity is within acceptable limits.';
    }

    return `Found ${parts.join(' and ')}. Consider refactoring for better maintainability and performance.`;
  }
}
