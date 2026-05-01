import { useState, useEffect } from 'react';
import {
  Shield,
  Gauge,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Bot,
  Zap,
  Clock
} from 'lucide-react';

interface AgentLog {
  timestamp: string;
  agent: string;
  action: string;
  message: string;
  details?: Record<string, unknown>;
}

interface AgentInfo {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  capabilities: string[];
  focusAreas: string[];
  status: 'idle' | 'running' | 'completed' | 'error';
}

interface AgentPanelProps {
  agents: AgentInfo[];
  logs: AgentLog[];
  currentAgent?: string;
}

const agentIcons: Record<string, React.ReactNode> = {
  SecurityAgent: <Shield className="w-5 h-5" />,
  ComplexityAgent: <Gauge className="w-5 h-5" />,
  FeatureVerificationAgent: <CheckCircle2 className="w-5 h-5" />,
  SynthesisAgent: <Zap className="w-5 h-5" />,
};

const statusColors: Record<string, string> = {
  idle: 'bg-surface-400',
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  error: 'bg-red-500',
};

const statusIcons: Record<string, React.ReactNode> = {
  idle: <Clock className="w-4 h-4 text-surface-400" />,
  running: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
};

function AgentCard({ agent, logs, isActive }: { agent: AgentInfo; logs: AgentLog[]; isActive: boolean }) {
  const [expanded, setExpanded] = useState(isActive);
  const agentLogs = logs.filter(log => log.agent === agent.name);
  const recentLogs = agentLogs.slice(-5);

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive]);

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-all duration-300 ${
        isActive
          ? 'border-blue-500 shadow-lg shadow-blue-500/20'
          : agent.status === 'completed'
          ? 'border-green-500/50'
          : agent.status === 'error'
          ? 'border-red-500/50'
          : 'border-surface-200 dark:border-surface-700'
      }`}
    >
      {/* Header */}
      <div
        className={`p-4 cursor-pointer flex items-center justify-between ${
          isActive ? 'bg-blue-900/30' : 'bg-surface-50 dark:bg-surface-800/50'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-600' : 'bg-surface-200 dark:bg-surface-700'}`}>
            {agentIcons[agent.name] || <Bot className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-surface-900 dark:text-white">{agent.role}</h3>
              <span className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
            </div>
            <p className="text-sm text-surface-500 dark:text-surface-400">{agent.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusIcons[agent.status]}
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-surface-500 dark:text-surface-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-surface-500 dark:text-surface-400" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-surface-200 dark:border-surface-700">
          {/* Goal */}
          <div className="p-4 bg-surface-50 dark:bg-surface-800/30">
            <p className="text-sm text-surface-700 dark:text-surface-300">
              <span className="text-surface-500 font-medium">Goal: </span>
              {agent.goal}
            </p>
          </div>

          {/* Capabilities */}
          <div className="p-4 border-t border-surface-200/50 dark:border-surface-700/50">
            <p className="text-xs text-surface-500 uppercase tracking-wider mb-2">Capabilities</p>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap, i) => (
                <span
                  key={i}
                  className="px-2 py-1 text-xs bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300 rounded"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* Live Logs */}
          {recentLogs.length > 0 && (
            <div className="p-4 border-t border-surface-200/50 dark:border-surface-700/50 bg-surface-100/50 dark:bg-surface-900/50">
              <p className="text-xs text-surface-500 uppercase tracking-wider mb-2">Activity Log</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {recentLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-surface-500 text-xs whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`px-1.5 py-0.5 text-xs rounded ${
                      log.action.includes('complete') ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' :
                      log.action.includes('error') ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' :
                      log.action.includes('start') ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400' :
                      'bg-surface-200 dark:bg-surface-700 text-surface-500 dark:text-surface-400'
                    }`}>
                      {log.action}
                    </span>
                    <span className="text-surface-700 dark:text-surface-300 flex-1">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Backstory */}
          <details className="border-t border-surface-200/50 dark:border-surface-700/50">
            <summary className="p-3 text-xs text-surface-500 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800/30">
              View Agent Backstory
            </summary>
            <p className="px-4 pb-4 text-sm text-surface-500 dark:text-surface-400 italic">
              "{agent.backstory}"
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

export function AgentPanel({ agents, logs, currentAgent }: AgentPanelProps) {
  if (agents.length === 0) {
    return (
      <div className="p-6 text-center text-surface-500">
        <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No agents active</p>
        <p className="text-sm">Start a review to see agent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary-400" />
          Active Agents
        </h2>
        <span className="text-sm text-surface-500">
          {agents.filter(a => a.status === 'completed').length}/{agents.length} completed
        </span>
      </div>

      <div className="space-y-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.name}
            agent={agent}
            logs={logs}
            isActive={currentAgent === agent.name}
          />
        ))}
      </div>

      {/* Overall Progress */}
      <div className="mt-4 p-4 bg-surface-100 dark:bg-surface-800/50 rounded-lg">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-surface-500">Overall Progress</span>
          <span className="text-surface-900 dark:text-white">
            {Math.round((agents.filter(a => a.status === 'completed').length / agents.length) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
            style={{
              width: `${(agents.filter(a => a.status === 'completed').length / agents.length) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default AgentPanel;
