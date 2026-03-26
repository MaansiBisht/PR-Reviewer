import { FileFilter } from '../types';
import { logger } from './logger';

export function shouldIncludeFile(
  filename: string,
  filter: FileFilter
): boolean {
  if (filter.exclude) {
    for (const pattern of filter.exclude) {
      if (matchGlob(filename, pattern)) {
        logger.debug(`Excluding file: ${filename} (matched: ${pattern})`);
        return false;
      }
    }
  }

  if (filter.include && filter.include.length > 0 && !filter.include.includes('*')) {
    const included = filter.include.some(pattern => matchGlob(filename, pattern));
    if (!included) {
      logger.debug(`File not in include list: ${filename}`);
      return false;
    }
  }

  return true;
}

export function filterDiff(diff: string, filter: FileFilter): string {
  const fileDiffs = splitDiffByFile(diff);
  const filteredDiffs: string[] = [];

  for (const fileDiff of fileDiffs) {
    const filename = extractFilename(fileDiff);
    if (filename && shouldIncludeFile(filename, filter)) {
      filteredDiffs.push(fileDiff);
    }
  }

  return filteredDiffs.join('\n');
}

function splitDiffByFile(diff: string): string[] {
  const parts = diff.split(/(?=^diff --git)/m);
  return parts.filter(part => part.trim().length > 0);
}

function extractFilename(fileDiff: string): string | null {
  const match = fileDiff.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
  return match ? match[2] : null;
}

function matchGlob(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    php: 'php',
    vue: 'vue',
    svelte: 'svelte',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
  };

  return languageMap[ext] || 'unknown';
}
