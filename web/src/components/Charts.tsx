interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  maxValue?: number;
  showValues?: boolean;
  horizontal?: boolean;
}

export function BarChart({ data, maxValue, showValues = true, horizontal = true }: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);

  if (horizontal) {
    return (
      <div className="space-y-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-xs text-gray-600 dark:text-gray-400 truncate" title={item.label}>
              {item.label}
            </div>
            <div className="flex-1 relative h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full transition-all duration-500 rounded"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  backgroundColor: item.color || '#3b82f6',
                }}
              />
              {showValues && item.value > 0 && (
                <span className="absolute inset-0 flex items-center px-2 text-xs font-mono text-gray-700 dark:text-gray-200">
                  {item.value}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center">
          <div className="w-full flex items-end" style={{ height: '100%' }}>
            <div
              className="w-full rounded-t transition-all duration-500"
              style={{
                height: `${(item.value / max) * 100}%`,
                backgroundColor: item.color || '#3b82f6',
                minHeight: item.value > 0 ? '4px' : '0',
              }}
              title={`${item.label}: ${item.value}`}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1 truncate w-full text-center" title={item.label}>
            {item.label.length > 6 ? item.label.slice(0, 6) : item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

interface LineChartProps {
  data: Array<{ date: string; value: number }>;
  color?: string;
  height?: number;
}

export function LineChart({ data, color = '#3b82f6', height = 200 }: LineChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-gray-500 text-sm">
        No data available
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.value), 1);
  const width = 600;
  const padding = 40;
  const chartHeight = height - padding;
  const chartWidth = width - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding / 2 + (1 - d.value / max) * chartHeight;
    return { x, y, value: d.value, date: d.date };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x},${chartHeight + padding / 2} L ${points[0].x},${chartHeight + padding / 2} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          x1={padding}
          y1={padding / 2 + chartHeight * (1 - ratio)}
          x2={width - padding}
          y2={padding / 2 + chartHeight * (1 - ratio)}
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeDasharray="2,2"
        />
      ))}

      {/* Y-axis labels */}
      {[0, 0.5, 1].map((ratio) => (
        <text
          key={ratio}
          x={padding - 8}
          y={padding / 2 + chartHeight * (1 - ratio) + 3}
          fontSize="10"
          textAnchor="end"
          fill="currentColor"
          opacity="0.5"
        >
          {Math.round(max * ratio)}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaD} fill="url(#lineGradient)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" />

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill={color} />
          <title>{`${p.date}: ${p.value}`}</title>
        </g>
      ))}

      {/* X-axis labels */}
      {points.map((p, i) => {
        // Show every Nth label to avoid crowding
        const interval = Math.ceil(points.length / 6);
        if (i % interval !== 0 && i !== points.length - 1) return null;
        return (
          <text
            key={i}
            x={p.x}
            y={height - 5}
            fontSize="9"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.5"
          >
            {p.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

interface PieChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
}

export function PieChart({ data, size = 180 }: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div style={{ width: size, height: size }} className="flex items-center justify-center text-gray-500 text-sm">
        No data
      </div>
    );
  }

  const radius = size / 2;
  const centerX = radius;
  const centerY = radius;

  let currentAngle = -Math.PI / 2; // Start at top

  const paths = data.map((item) => {
    const angle = (item.value / total) * Math.PI * 2;
    const endAngle = currentAngle + angle;

    const x1 = centerX + radius * Math.cos(currentAngle);
    const y1 = centerY + radius * Math.sin(currentAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const d = `M ${centerX},${centerY} L ${x1},${y1} A ${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z`;

    const result = { path: d, color: item.color, label: item.label, value: item.value, percentage: Math.round((item.value / total) * 100) };
    currentAngle = endAngle;
    return result;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths.map((p, idx) => (
          <path key={idx} d={p.path} fill={p.color} stroke="white" strokeWidth="2">
            <title>{`${p.label}: ${p.value} (${p.percentage}%)`}</title>
          </path>
        ))}
      </svg>
      <div className="space-y-1">
        {paths.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: p.color }} />
            <span className="text-gray-600 dark:text-gray-400 capitalize">{p.label}</span>
            <span className="text-gray-500 font-mono">{p.value} ({p.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
