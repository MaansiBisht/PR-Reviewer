#!/usr/bin/env node
import { Config, DEFAULT_CONFIG } from './types';
import { loadProjectConfig } from './utils/config-loader';
import { startServer } from './server';

function buildConfig(): Config {
  const projectConfig = loadProjectConfig();

  const config: Config = {
    ...DEFAULT_CONFIG,
    provider: (process.env.LLM_PROVIDER as Config['provider']) || DEFAULT_CONFIG.provider,
    ollamaUrl: process.env.OLLAMA_URL || DEFAULT_CONFIG.ollamaUrl,
    model: process.env.OLLAMA_MODEL || DEFAULT_CONFIG.model,
    cloudModel: process.env.CLOUD_MODEL,
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
    githubToken: process.env.GITHUB_TOKEN,
    bitbucketToken: process.env.BITBUCKET_TOKEN,
    bitbucketUsername: process.env.BITBUCKET_USERNAME,
  };

  if (projectConfig) {
    if (projectConfig.model) config.model = projectConfig.model;
    if (projectConfig.baseBranch) config.baseBranch = projectConfig.baseBranch;
    if (projectConfig.fileFilter) config.fileFilter = { ...config.fileFilter, ...projectConfig.fileFilter };
    if (projectConfig.reviewFocus) config.reviewFocus = { ...config.reviewFocus, ...projectConfig.reviewFocus };
  }

  return config;
}

const port = parseInt(process.env.PORT || '3001', 10);
startServer(buildConfig(), port);
