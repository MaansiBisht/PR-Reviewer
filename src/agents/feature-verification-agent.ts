import { BaseAgent, AgentContext, AgentResult, AgentConfig, AgentLogCallback } from './base-agent';
import { Config, ReviewIssue } from '../types';
import { LLMProvider } from '../services/llm';
import { logger } from '../utils/logger';

const FEATURE_VERIFICATION_AGENT_CONFIG: AgentConfig = {
  role: 'Feature Verification Specialist',
  goal: 'Verify that code changes correctly implement the intended features and identify gaps or risks',
  backstory: `You are a meticulous QA architect with 10+ years of experience in software verification. 
You've led quality assurance for mission-critical systems in healthcare, finance, and aerospace. 
Your superpower is understanding intent from vague requirements and verifying implementations 
against that intent. You think in terms of edge cases, failure modes, and user scenarios. 
You've caught countless bugs that would have cost millions in production. You believe that 
understanding "why" code is written is just as important as understanding "what" it does.`,
  capabilities: [
    'Intent extraction from PR descriptions and commits',
    'Behavior verification against requirements',
    'Related code impact analysis',
    'Risk assessment and edge case identification',
    'Breaking change detection',
    'Implementation completeness verification',
  ],
  focusAreas: [
    'Feature completeness',
    'Requirement alignment',
    'Edge case handling',
    'Breaking changes',
    'Integration risks',
    'User impact assessment',
  ],
};

interface IntentExtraction {
  primaryIntent: string;
  secondaryIntents: string[];
  expectedBehaviors: string[];
  affectedComponents: string[];
  breakingChanges: string[];
}

interface VerificationResult {
  behavior: string;
  status: 'verified' | 'partial' | 'missing' | 'incorrect';
  evidence: string;
  file?: string;
  line?: number;
}

interface RiskAssessment {
  risk: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelihood: number;
  impact: string;
  mitigation: string;
}

interface FeatureAnalysis {
  intent: IntentExtraction;
  verifications: VerificationResult[];
  risks: RiskAssessment[];
  relatedCodeAnalysis: {
    file: string;
    relevance: string;
    potentialImpact: string;
  }[];
  summary: string;
  overallConfidence: number;
  reasoningSteps?: string[];
}

export class FeatureVerificationAgent extends BaseAgent {
  constructor(config: Config, llm: LLMProvider, logCallback?: AgentLogCallback) {
    super('FeatureVerificationAgent', config, llm, FEATURE_VERIFICATION_AGENT_CONFIG, logCallback);
  }

  async analyze(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.log('start', 'Starting feature verification analysis', {
      role: this.agentConfig.role,
      hasPRDescription: !!context.prDescription,
      commitCount: context.commitMessages?.length || 0,
    });

    this.log('intent_extraction', 'Extracting intent from PR description and commits');
    const intentExtraction = await this.extractIntent(context);
    this.log('intent_complete', `Primary intent: ${intentExtraction?.primaryIntent || 'Unknown'}`, {
      primaryIntent: intentExtraction?.primaryIntent,
      expectedBehaviors: intentExtraction?.expectedBehaviors?.length || 0,
    });

    this.log('related_code', 'Analyzing impact on related code');
    const relatedCodeAnalysis = await this.analyzeRelatedCode(context, intentExtraction);
    this.log('related_complete', `Analyzed ${relatedCodeAnalysis.length} related files`);
    
    this.log('verification', 'Verifying implementation against extracted intent');
    const verification = await this.verifyImplementation(context, intentExtraction, relatedCodeAnalysis);
    this.log('verification_complete', `Verification confidence: ${((verification?.overallConfidence || 0) * 100).toFixed(0)}%`);
    
    this.log('generate_issues', 'Generating issues from verification results');
    const issues = this.generateIssues(verification);
    
    const executionTime = Date.now() - startTime;
    this.log('complete', 'Feature verification completed', {
      issuesFound: issues.length,
      risksIdentified: verification?.risks?.length || 0,
      confidence: verification?.overallConfidence || 0,
      executionTime,
    });

    const result: AgentResult = {
      agentName: this.name,
      issues,
      summary: verification?.summary || 'Feature verification completed.',
      metadata: {
        intent: intentExtraction,
        verifications: verification?.verifications || [],
        risks: verification?.risks || [],
        relatedCodeAnalysis,
        overallConfidence: verification?.overallConfidence || 0.5,
      },
      confidence: this.calculateOverallConfidence(issues),
      executionTime,
      reasoningSteps: verification?.reasoningSteps,
    };

    // Generate handoff for next agent (synthesis)
    result.handoff = this.generateHandoff(result);

    return result;
  }

  private async extractIntent(context: AgentContext): Promise<IntentExtraction | null> {
    const prompt = this.buildIntentExtractionPrompt(context);
    
    try {
      const response = await this.generateWithRetry(prompt);
      return this.parseJsonResponse<IntentExtraction>(response);
    } catch (error) {
      logger.error(`[${this.name}] Intent extraction failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildIntentExtractionPrompt(context: AgentContext): string {
    const prInfo = context.prDescription 
      ? `\nPR Description:\n${context.prDescription}`
      : '';
    
    const commitInfo = context.commitMessages?.length
      ? `\nCommit Messages:\n${context.commitMessages.join('\n')}`
      : '';

    return `You are an expert code analyst. Extract the intent and expected behavior from this PR.

**CRITICAL: Output ONLY valid JSON. No explanations, no markdown outside JSON.**

Analyze:
1. What is the primary goal of these changes?
2. What behaviors should this implement?
3. What components are affected?
4. Are there any breaking changes?

${prInfo}
${commitInfo}

DIFF:
${context.diff}

JSON format:
{
  "primaryIntent": "Main goal of the changes",
  "secondaryIntents": ["Secondary goal 1", "Secondary goal 2"],
  "expectedBehaviors": [
    "When X happens, Y should occur",
    "User should be able to Z"
  ],
  "affectedComponents": ["component1", "component2"],
  "breakingChanges": ["Breaking change description if any"]
}

JSON:`;
  }

  private async analyzeRelatedCode(
    context: AgentContext, 
    intent: IntentExtraction | null
  ): Promise<{ file: string; relevance: string; potentialImpact: string }[]> {
    if (!context.relatedCode || context.relatedCode.size === 0) {
      return [];
    }

    const relatedCodeStr = Array.from(context.relatedCode.entries())
      .map(([file, content]) => `--- ${file} ---\n${content.slice(0, 1000)}`)
      .join('\n\n');

    const prompt = `Analyze how these related files might be impacted by the changes.

**CRITICAL: Output ONLY valid JSON.**

Intent: ${intent?.primaryIntent || 'Unknown'}

Related Files:
${relatedCodeStr}

JSON format:
{
  "analysis": [
    {
      "file": "path/to/file",
      "relevance": "Why this file is related",
      "potentialImpact": "How changes might affect this file"
    }
  ]
}

JSON:`;

    try {
      const response = await this.generateWithRetry(prompt);
      const parsed = this.parseJsonResponse<{ analysis: { file: string; relevance: string; potentialImpact: string }[] }>(response);
      return parsed?.analysis || [];
    } catch (error) {
      logger.debug(`[${this.name}] Related code analysis failed: ${(error as Error).message}`);
      return [];
    }
  }

  private async verifyImplementation(
    context: AgentContext,
    intent: IntentExtraction | null,
    relatedCodeAnalysis: { file: string; relevance: string; potentialImpact: string }[]
  ): Promise<FeatureAnalysis | null> {
    const prompt = this.buildVerificationPrompt(context, intent, relatedCodeAnalysis);
    
    try {
      const response = await this.generateWithRetry(prompt);
      return this.parseJsonResponse<FeatureAnalysis>(response);
    } catch (error) {
      logger.error(`[${this.name}] Verification failed: ${(error as Error).message}`);
      return null;
    }
  }

  private buildVerificationPrompt(
    context: AgentContext,
    intent: IntentExtraction | null,
    relatedCodeAnalysis: { file: string; relevance: string; potentialImpact: string }[]
  ): string {
    const intentStr = intent 
      ? `
Primary Intent: ${intent.primaryIntent}
Expected Behaviors:
${intent.expectedBehaviors.map(b => `- ${b}`).join('\n')}
Affected Components: ${intent.affectedComponents.join(', ')}
Breaking Changes: ${intent.breakingChanges.join(', ') || 'None identified'}
`
      : 'Intent not extracted';

    const relatedStr = relatedCodeAnalysis.length > 0
      ? `
Related Code Impact:
${relatedCodeAnalysis.map(r => `- ${r.file}: ${r.potentialImpact}`).join('\n')}
`
      : '';

    let basePrompt = `You are an expert code reviewer. Verify if the implementation matches the intent.

**CRITICAL: Output ONLY valid JSON. No explanations, no markdown outside JSON.**

${intentStr}
${relatedStr}

Verify:
1. Does the implementation achieve the stated intent?
2. Are all expected behaviors implemented correctly?
3. Are there any risks or edge cases not handled?
4. Could this break existing functionality?

JSON format:
{
  "reasoningSteps": [
    "Step 1: I analyzed the stated intent and expected behaviors...",
    "Step 2: I traced through the implementation to verify each behavior...",
    "Step 3: I identified potential risks and edge cases..."
  ],
  "intent": {
    "primaryIntent": "extracted intent",
    "secondaryIntents": [],
    "expectedBehaviors": [],
    "affectedComponents": [],
    "breakingChanges": []
  },
  "verifications": [
    {
      "behavior": "Expected behavior description",
      "status": "verified|partial|missing|incorrect",
      "evidence": "Code evidence or explanation",
      "file": "path/to/file",
      "line": 42,
      "confidence": 85,
      "reasoning": "Why I believe this behavior is/isn't correctly implemented"
    }
  ],
  "risks": [
    {
      "risk": "Risk description",
      "severity": "critical|high|medium|low",
      "likelihood": 0.7,
      "impact": "What could go wrong",
      "mitigation": "How to address it"
    }
  ],
  "relatedCodeAnalysis": [],
  "summary": "Overall verification summary",
  "overallConfidence": 0.85
}`;

    // Use chain-of-thought prompt builder for context and handoff notes
    basePrompt = this.buildChainOfThoughtPrompt(basePrompt, context);

    return `${basePrompt}

DIFF:
${context.diff}

JSON:`;
  }

  private generateIssues(analysis: FeatureAnalysis | null): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    if (!analysis) {
      return issues;
    }

    for (const verification of analysis.verifications) {
      if (verification.status === 'missing') {
        issues.push({
          file: verification.file || 'unknown',
          line: verification.line,
          severity: 'high',
          category: 'logic',
          message: `Missing implementation: ${verification.behavior}`,
          suggestion: `Implement the expected behavior: ${verification.evidence}`,
        });
      } else if (verification.status === 'incorrect') {
        issues.push({
          file: verification.file || 'unknown',
          line: verification.line,
          severity: 'critical',
          category: 'bug',
          message: `Incorrect implementation: ${verification.behavior}`,
          suggestion: verification.evidence,
        });
      } else if (verification.status === 'partial') {
        issues.push({
          file: verification.file || 'unknown',
          line: verification.line,
          severity: 'medium',
          category: 'logic',
          message: `Partial implementation: ${verification.behavior}`,
          suggestion: verification.evidence,
        });
      }
    }

    for (const risk of analysis.risks) {
      if (risk.likelihood >= 0.5 || risk.severity === 'critical' || risk.severity === 'high') {
        issues.push({
          file: 'unknown',
          severity: risk.severity,
          category: 'logic',
          message: `Risk identified: ${risk.risk}. Impact: ${risk.impact}`,
          suggestion: risk.mitigation,
        });
      }
    }

    if (analysis.intent?.breakingChanges?.length > 0) {
      for (const breakingChange of analysis.intent.breakingChanges) {
        issues.push({
          file: 'unknown',
          severity: 'high',
          category: 'architecture',
          message: `Breaking change detected: ${breakingChange}`,
          suggestion: 'Ensure backward compatibility or document migration path.',
        });
      }
    }

    return issues;
  }
}
