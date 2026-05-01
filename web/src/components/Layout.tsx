import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  GitPullRequest,
  Settings,
  Home,
  Shield,
  Gauge,
  CheckCircle,
  Layers,
  ChevronDown,
  Clock,
  BarChart3,
  Sparkles,
  Zap
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

interface AgentSidebarItem {
  name: string;
  role: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
}

const agents: AgentSidebarItem[] = [
  {
    name: 'SecurityAgent',
    role: 'Security',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    description: 'Identifies vulnerabilities, exploits, and unsafe coding practices',
  },
  {
    name: 'ComplexityAgent',
    role: 'Complexity',
    icon: <Gauge className="w-4 h-4" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    description: 'Analyzes cyclomatic complexity, Big-O, and performance bottlenecks',
  },
  {
    name: 'FeatureVerificationAgent',
    role: 'Verification',
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    description: 'Verifies implementation matches intent and identifies gaps',
  },
  {
    name: 'SynthesisAgent',
    role: 'Synthesis',
    icon: <Layers className="w-4 h-4" />,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    description: 'Aggregates and prioritizes findings into final review',
  },
];

function AgentInfoItem({ agent }: { agent: AgentSidebarItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
          hover:bg-surface-100 dark:hover:bg-surface-800/50 ${expanded ? 'bg-surface-100 dark:bg-surface-800/30' : ''}`}
      >
        <span className={`p-1.5 rounded-lg ${agent.bgColor} ${agent.color} transition-transform duration-200 group-hover:scale-110`}>
          {agent.icon}
        </span>
        <span className="text-sm flex-1 text-left text-surface-600 dark:text-surface-300 group-hover:text-surface-900 dark:group-hover:text-surface-100 transition-colors">
          {agent.role}
        </span>
        <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDown className="w-4 h-4 text-surface-400 dark:text-surface-500" />
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-out ${expanded ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="ml-12 mr-3 mt-1 mb-2 p-3 bg-surface-100 dark:bg-surface-800/30 rounded-lg text-xs text-surface-500 dark:text-surface-400 leading-relaxed">
          {agent.description}
        </div>
      </div>
    </li>
  );
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/prs', icon: GitPullRequest, label: 'PR Browser' },
    { path: '/history', icon: Clock, label: 'History' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="h-screen flex bg-surface-100 dark:bg-surface-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-surface-200 dark:border-surface-800">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500/20 blur-xl rounded-full group-hover:bg-primary-500/30 transition-all duration-300" />
              <div className="relative p-2 bg-gradient-to-br from-primary-500 to-violet-600 rounded-xl shadow-glow">
                <GitPullRequest className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="font-bold text-lg text-surface-900 dark:text-white flex items-center gap-2">
                PR Reviewer
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h1>
              <p className="text-xs text-surface-500 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Multi-Agent AI
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="mb-6">
            <p className="px-3 mb-2 text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-widest">
              Navigation
            </p>
            <ul className="space-y-1">
              {navItems.map(({ path, icon: Icon, label }) => {
                const isActive = location.pathname === path;
                return (
                  <li key={path}>
                    <Link
                      to={path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
                        ${isActive
                          ? 'bg-primary-600 text-white shadow-glow'
                          : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800/50 hover:text-surface-900 dark:hover:text-surface-100'
                        }`}
                    >
                      <Icon className={`w-5 h-5 transition-transform duration-200 ${!isActive && 'group-hover:scale-110'}`} />
                      <span className="font-medium">{label}</span>
                      {isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Agents Section */}
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-widest">
              AI Agents
            </p>
            <ul className="space-y-1">
              {agents.map((agent) => (
                <AgentInfoItem key={agent.name} agent={agent} />
              ))}
            </ul>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-surface-200 dark:border-surface-800 space-y-4">
          <ThemeToggle />
          <div className="flex items-center justify-between text-xs text-surface-500">
            <span>Powered by Ollama</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Ready
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-surface-50 dark:bg-surface-900/50">
        <div className="animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
