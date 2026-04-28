import * as fs from 'fs';
import * as path from 'path';
import { Config, ProjectConfig, DEFAULT_CONFIG } from '../types';
import { logger } from './logger';

const CONFIG_FILES = [
  '.pr-reviewrc.json',
  '.pr-reviewrc',
  'pr-review.config.json',
  '.pr-review.json',
];

export function loadProjectConfig(cwd: string = process.cwd()): ProjectConfig | null {
  for (const configFile of CONFIG_FILES) {
    const configPath = path.join(cwd, configFile);
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as ProjectConfig;
        logger.debug(`Loaded config from ${configFile}`);
        return config;
      } catch (error) {
        logger.warn(`Failed to parse ${configFile}: ${(error as Error).message}`);
      }
    }
  }
  return null;
}

export function mergeConfig(
  cliOptions: Partial<Config>,
  projectConfig: ProjectConfig | null
): Config {
  const merged: Config = { ...DEFAULT_CONFIG };

  if (projectConfig) {
    if (projectConfig.model) merged.model = projectConfig.model;
    if (projectConfig.baseBranch) merged.baseBranch = projectConfig.baseBranch;
    
    if (projectConfig.fileFilter) {
      merged.fileFilter = {
        ...merged.fileFilter,
        ...projectConfig.fileFilter,
      };
    }
    
    if (projectConfig.reviewFocus) {
      merged.reviewFocus = {
        ...merged.reviewFocus,
        ...projectConfig.reviewFocus,
      };
    }
    
    if (projectConfig.output) {
      merged.output = {
        ...merged.output,
        ...projectConfig.output,
      } as Config['output'];
    }
  }

  if (cliOptions.ollamaUrl) merged.ollamaUrl = cliOptions.ollamaUrl;
  if (cliOptions.model) merged.model = cliOptions.model;
  if (cliOptions.baseBranch) merged.baseBranch = cliOptions.baseBranch;
  if (cliOptions.maxChunkSize) merged.maxChunkSize = cliOptions.maxChunkSize;
  if (cliOptions.maxRetries) merged.maxRetries = cliOptions.maxRetries;
  if (cliOptions.output) {
    merged.output = { ...merged.output, ...cliOptions.output };
  }

  return merged;
}

export function generateDefaultConfig(): string {
  const config: ProjectConfig = {
    model: 'qwen2.5-coder:7b',
    baseBranch: 'main',
    fileFilter: {
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '*.lock',
        'package-lock.json',
        '*.min.js',
        '*.min.css',
      ],
    },
    reviewFocus: {
      categories: ['bug', 'security', 'performance', 'logic', 'error-handling'],
      severityThreshold: 'low',
      context: 'This is a production application. Focus on critical issues.',
    },
    output: {
      format: 'cli',
      includeCodeSnippets: true,
      groupBy: 'file',
    },
  };

  return JSON.stringify(config, null, 2);
}

export function saveDefaultConfig(cwd: string = process.cwd()): string {
  const configPath = path.join(cwd, '.pr-reviewrc.json');
  const content = generateDefaultConfig();
  fs.writeFileSync(configPath, content, 'utf-8');
  return configPath;
}
