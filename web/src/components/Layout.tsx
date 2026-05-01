import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
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
  Zap,
  GitBranch,
  GitPullRequest,
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
  dotColor: string;
  description: string;
}

const agents: AgentSidebarItem[] = [
  {
    name: 'SecurityAgent',
    role: 'Security',
    icon: <Shield className="w-3.5 h-3.5" />,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    dotColor: 'bg-red-400',
    description: 'Identifies vulnerabilities, exploits, and unsafe coding practices',
  },
  {
    name: 'ComplexityAgent',
    role: 'Complexity',
    icon: <Gauge className="w-3.5 h-3.5" />,
    color: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    dotColor: 'bg-amber-400',
    description: 'Analyzes cyclomatic complexity, Big-O, and performance bottlenecks',
  },
  {
    name: 'FeatureVerificationAgent',
    role: 'Verification',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    color: 'text-emerald-500 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    dotColor: 'bg-emerald-400',
    description: 'Verifies implementation matches intent and identifies gaps',
  },
  {
    name: 'SynthesisAgent',
    role: 'Synthesis',
    icon: <Layers className="w-3.5 h-3.5" />,
    color: 'text-violet-500 dark:text-violet-400',
    bgColor: 'bg-violet-500/10',
    dotColor: 'bg-violet-400',
    description: 'Aggregates and prioritizes findings into final review',
  },
];

function AgentInfoItem({ agent }: { agent: AgentSidebarItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-200 group
          hover:bg-surface-100 dark:hover:bg-surface-800/60
          ${expanded ? 'bg-surface-100 dark:bg-surface-800/40' : ''}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${agent.dotColor}`} />
        <span className={`p-1 rounded-md ${agent.bgColor} ${agent.color} transition-transform duration-200 group-hover:scale-110`}>
          {agent.icon}
        </span>
        <span className="text-xs flex-1 text-left text-surface-600 dark:text-surface-400 group-hover:text-surface-900 dark:group-hover:text-surface-100 transition-colors font-medium">
          {agent.role}
        </span>
        <ChevronDown className={`w-3 h-3 text-surface-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-out ${expanded ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
        <p className="ml-10 mr-3 mt-1 mb-2 text-[11px] text-surface-500 leading-relaxed">
          {agent.description}
        </p>
      </div>
    </li>
  );
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navItems = [
    { path: '/',          icon: Home,           label: 'Dashboard' },
    { path: '/prs',       icon: GitPullRequest,  label: 'PR Browser' },
    { path: '/history',   icon: Clock,           label: 'History' },
    { path: '/analytics', icon: BarChart3,       label: 'Analytics' },
    { path: '/settings',  icon: Settings,        label: 'Settings' },
  ];

  return (
    <div className="h-screen flex bg-surface-100 dark:bg-surface-950 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 flex flex-col">

        {/* Logo */}
        <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-800">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-primary-500/20 blur-lg rounded-xl group-hover:bg-primary-500/35 transition-all duration-300" />
              <div className="relative p-2 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl shadow-glow-sm">
                <GitBranch className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="font-display font-bold text-base text-surface-900 dark:text-white leading-tight flex items-center gap-1.5">
                PR Reviewer
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h1>
              <p className="text-[10px] text-surface-500 flex items-center gap-1 mt-0.5">
                <Zap className="w-2.5 h-2.5 text-primary-500" />
                Multi-Agent AI
              </p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
          <div>
            <p className="px-2 mb-1 text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest">
              Navigate
            </p>
            <ul className="space-y-0.5">
              {navItems.map(({ path, icon: Icon, label }) => {
                const isActive = location.pathname === path;
                return (
                  <li key={path}>
                    <Link
                      to={path}
                      className={`relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 group
                        ${isActive ? 'nav-item-active font-semibold' : 'nav-item'}`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${
                        isActive ? 'text-primary-600 dark:text-primary-400' : 'group-hover:scale-110'
                      }`} />
                      <span className="text-sm">{label}</span>
                      {isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="px-2 mb-1 text-[10px] font-semibold text-surface-400 dark:text-surface-600 uppercase tracking-widest">
              AI Agents
            </p>
            <ul className="space-y-0.5">
              {agents.map((agent) => (
                <AgentInfoItem key={agent.name} agent={agent} />
              ))}
            </ul>
          </div>
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-surface-200 dark:border-surface-800 space-y-2">
          <ThemeToggle />
          <div className="flex items-center justify-between px-1 text-[11px] text-surface-400 dark:text-surface-600">
            <span className="flex items-center gap-1.5">
              <span className="status-dot-success animate-pulse" />
              AI Ready
            </span>
            <span className="font-mono text-[10px]">v2.0</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-surface-50 dark:bg-surface-950">
        <div className="animate-fade-in h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
