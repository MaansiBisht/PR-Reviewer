export interface LLMProvider {
  generate(prompt: string): Promise<string>;
  isAvailable(): Promise<boolean>;
  getModelName(): string;
}
