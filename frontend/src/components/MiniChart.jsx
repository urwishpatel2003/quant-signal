export default function MiniChart({ data, width = 200, height = 50 }) {
  if (!data?.close) return null;
  const closes = data.close.filter(Boolean);
  if (closes.length < 2) return null;
  const min  = Math.min(...closes), max = Math.max(...closes);
  const pts  = closes.map((v, i) => {
    const x = (i / (closes.length - 1)) * width;
    const y = height - ((v - min) / (max - min || 1)) * height;
    return `${x},${y}`;
  }).join(' ');
  const isUp = closes[closes.length - 1] >= closes[0];
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={isUp ? '#00ff88' : '#ff4444'} strokeWidth="1.5" />
    </svg>
  );
}
