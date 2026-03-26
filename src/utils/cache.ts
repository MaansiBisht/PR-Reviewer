import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CacheOptions } from '../types';
import { logger } from './logger';

interface CacheEntry {
  hash: string;
  result: unknown;
  timestamp: number;
}

export class ReviewCache {
  private cacheDir: string;
  private ttl: number;
  private enabled: boolean;

  constructor(options: CacheOptions, cwd: string = process.cwd()) {
    this.enabled = options.enabled;
    this.cacheDir = path.join(cwd, options.directory || '.pr-review-cache');
    this.ttl = options.ttl || 3600000;

    if (this.enabled) {
      this.ensureCacheDir();
    }
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      logger.debug(`Created cache directory: ${this.cacheDir}`);
    }
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private getCachePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.json`);
  }

  get<T>(diffContent: string): T | null {
    if (!this.enabled) return null;

    const hash = this.hashContent(diffContent);
    const cachePath = this.getCachePath(hash);

    if (!fs.existsSync(cachePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(cachePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(content);

      if (Date.now() - entry.timestamp > this.ttl) {
        logger.debug(`Cache expired for hash: ${hash}`);
        fs.unlinkSync(cachePath);
        return null;
      }

      logger.debug(`Cache hit for hash: ${hash}`);
      return entry.result as T;
    } catch (error) {
      logger.warn(`Failed to read cache: ${(error as Error).message}`);
      return null;
    }
  }

  set(diffContent: string, result: unknown): void {
    if (!this.enabled) return;

    const hash = this.hashContent(diffContent);
    const cachePath = this.getCachePath(hash);

    const entry: CacheEntry = {
      hash,
      result,
      timestamp: Date.now(),
    };

    try {
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
      logger.debug(`Cached result for hash: ${hash}`);
    } catch (error) {
      logger.warn(`Failed to write cache: ${(error as Error).message}`);
    }
  }

  clear(): void {
    if (!fs.existsSync(this.cacheDir)) return;

    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
    }
    logger.info(`Cleared ${files.length} cached entries`);
  }

  getStats(): { entries: number; size: number } {
    if (!fs.existsSync(this.cacheDir)) {
      return { entries: 0, size: 0 };
    }

    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    let totalSize = 0;

    for (const file of files) {
      const stats = fs.statSync(path.join(this.cacheDir, file));
      totalSize += stats.size;
    }

    return { entries: files.length, size: totalSize };
  }
}
