import { useState } from "react";

export function LineChart({ data, color, height = 120 }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const validData = (data || []).filter(d => d && typeof d.value === "number" && isFinite(d.value));
  if (validData.length === 0) return null;

  const values = validData.map((d) => d.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;
  const width = 100;
  const padding = 5;

  const points = validData.map((item, index) => {
    const x = padding + (index / Math.max(1, validData.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((item.value - minValue) / range) * (height - 2 * padding);
    return { x, y, value: item.value, time: item.time };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(2)} ${height - padding} L ${padding} ${height - padding} Z`;

  const gradientId = `gradient-${color.replace("#", "")}-${Math.random().toString(36).substr(2, 9)}`;

  const displayPoints = points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 6)) === 0 || i === points.length - 1);

  const formatValue = (val) => {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + "M";
    if (val >= 1000) return (val / 1000).toFixed(1) + "K";
    return val.toLocaleString();
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        preserveAspectRatio="none"
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradientId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredPoint === i ? 4 : 0}
            fill={color}
            stroke="white"
            strokeWidth={1}
            className="transition-all duration-150"
            style={{ opacity: hoveredPoint === i ? 1 : 0 }}
          />
        ))}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={(e) => {
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const svgWidth = rect.width;
            const mouseX = e.clientX - rect.left;
            const relativeX = (mouseX / svgWidth) * width;
            const index = Math.round(((relativeX - padding) / (width - 2 * padding)) * (data.length - 1));
            const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
            setHoveredPoint(clampedIndex);
          }}
        />
      </svg>
      {hoveredPoint !== null && points[hoveredPoint] && (
        <div
          className="absolute pointer-events-none bg-gray-900/90 dark:bg-gray-100/90 text-white dark:text-gray-900 text-xs px-2 py-1 rounded shadow-lg z-10 whitespace-nowrap"
          style={{
            left: `${(points[hoveredPoint].x / width) * 100}%`,
            top: `${(points[hoveredPoint].y / height) * 100 - 15}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-medium">{points[hoveredPoint].time}</div>
          <div className="font-bold">{formatValue(points[hoveredPoint].value)}</div>
        </div>
      )}
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
      </div>
    </div>
  );
}

export function PieChart({ data, size = 120 }) {
  const validData = (data || []).filter(d => d && typeof d.value === "number" && isFinite(d.value) && d.value > 0);
  if (validData.length === 0) return null;

  const total = validData.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0 || !isFinite(total)) return null;
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

  let currentAngle = -90;
  const segments = validData.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return {
      ...item,
      percentage,
      color: colors[index % colors.length],
      startAngle,
      angle,
    };
  });

  const createArcPath = (startAngle, angle, radius) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = ((startAngle + angle) * Math.PI) / 180;
    const x1 = 50 + radius * Math.cos(startRad);
    const y1 = 50 + radius * Math.sin(startRad);
    const x2 = 50 + radius * Math.cos(endRad);
    const y2 = 50 + radius * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    return `M 50 50 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        {segments.map((seg, i) => (
          <path
            key={i}
            d={createArcPath(seg.startAngle, seg.angle, 40)}
            fill={seg.color}
            stroke="white"
            strokeWidth="1"
            className="transition-opacity hover:opacity-80"
          />
        ))}
      </svg>
      <div className="flex-1 space-y-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="text-gray-600 dark:text-gray-400 truncate max-w-[80px]">{seg.name}</span>
            </div>
            <span className="font-medium text-gray-800 dark:text-gray-200">{seg.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopList({ data, valueFormatter = (v) => v.toLocaleString() }) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {index + 1}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{valueFormatter(item.value)}</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(item.value / maxValue) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
