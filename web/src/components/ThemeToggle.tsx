import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-surface-800/50 rounded-xl">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
            theme === value
              ? 'bg-primary-600 text-white shadow-glow'
              : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'
          }`}
          title={label}
        >
          <Icon className={`w-4 h-4 transition-transform duration-200 ${theme === value ? 'scale-110' : ''}`} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
