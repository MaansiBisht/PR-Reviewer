import * as fs from 'fs';
import * as path from 'path';
import { ProjectConfig } from '../types';
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

