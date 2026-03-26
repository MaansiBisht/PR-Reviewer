import axios, { AxiosInstance } from 'axios';
import { Config, OllamaResponse } from '../types';
import { logger } from '../utils/logger';

export class OllamaClient {
  private client: AxiosInstance;
  private model: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: Config) {
    this.client = axios.create({
      baseURL: config.ollamaUrl,
      timeout: 300000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.model = config.model;
    this.maxRetries = config.maxRetries;
    this.retryDelay = config.retryDelay;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.get('/api/tags');
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models?.map((m: { name: string }) => m.name) || [];
    } catch {
      return [];
    }
  }

  async hasModel(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    logger.debug(`Available models: ${models.join(', ')}`);
    logger.debug(`Looking for model: ${modelName}`);
    
    // Exact match first
    if (models.includes(modelName)) {
      return true;
    }
    
    // Try partial match and update the model name
    const matched = models.find(m => m.includes(modelName) || modelName.includes(m.split(':')[0]));
    if (matched) {
      logger.debug(`Resolved model: ${modelName} -> ${matched}`);
      this.model = matched;
      return true;
    }
    
    return false;
  }

  getResolvedModel(): string {
    return this.model;
  }

  async generate(prompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${this.maxRetries} to generate response`);
        
        const response = await this.client.post('/api/generate', {
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
          },
        });

        const data = response.data as OllamaResponse;
        
        if (data.response) {
          return data.response;
        }
        
        throw new Error('Empty response from Ollama');
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Attempt ${attempt} failed: ${lastError.message}`);
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * attempt;
          logger.debug(`Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async generateStream(
    prompt: string,
    onToken: (token: string) => void
  ): Promise<string> {
    const response = await this.client.post(
      '/api/generate',
      {
        model: this.model,
        prompt: prompt,
        stream: true,
      },
      {
        responseType: 'stream',
      }
    );

    let fullResponse = '';
    
    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        try {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            const json = JSON.parse(line);
            if (json.response) {
              fullResponse += json.response;
              onToken(json.response);
            }
            if (json.done) {
              resolve(fullResponse);
            }
          }
        } catch (error) {
          reject(error);
        }
      });

      response.data.on('error', reject);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const createOllamaClient = (config: Config): OllamaClient => {
  return new OllamaClient(config);
};
