// Multiplier -> color ramp: near-white at short odds ramping to full gold
// for the longest shots. All thresholds live here.
const RAMP_START = 1.6;
const RAMP_END = 4.5;

const INK: [number, number, number] = [232, 237, 233];
const GOLD: [number, number, number] = [245, 184, 65];

export function riskColor(multiplier: number): string {
  const t = Math.min(1, Math.max(0, (multiplier - RAMP_START) / (RAMP_END - RAMP_START)));
  const [r, g, b] = INK.map((c, i) => Math.round(c + ((GOLD[i] ?? c) - c) * t));
  return `rgb(${r}, ${g}, ${b})`;
}
