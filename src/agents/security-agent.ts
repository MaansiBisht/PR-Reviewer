import { BaseAgent, AgentContext, AgentResult, AgentConfig, AgentLogCallback } from './base-agent';
import { Config, ReviewIssue } from '../types';
import { LLMProvider } from '../services/llm';
import { logger } from '../utils/logger';

const SECURITY_AGENT_CONFIG: AgentConfig = {
  role: 'Security Auditor',
  goal: 'Identify security vulnerabilities, potential exploits, and unsafe coding practices in code changes',
  backstory: `You are an elite security researcher with 15+ years of experience in application security. 
You've worked on bug bounty programs for major tech companies and have discovered critical CVEs. 
Your expertise spans OWASP Top 10, secure coding practices, cryptographic implementations, 
and identifying subtle security flaws that automated tools miss. You approach every code review 
with the mindset of an attacker, looking for ways the code could be exploited.`,
  capabilities: [
    'Static pattern analysis for common vulnerabilities',
    'LLM-powered deep security analysis',
    'CWE classification and mapping',
    'Risk scoring and prioritization',
    'Remediation recommendations',
  ],
  focusAreas: [
    'Injection vulnerabilities (SQL, XSS, Command)',
    'Authentication and authorization flaws',
    'Sensitive data exposure',
    'Security misconfigurations',
    'Cryptographic weaknesses',
    'Input validation issues',
    'Race conditions and concurrency issues',
    'State management and synchronization flaws',
  ],
};

interface SecurityFinding {
  vulnerability: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  description: string;
  cwe?: string;
  remediation: string;
  confidence: number;
  evidence?: string[];
  reasoning?: string;
}

interface SecurityAnalysis {
  findings: SecurityFinding[];
  summary: string;
  riskScore: number;
  recommendations: string[];
  reasoningSteps?: string[];
}

export class SecurityAgent extends BaseAgent {
  private securityPatterns = [
    { pattern: /password\s*=\s*['"][^'"]+['"]/gi, type: 'hardcoded-password', severity: 'critical' as const },
    { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/gi, type: 'hardcoded-api-key', severity: 'critical' as const },
    { pattern: /secret\s*=\s*['"][^'"]+['"]/gi, type: 'hardcoded-secret', severity: 'critical' as const },
    { pattern: /eval\s*\(/gi, type: 'eval-usage', severity: 'high' as const },
    { pattern: /innerHTML\s*=/gi, type: 'xss-risk', severity: 'high' as const },
    { pattern: /dangerouslySetInnerHTML/gi, type: 'xss-risk', severity: 'high' as const },
    { pattern: /exec\s*\(/gi, type: 'command-injection', severity: 'critical' as const },
    { pattern: /child_process/gi, type: 'command-execution', severity: 'high' as const },
    { pattern: /SELECT.*FROM.*WHERE.*\+/gi, type: 'sql-injection', severity: 'critical' as const },
    { pattern: /\.query\s*\(\s*['"`].*\$\{/gi, type: 'sql-injection', severity: 'critical' as const },
    { pattern: /new\s+Function\s*\(/gi, type: 'code-injection', severity: 'high' as const },
    { pattern: /document\.write/gi, type: 'dom-manipulation', severity: 'medium' as const },
    { pattern: /localStorage\.(setItem|getItem)/gi, type: 'sensitive-storage', severity: 'medium' as const },
    { pattern: /http:\/\//gi, type: 'insecure-protocol', severity: 'medium' as const },
    { pattern: /disable.*ssl|verify.*false|rejectUnauthorized.*false/gi, type: 'ssl-disabled', severity: 'critical' as const },
    { pattern: /cors.*\*|Access-Control-Allow-Origin.*\*/gi, type: 'cors-wildcard', severity: 'medium' as const },
    { pattern: /md5|sha1(?!-)/gi, type: 'weak-crypto', severity: 'medium' as const },
    { pattern: /Math\.random\(\)/gi, type: 'weak-random', severity: 'low' as const },
  ];

  // Semantic patterns for LLM analysis - these describe anti-patterns conceptually
  // rather than matching specific code patterns
  private semanticSecurityPatterns = [
    {
      category: 'race-condition',
      name: 'Concurrent State Mutation',
      description: 'Code that modifies shared state (tokens, sessions, cache) without proper synchronization (locks, flags, queues)',
      severity: 'high' as const,
      cwe: 'CWE-362',
    },
    {
      category: 'race-condition',
      name: 'Missing Request Queue',
      description: 'HTTP interceptors or middleware that refresh credentials without queuing concurrent requests',
      severity: 'high' as const,
      cwe: 'CWE-362',
    },
    {
      category: 'toctou',
      name: 'Time-of-Check to Time-of-Use',
      description: 'Checking a condition (e.g., token validity, permissions) and then acting on it without atomicity',
      severity: 'high' as const,
      cwe: 'CWE-367',
    },
    {
      category: 'auth',
      name: 'Improper Session Handling',
      description: 'Session or token refresh logic that can fail silently, lose requests, or cause infinite loops',
      severity: 'high' as const,
      cwe: 'CWE-613',
    },
    {
      category: 'async',
      name: 'Unhandled Concurrent Operations',
      description: 'Async operations that can run simultaneously without coordination (e.g., multiple API calls triggering same refresh)',
      severity: 'medium' as const,
      cwe: 'CWE-362',
    },
  ];

  constructor(config: Config, llm: LLMProvider, logCallback?: AgentLogCallback) {
    super('SecurityAgent', config, llm, SECURITY_AGENT_CONFIG, logCallback);
  }

  async analyze(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.log('start', 'Starting security analysis', {
      role: this.agentConfig.role,
      filesCount: context.files.length,
    });

    this.log('pattern_scan', 'Running static pattern analysis for known vulnerability signatures');
    const patternFindings = this.runPatternAnalysis(context.diff);
    this.log('pattern_complete', `Found ${patternFindings.length} potential issues via pattern matching`, {
      findings: patternFindings.length,
    });
    
    this.log('llm_analysis', 'Performing deep LLM-powered security analysis');
    const llmAnalysis = await this.runLLMAnalysis(context);
    this.log('llm_complete', `LLM analysis found ${llmAnalysis?.findings?.length || 0} additional issues`);
    
    this.log('merge', 'Merging and deduplicating findings');
    const allFindings = this.mergeFindings(patternFindings, llmAnalysis?.findings || []);
    
    const issues = this.convertToIssues(allFindings);
    
    const riskScore = this.calculateRiskScore(allFindings);
    
    const executionTime = Date.now() - startTime;
    this.log('complete', `Security analysis completed`, {
      issuesFound: issues.length,
      riskScore,
      executionTime,
    });

    const result: AgentResult = {
      agentName: this.name,
      issues,
      summary: llmAnalysis?.summary || this.generateSummary(allFindings),
      metadata: {
        riskScore,
        findingsCount: allFindings.length,
        recommendations: llmAnalysis?.recommendations || [],
        patternMatchCount: patternFindings.length,
      },
      confidence: this.calculateOverallConfidence(issues),
      executionTime,
      reasoningSteps: llmAnalysis?.reasoningSteps,
    };

    // Generate handoff for next agent
    result.handoff = this.generateHandoff(result);

    return result;
  }

  private runPatternAnalysis(diff: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const lines = diff.split('\n');
    let currentFile = '';
    let lineNumber = 0;

    for (const line of lines) {
      const fileMatch = line.match(/^diff --git a\/(.+?) b\//);
      if (fileMatch) {
        currentFile = fileMatch[1];
        lineNumber = 0;
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

        for (const { pattern, type, severity } of this.securityPatterns) {
          if (pattern.test(addedLine)) {
            findings.push({
              vulnerability: type,
              severity,
              file: currentFile,
              line: lineNumber,
              description: this.getPatternDescription(type),
              cwe: this.getCWE(type),
              remediation: this.getRemediation(type),
              confidence: 0.9,
            });
            pattern.lastIndex = 0;
          }
        }
      } else if (!line.startsWith('-')) {
        lineNumber++;
      }
    }

    return findings;
  }

  private async runLLMAnalysis(context: AgentContext): Promise<SecurityAnalysis | null> {
    const prompt = this.buildSecurityPrompt(context);
    
    try {
      const response = await this.generateWithRetry(prompt);
      return this.parseJsonResponse<SecurityAnalysis>(response);
    } catch (error) {
      logger.error(`[${this.name}] LLM analysis failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildSecurityPrompt(context: AgentContext): string {
    // Build semantic patterns section for the prompt
    const semanticPatternsText = this.semanticSecurityPatterns
      .map(p => `  - **${p.name}** (${p.cwe}): ${p.description}`)
      .join('\n');

    let basePrompt = `You are an expert security auditor. Analyze this code diff for security vulnerabilities.

**CRITICAL: Output ONLY valid JSON. No explanations, no markdown outside JSON.**

## Standard Vulnerability Categories:
- Injection vulnerabilities (SQL, XSS, Command, LDAP, etc.)
- Authentication/Authorization flaws
- Sensitive data exposure
- Security misconfigurations
- Cryptographic weaknesses
- Input validation issues
- Access control problems

## Concurrency & State Management Issues (IMPORTANT):
${semanticPatternsText}

## General Anti-Patterns to Look For:
- Shared mutable state accessed without synchronization
- Async operations that can race (e.g., multiple refresh calls, concurrent writes)
- Check-then-act patterns without atomicity
- Error handling that can leave system in inconsistent state
- Retry logic without proper backoff or deduplication
- Event handlers or interceptors that don't handle concurrent invocations

JSON format:
{
  "reasoningSteps": [
    "Step 1: I examined the code changes and identified...",
    "Step 2: I checked for common vulnerability patterns...",
    "Step 3: I assessed the risk level based on..."
  ],
  "findings": [
    {
      "vulnerability": "type of vulnerability",
      "severity": "critical|high|medium|low",
      "file": "path/to/file",
      "line": 42,
      "description": "detailed description",
      "cwe": "CWE-XXX",
      "remediation": "how to fix",
      "confidence": 85,
      "evidence": ["specific code snippet or pattern that triggered this finding"],
      "reasoning": "why this is a security issue and how it could be exploited"
    }
  ],
  "summary": "overall security assessment",
  "riskScore": 7.5,
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

    // Use chain-of-thought prompt builder for context and handoff notes
    basePrompt = this.buildChainOfThoughtPrompt(basePrompt, context);

    return `${basePrompt}

DIFF:
${context.diff}

JSON:`;
  }

  private mergeFindings(patternFindings: SecurityFinding[], llmFindings: SecurityFinding[]): SecurityFinding[] {
    const merged = [...patternFindings];
    
    for (const llmFinding of llmFindings) {
      const isDuplicate = patternFindings.some(
        pf => pf.file === llmFinding.file && 
              pf.line === llmFinding.line && 
              pf.vulnerability === llmFinding.vulnerability
      );
      
      if (!isDuplicate) {
        merged.push(llmFinding);
      }
    }
    
    return merged;
  }

  private convertToIssues(findings: SecurityFinding[]): ReviewIssue[] {
    return findings.map(finding => ({
      file: finding.file,
      line: finding.line,
      severity: finding.severity,
      category: 'security' as const,
      message: `[${finding.vulnerability.toUpperCase()}] ${finding.description}${finding.cwe ? ` (${finding.cwe})` : ''}`,
      suggestion: finding.remediation,
      confidence: Math.round(finding.confidence * (finding.confidence > 1 ? 1 : 100)),
      evidence: finding.evidence || [],
      reasoning: finding.reasoning || `Detected ${finding.vulnerability} pattern in code`,
    }));
  }

  private calculateRiskScore(findings: SecurityFinding[]): number {
    if (findings.length === 0) return 0;
    
    const weights = { critical: 10, high: 7, medium: 4, low: 1 };
    const totalWeight = findings.reduce((sum, f) => sum + weights[f.severity], 0);
    
    return Math.min(10, totalWeight / findings.length);
  }

  private calculateConfidence(findings: SecurityFinding[]): number {
    if (findings.length === 0) return 1;
    return findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length;
  }

  private generateSummary(findings: SecurityFinding[]): string {
    if (findings.length === 0) {
      return 'No security vulnerabilities detected in the code changes.';
    }
    
    const critical = findings.filter(f => f.severity === 'critical').length;
    const high = findings.filter(f => f.severity === 'high').length;
    
    if (critical > 0) {
      return `CRITICAL: Found ${critical} critical and ${high} high severity security vulnerabilities that require immediate attention.`;
    }
    
    if (high > 0) {
      return `Found ${high} high severity security issues that should be addressed before merging.`;
    }
    
    return `Found ${findings.length} security issues of medium/low severity.`;
  }

  private getPatternDescription(type: string): string {
    const descriptions: Record<string, string> = {
      'hardcoded-password': 'Hardcoded password detected in source code',
      'hardcoded-api-key': 'API key exposed in source code',
      'hardcoded-secret': 'Secret value hardcoded in source code',
      'eval-usage': 'Use of eval() can lead to code injection',
      'xss-risk': 'Potential XSS vulnerability through direct HTML manipulation',
      'command-injection': 'Potential command injection vulnerability',
      'command-execution': 'Direct command execution may be dangerous',
      'sql-injection': 'Potential SQL injection through string concatenation',
      'code-injection': 'Dynamic code generation can lead to injection',
      'dom-manipulation': 'Direct DOM manipulation may introduce XSS',
      'sensitive-storage': 'Sensitive data stored in localStorage',
      'insecure-protocol': 'Insecure HTTP protocol used',
      'ssl-disabled': 'SSL/TLS verification disabled',
      'cors-wildcard': 'CORS wildcard allows any origin',
      'weak-crypto': 'Weak cryptographic algorithm used',
      'weak-random': 'Math.random() is not cryptographically secure',
      // Generic concurrency/state patterns (descriptions for LLM-detected issues)
      'race-condition': 'Race condition detected: concurrent operations may interfere with each other',
      'toctou': 'Time-of-check to time-of-use vulnerability: state may change between validation and use',
      'concurrent-state-mutation': 'Shared state modified without proper synchronization',
      'missing-request-queue': 'Concurrent requests not queued during state transitions',
      'improper-session-handling': 'Session/credential handling may fail under concurrent access',
    };
    return descriptions[type] || 'Security issue detected';
  }

  private getCWE(type: string): string | undefined {
    const cwes: Record<string, string> = {
      'hardcoded-password': 'CWE-798',
      'hardcoded-api-key': 'CWE-798',
      'hardcoded-secret': 'CWE-798',
      'eval-usage': 'CWE-95',
      'xss-risk': 'CWE-79',
      'command-injection': 'CWE-78',
      'sql-injection': 'CWE-89',
      'code-injection': 'CWE-94',
      'insecure-protocol': 'CWE-319',
      'ssl-disabled': 'CWE-295',
      'weak-crypto': 'CWE-327',
      'weak-random': 'CWE-330',
      // Generic concurrency/state patterns
      'race-condition': 'CWE-362',
      'toctou': 'CWE-367',
      'concurrent-state-mutation': 'CWE-362',
      'missing-request-queue': 'CWE-362',
      'improper-session-handling': 'CWE-613',
    };
    return cwes[type];
  }

  private getRemediation(type: string): string {
    const remediations: Record<string, string> = {
      'hardcoded-password': 'Use environment variables or a secrets manager',
      'hardcoded-api-key': 'Store API keys in environment variables or secure vault',
      'hardcoded-secret': 'Move secrets to environment variables or secrets manager',
      'eval-usage': 'Avoid eval(); use safer alternatives like JSON.parse()',
      'xss-risk': 'Use textContent instead of innerHTML, or sanitize input',
      'command-injection': 'Use parameterized commands or escape user input',
      'command-execution': 'Validate and sanitize all inputs to command execution',
      'sql-injection': 'Use parameterized queries or prepared statements',
      'code-injection': 'Avoid dynamic code generation; use static alternatives',
      'dom-manipulation': 'Use framework methods that auto-escape content',
      'sensitive-storage': 'Use secure storage mechanisms for sensitive data',
      'insecure-protocol': 'Use HTTPS instead of HTTP',
      'ssl-disabled': 'Enable SSL/TLS certificate verification',
      'cors-wildcard': 'Specify allowed origins explicitly',
      'weak-crypto': 'Use SHA-256 or stronger algorithms',
      'weak-random': 'Use crypto.randomBytes() for security-sensitive operations',
      // Generic concurrency/state patterns (matched by LLM semantic analysis)
      'race-condition': 'Use synchronization primitives (mutex, semaphore, flags) to prevent concurrent access; implement request queuing for shared resources',
      'toctou': 'Make check-and-act operations atomic; use transactions or locks to prevent state changes between check and use',
      'concurrent-state-mutation': 'Implement proper locking mechanism; use a flag to track in-progress operations and queue subsequent requests',
      'missing-request-queue': 'Queue pending requests during state transitions; retry queued requests after the operation completes',
      'improper-session-handling': 'Implement proper error handling and retry logic; ensure requests are not lost during credential refresh',
    };
    return remediations[type] || 'Review and fix the security issue';
  }
}
