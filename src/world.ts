/** Сборка мира на старте забега. Всё случайное — из seeded PRNG. */
import type { InputSnapshot } from './input';
import { makeRng } from './rng';
import { buildRoom, floorBounds } from './room';
import { spawnEnemy, spawnPlayer } from './spawn';
import { TUNING } from './tuning';
import type { World } from './ecs';

export function createWorld(seed: number, input: InputSnapshot): World {
  const map = buildRoom();
  const w: World = {
    seed,
    rng: makeRng(seed),
    tick: 0,
    map,
    input,
    fx: { shake: 0, hitstop: 0 },
    status: 'playing',
    player: -1,
    nextEntity: 1,
    alive: new Set(),
    doomed: [],
    transform: new Map(),
    body: new Map(),
    health: new Map(),
    playerC: new Map(),
    enemyC: new Map(),
    bulletC: new Map(),
    drawC: new Map(),
  };

  const [minX, minY, maxX, maxY] = floorBounds(map);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  w.player = spawnPlayer(w, centerX, centerY);

  const margin = TUNING.enemy.spawnMargin;
  for (let i = 0; i < TUNING.enemy.count; i++) {
    let x = centerX;
    let y = centerY;
    // Отталкиваемся от субъекта: тянем точку, пока она не окажется достаточно далеко.
    for (let attempt = 0; attempt < TUNING.enemy.count * 8; attempt++) {
      x = w.rng.range(minX + margin, maxX - margin);
      y = w.rng.range(minY + margin, maxY - margin);
      if (Math.hypot(x - centerX, y - centerY) >= TUNING.enemy.spawnMinDistance) break;
    }
    spawnEnemy(w, x, y);
  }

  return w;
}

export function countEnemies(w: World): number {
  return w.enemyC.size;
}
