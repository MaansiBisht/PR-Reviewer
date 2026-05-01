import { LLMProvider } from './provider';
import { OllamaClient } from '../ollama';
import { Config } from '../../types';

export class OllamaProvider implements LLMProvider {
  private client: OllamaClient;

  constructor(config: Config) {
    this.client = new OllamaClient(config);
  }

  async generate(prompt: string): Promise<string> {
    return this.client.generate(prompt);
  }

  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable();
  }

  getModelName(): string {
    return this.client.getResolvedModel();
  }

  async hasModel(name: string): Promise<boolean> {
    return this.client.hasModel(name);
  }

  async listModels(): Promise<string[]> {
    return this.client.listModels();
  }
}
