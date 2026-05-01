import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'Auto' },
  ];

  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-surface-100 dark:bg-surface-800/60 rounded-lg border border-surface-200 dark:border-surface-700/50">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 flex-1 justify-center ${
            theme === value
              ? 'bg-primary-500 text-white shadow-glow-sm'
              : 'text-surface-500 dark:text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-700/60'
          }`}
        >
          <Icon className={`w-3.5 h-3.5 transition-transform duration-200 ${theme === value ? 'scale-110' : ''}`} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
