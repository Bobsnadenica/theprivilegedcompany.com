// Geometric scoring stays independent of pointer speed and browser storage.
export function scoreCircle(points) {
  if (!Array.isArray(points) || points.length < 12 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const radii = points.map(p => Math.hypot(p.x - cx, p.y - cy));
  const radius = radii.reduce((sum, value) => sum + value, 0) / points.length;
  if (radius < 15) return null;
  const variance = radii.reduce((sum, value) => sum + Math.abs(value - radius), 0) / points.length / radius;
  const closure = Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) / radius;
  let rotation = 0, travelled = 0;
  for (let i = 1; i < points.length; i++) {
    let angle = Math.atan2(points[i].y - cy, points[i].x - cx) - Math.atan2(points[i - 1].y - cy, points[i - 1].x - cx);
    if (angle > Math.PI) angle -= Math.PI * 2;
    if (angle < -Math.PI) angle += Math.PI * 2;
    rotation += angle;
    travelled += Math.abs(angle);
  }
  const turns = Math.abs(rotation) / (Math.PI * 2);
  const extraTurns = Math.max(0, travelled / (Math.PI * 2) - 1.1);
  const score = Math.max(0, Math.min(100, 100 - variance * 120 - closure * 15 - Math.abs(1 - turns) * 65 - extraTurns * 40));
  return { score, cx, cy, radius };
}

export function cleanScores(raw) {
  try {
    const values = JSON.parse(raw || '[]');
    return Array.isArray(values) ? values.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100).sort((a, b) => b - a).slice(0, 5) : [];
  } catch { return []; }
}
