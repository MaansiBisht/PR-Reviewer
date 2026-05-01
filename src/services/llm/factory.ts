import { LLMProvider } from './provider';
import { OllamaProvider } from './ollama-provider';
import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';
import { Config } from '../../types';

export function createLLMProvider(config: Config): LLMProvider {
  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'ollama':
    default:
      return new OllamaProvider(config);
  }
}
