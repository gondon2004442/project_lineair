/** Фабрики сущностей: набор компонентов и ничего больше. */
import { createEntity, type Entity, type Faction, type World } from './ecs';
import { PALETTE } from './palette';
import { TUNING } from './tuning';

export function spawnPlayer(w: World, x: number, y: number): Entity {
  const e = createEntity(w);
  w.transform.set(e, { x, y, px: x, py: y });
  w.body.set(e, { vx: 0, vy: 0, radius: TUNING.player.radius });
  w.health.set(e, { hp: TUNING.player.maxHp, max: TUNING.player.maxHp, iframes: 0, flash: 0 });
  w.playerC.set(e, {
    aimX: 1,
    aimY: 0,
    phase: 'normal',
    fireCooldown: 0,
    dashTime: 0,
    dashCooldown: 0,
    dashX: 1,
    dashY: 0,
  });
  w.drawC.set(e, { shape: 'square', size: TUNING.player.radius, color: PALETTE.concreteLight });
  return e;
}

export function spawnEnemy(w: World, x: number, y: number): Entity {
  const e = createEntity(w);
  w.transform.set(e, { x, y, px: x, py: y });
  w.body.set(e, { vx: 0, vy: 0, radius: TUNING.enemy.radius });
  w.health.set(e, { hp: TUNING.enemy.maxHp, max: TUNING.enemy.maxHp, iframes: 0, flash: 0 });
  w.enemyC.set(e, {
    phase: 'chase',
    timer: TUNING.enemy.aimDelay,
    shotsLeft: 0,
    strafeSign: w.rng.float() < 0.5 ? -1 : 1,
  });
  w.drawC.set(e, { shape: 'square', size: TUNING.enemy.radius, color: PALETTE.red });
  return e;
}

export function spawnBullet(
  w: World,
  faction: Faction,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
): Entity {
  const spec = faction === 'player' ? TUNING.playerBullet : TUNING.enemyBullet;
  const e = createEntity(w);
  w.transform.set(e, { x, y, px: x, py: y });
  w.body.set(e, { vx: dirX * spec.speed, vy: dirY * spec.speed, radius: spec.radius });
  w.bulletC.set(e, { faction, damage: spec.damage, life: spec.life });
  w.drawC.set(e, {
    shape: faction === 'player' ? 'dot' : 'diamond',
    size: spec.radius,
    color: faction === 'player' ? PALETTE.yellow : PALETTE.red,
  });
  return e;
}
