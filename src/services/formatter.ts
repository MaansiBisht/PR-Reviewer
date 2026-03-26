import chalk from 'chalk';
import { ReviewResult, ReviewIssue, ReviewStats } from '../types';

export function formatReviewOutput(result: ReviewResult): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════════════════'));
  lines.push(chalk.bold.cyan('                    PR REVIEW RESULTS                       '));
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════════════════'));
  lines.push('');
  
  lines.push(chalk.bold('Summary:'));
  lines.push(chalk.white(result.summary));
  lines.push('');
  
  lines.push(chalk.bold('Statistics:'));
  lines.push(formatStats(result.stats));
  lines.push('');
  
  if (result.issues.length === 0) {
    lines.push(chalk.green.bold('✓ No issues found! Code looks good.'));
    lines.push('');
    return lines.join('\n');
  }
  
  const issuesByFile = groupIssuesByFile(result.issues);
  
  const criticalIssues = result.issues.filter(i => i.severity === 'critical');
  const highIssues = result.issues.filter(i => i.severity === 'high');
  
  if (criticalIssues.length > 0) {
    lines.push(chalk.red.bold('🚨 CRITICAL ISSUES FOUND:'));
    lines.push('');
    for (const issue of criticalIssues) {
      lines.push(formatIssue(issue, true));
    }
    lines.push('');
  }
  
  if (highIssues.length > 0) {
    lines.push(chalk.hex('#ea580c').bold('⚠ HIGH SEVERITY ISSUES:'));
    lines.push('');
    for (const issue of highIssues) {
      lines.push(formatIssue(issue, true));
    }
    lines.push('');
  }
  
  lines.push(chalk.bold('Issues by File:'));
  lines.push('');
  
  for (const [file, issues] of Object.entries(issuesByFile)) {
    lines.push(chalk.bold.underline(`📁 ${file}`));
    lines.push('');
    
    const sortedIssues = issues.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
    });
    
    for (const issue of sortedIssues) {
      if (issue.severity !== 'high' && issue.severity !== 'critical') {
        lines.push(formatIssue(issue, false));
      }
    }
    lines.push('');
  }
  
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════════════════'));
  lines.push('');
  
  return lines.join('\n');
}

function formatStats(stats: ReviewStats): string {
  const parts: string[] = [];
  
  parts.push(`  Total: ${chalk.bold(stats.totalIssues)}`);
  
  if (stats.critical > 0) {
    parts.push(`  ${chalk.red('●')} Critical: ${chalk.red.bold(stats.critical)}`);
  }
  if (stats.high > 0) {
    parts.push(`  ${chalk.hex('#ea580c')('●')} High: ${chalk.hex('#ea580c').bold(stats.high)}`);
  }
  if (stats.medium > 0) {
    parts.push(`  ${chalk.yellow('●')} Medium: ${chalk.yellow.bold(stats.medium)}`);
  }
  if (stats.low > 0) {
    parts.push(`  ${chalk.blue('●')} Low: ${chalk.blue.bold(stats.low)}`);
  }
  
  return parts.join('\n');
}

function formatIssue(issue: ReviewIssue, isHighlight: boolean): string {
  const lines: string[] = [];
  
  const severityIcon = getSeverityIcon(issue.severity);
  const severityColor = getSeverityColor(issue.severity);
  
  const lineInfo = issue.line ? `:${issue.line}` : '';
  const location = isHighlight ? `${issue.file}${lineInfo}` : `Line${lineInfo || ' ?'}`;
  
  lines.push(`  ${severityIcon} ${severityColor(`[${issue.severity.toUpperCase()}]`)} ${chalk.gray(`(${issue.category})`)}`);
  
  if (isHighlight) {
    lines.push(`    ${chalk.gray('File:')} ${chalk.white(location)}`);
  } else if (issue.line) {
    lines.push(`    ${chalk.gray('Line:')} ${chalk.white(issue.line.toString())}`);
  }
  
  lines.push(`    ${chalk.gray('Issue:')} ${issue.message}`);
  
  if (issue.suggestion) {
    lines.push(`    ${chalk.gray('Fix:')} ${chalk.green(issue.suggestion)}`);
  }
  
  lines.push('');
  
  return lines.join('\n');
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return chalk.red('🔴');
    case 'high':
      return chalk.hex('#ea580c')('�');
    case 'medium':
      return chalk.yellow('🟡');
    case 'low':
      return chalk.blue('🔵');
    default:
      return chalk.gray('⚪');
  }
}

function getSeverityColor(severity: string): (text: string) => string {
  switch (severity) {
    case 'critical':
      return chalk.red;
    case 'high':
      return chalk.hex('#ea580c');
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}

function groupIssuesByFile(issues: ReviewIssue[]): Record<string, ReviewIssue[]> {
  const grouped: Record<string, ReviewIssue[]> = {};
  
  for (const issue of issues) {
    const file = issue.file || 'unknown';
    if (!grouped[file]) {
      grouped[file] = [];
    }
    grouped[file].push(issue);
  }
  
  return grouped;
}

export function formatError(error: Error): string {
  return [
    '',
    chalk.red.bold('═══════════════════════════════════════════════════════════'),
    chalk.red.bold('                         ERROR                              '),
    chalk.red.bold('═══════════════════════════════════════════════════════════'),
    '',
    chalk.red(error.message),
    '',
    chalk.gray('Stack trace:'),
    chalk.gray(error.stack || 'No stack trace available'),
    '',
  ].join('\n');
}

export function formatProgress(message: string): void {
  process.stdout.write(chalk.cyan(`⏳ ${message}\r`));
}

export function clearProgress(): void {
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
}
