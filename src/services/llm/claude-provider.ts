import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './provider';
import { Config } from '../../types';

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: Config) {
    if (!config.apiKey) throw new Error('Claude provider requires an API key (ANTHROPIC_API_KEY)');
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.cloudModel || 'claude-opus-4-7';
  }

  async generate(prompt: string): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
    return block.text;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  getModelName(): string {
    return this.model;
  }
}
