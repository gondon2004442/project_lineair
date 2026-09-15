/**
 * Вестибюль. Забег начинается, когда субъект встаёт в проём.
 * Никаких кнопок и подтверждений: шаг — и ты внутри.
 */
import type { World } from '../ecs';
import { isGatePoint } from '../room';
import { startRun } from '../world';

export function lobbySystem(w: World): void {
  if (w.scene !== 'lobby') return;
  const t = w.transform.get(w.player);
  if (t === undefined) return;
  if (!isGatePoint(w.map, t.x, t.y)) return;
  w.sounds.push('gate');
  startRun(w);
}
