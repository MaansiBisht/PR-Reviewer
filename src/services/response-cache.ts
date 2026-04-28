import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

interface CacheEntry {
  key: string;
  prompt: string;
  response: string;
  model: string;
  agent: string;
  createdAt: number;
  hits: number;
}

const CACHE_DIR = path.join(os.homedir(), '.pr-reviewer', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'llm-responses.json');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttlMs: number;
  private maxEntries: number;
  private hits = 0;
  private misses = 0;

  constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? 500;
    this.ensureCacheDir();
    this.load();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE, 'utf-8');
        const entries: CacheEntry[] = JSON.parse(data);
        const now = Date.now();
        for (const entry of entries) {
          if (now - entry.createdAt < this.ttlMs) {
            this.cache.set(entry.key, entry);
          }
        }
        logger.debug(`Loaded ${this.cache.size} cached responses`);
      }
    } catch (error) {
      logger.warn(`Cache load failed: ${(error as Error).message}`);
    }
  }

  private save(): void {
    try {
      const entries = Array.from(this.cache.values());
      fs.writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 2));
    } catch (error) {
      logger.warn(`Cache save failed: ${(error as Error).message}`);
    }
  }

  private generateKey(prompt: string, model: string, agent: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(prompt);
    hash.update(model);
    hash.update(agent);
    return hash.digest('hex').slice(0, 32);
  }

  get(prompt: string, model: string, agent: string): string | null {
    const key = this.generateKey(prompt, model, agent);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    entry.hits++;
    this.hits++;
    logger.debug(`Cache HIT for ${agent} (${this.getHitRate().toFixed(1)}% hit rate)`);
    return entry.response;
  }

  set(prompt: string, model: string, agent: string, response: string): void {
    const key = this.generateKey(prompt, model, agent);
    
    // LRU eviction if over capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)[0]?.[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      key,
      prompt: prompt.slice(0, 200), // Just store truncated prompt for debugging
      response,
      model,
      agent,
      createdAt: Date.now(),
      hits: 0,
    });

    // Save periodically (every 10 writes)
    if (this.cache.size % 10 === 0) {
      this.save();
    }
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : (this.hits / total) * 100;
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.save();
  }
}

// Singleton
let _cache: ResponseCache | null = null;
export function getResponseCache(): ResponseCache {
  if (!_cache) {
    _cache = new ResponseCache();
  }
  return _cache;
}
