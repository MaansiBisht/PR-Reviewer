import { useState, useEffect } from 'react';
import { Save, RefreshCw, CheckCircle, Cpu } from 'lucide-react';
import { reviewApi } from '../api/client';

interface Config {
  ollamaUrl: string;
  model: string;
  baseBranch: string;
  maxChunkSize: number;
  agents: string[];
  reviewFocus: {
    categories: string[];
    severityThreshold: string;
  };
}

const defaultConfig: Config = {
  ollamaUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder:7b',
  baseBranch: 'main',
  maxChunkSize: 4000,
  agents: ['security', 'complexity', 'feature-verification'],
  reviewFocus: {
    categories: ['bug', 'security', 'performance', 'logic', 'error-handling'],
    severityThreshold: 'low',
  },
};

const availableAgents = [
  { id: 'security', name: 'Security Agent', description: 'Scans for vulnerabilities and security issues' },
  { id: 'complexity', name: 'Complexity Agent', description: 'Analyzes cyclomatic complexity and Big-O' },
  { id: 'feature-verification', name: 'Feature Verification', description: 'Verifies intent and correctness' },
];

const availableCategories = [
  'bug', 'security', 'performance', 'style', 'logic', 
  'error-handling', 'duplication', 'naming', 'documentation', 
  'testing', 'architecture', 'dependency'
];

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    loadConfig();
    loadModels();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await reviewApi.getConfig();
      setConfig({ ...defaultConfig, ...data } as Config);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const data = await reviewApi.getModels();
      setAvailableModels(data.models);
    } catch {
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await reviewApi.updateConfig(config as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (agentId: string) => {
    setConfig(prev => ({
      ...prev,
      agents: prev.agents.includes(agentId)
        ? prev.agents.filter(a => a !== agentId)
        : [...prev.agents, agentId],
    }));
  };

  const toggleCategory = (category: string) => {
    setConfig(prev => ({
      ...prev,
      reviewFocus: {
        ...prev.reviewFocus,
        categories: prev.reviewFocus.categories.includes(category)
          ? prev.reviewFocus.categories.filter(c => c !== category)
          : [...prev.reviewFocus.categories, category],
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Settings</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Configure your PR Reviewer preferences
        </p>
      </header>

      <div className="space-y-6">
        {/* Ollama Settings */}
        <section className="card p-6 animate-fade-up">
          <h2 className="text-base font-semibold text-surface-900 dark:text-white mb-5 flex items-center gap-2">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Cpu className="w-4 h-4 text-primary-500" />
            </div>
            Ollama Configuration
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-600 dark:text-surface-300 mb-2">
                Ollama URL
              </label>
              <input
                type="text"
                value={config.ollamaUrl}
                onChange={(e) => setConfig({ ...config, ollamaUrl: e.target.value })}
                className="input font-mono"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-surface-600 dark:text-surface-300 mb-2">
                Model
                {modelsLoading && <RefreshCw className="w-3 h-3 animate-spin text-surface-400" />}
              </label>
              {availableModels.length > 0 ? (
                <div className="space-y-3">
                  <select
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="input"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    {availableModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setConfig({ ...config, model: m })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all duration-200 ${
                          config.model === m
                            ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium shadow-glow'
                            : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-primary-300 dark:hover:border-primary-700'
                        }`}
                      >
                        <Cpu className="w-4 h-4" />
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="input font-mono"
                    placeholder="e.g. qwen2.5-coder:7b"
                  />
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Could not connect to Ollama — enter model name manually
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Agent Selection */}
        <section className="card p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <h2 className="text-base font-semibold text-surface-900 dark:text-white mb-5">
            Active Agents
          </h2>
          <div className="space-y-3">
            {availableAgents.map((agent) => (
              <label
                key={agent.id}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                  config.agents.includes(agent.id)
                    ? 'border-primary-500 bg-primary-500/5 shadow-glow'
                    : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
                }`}
              >
                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                  config.agents.includes(agent.id)
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-surface-300 dark:border-surface-600'
                }`}>
                  {config.agents.includes(agent.id) && (
                    <CheckCircle className="w-3 h-3 text-white" />
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={config.agents.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="font-medium text-surface-900 dark:text-white">{agent.name}</div>
                  <div className="text-sm text-surface-500">{agent.description}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Review Focus */}
        <section className="card p-6 animate-fade-up" style={{ animationDelay: '200ms' }}>
          <h2 className="text-base font-semibold text-surface-900 dark:text-white mb-5">
            Review Focus
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-600 dark:text-surface-300 mb-3">
                Categories to Review
              </label>
              <div className="flex flex-wrap gap-2">
                {availableCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${
                      config.reviewFocus.categories.includes(category)
                        ? 'bg-primary-600 text-white shadow-glow'
                        : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 dark:text-surface-300 mb-2">
                Severity Threshold
              </label>
              <select
                value={config.reviewFocus.severityThreshold}
                onChange={(e) => setConfig({
                  ...config,
                  reviewFocus: { ...config.reviewFocus, severityThreshold: e.target.value }
                })}
                className="input"
              >
                <option value="low">Low (show all)</option>
                <option value="medium">Medium and above</option>
                <option value="high">High and above</option>
                <option value="critical">Critical only</option>
              </select>
            </div>
          </div>
        </section>

        {/* Git Settings */}
        <section className="card p-6 animate-fade-up" style={{ animationDelay: '300ms' }}>
          <h2 className="text-base font-semibold text-surface-900 dark:text-white mb-5">
            Git Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-surface-600 dark:text-surface-300 mb-2">
                Default Base Branch
              </label>
              <input
                type="text"
                value={config.baseBranch}
                onChange={(e) => setConfig({ ...config, baseBranch: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 dark:text-surface-300 mb-2">
                Max Chunk Size
              </label>
              <input
                type="number"
                value={config.maxChunkSize}
                onChange={(e) => setConfig({ ...config, maxChunkSize: parseInt(e.target.value, 10) })}
                className="input"
              />
              <p className="text-xs text-surface-500 mt-1.5">
                Maximum characters per chunk for large diffs
              </p>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`btn-primary px-8 py-3 ${saved ? 'bg-accent-600 hover:bg-accent-700' : ''}`}
          >
            {saved ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Saved!
              </>
            ) : saving ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
