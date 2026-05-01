import OpenAI from 'openai';
import { LLMProvider } from './provider';
import { Config } from '../../types';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: Config) {
    if (!config.apiKey) throw new Error('OpenAI provider requires an API key (OPENAI_API_KEY)');
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.cloudModel || 'gpt-4o';
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');
    return content;
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
