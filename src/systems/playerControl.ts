/**
 * Прицел, разгон, рывок и стрельба субъекта.
 * Формы оружия переключаются колесом, у каждой свой боезапас,
 * который восполняется, пока форма молчит.
 */
import { WEAPON_FORMS } from '../data/weaponForms';
import type { PlayerC, World } from '../ecs';
import { spawnBullet, type BulletSpec } from '../spawn';
import { DEG, TUNING } from '../tuning';
import { ammoMax, formStat } from '../weapon';
import { addShake } from './damage';

function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

export function playerControlSystem(w: World, dt: number): void {
  const e = w.player;
  const t = w.transform.get(e);
  const b = w.body.get(e);
  const p = w.playerC.get(e);
  const h = w.health.get(e);
  if (t === undefined || b === undefined || p === undefined || h === undefined) {
    w.input.dashQueued = false;
    w.input.formStep = 0;
    return;
  }

  const toAimX = w.input.aimX - t.x;
  const toAimY = w.input.aimY - t.y;
  const aimLen = Math.hypot(toAimX, toAimY);
  if (aimLen > 0) {
    p.aimX = toAimX / aimLen;
    p.aimY = toAimY / aimLen;
  }

  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.switchCooldown = Math.max(0, p.switchCooldown - dt);
  regenAmmo(w, p, dt);

  if (w.input.formStep !== 0 && p.switchCooldown <= 0) {
    const count = WEAPON_FORMS.length;
    p.form = (((p.form + w.input.formStep) % count) + count) % count;
    p.switchCooldown = TUNING.weapon.switchCooldown;
    // Незавершённые заряд и залп при смене формы сбрасываются.
    p.charge = 0;
    p.queued = 0;
  }
  w.input.formStep = 0;

  if (w.input.dashQueued) {
    w.input.dashQueued = false;
    if (p.phase === 'normal' && p.dashCooldown <= 0) {
      const hasMove = w.input.moveX !== 0 || w.input.moveY !== 0;
      p.dashX = hasMove ? w.input.moveX : p.aimX;
      p.dashY = hasMove ? w.input.moveY : p.aimY;
      p.phase = 'dash';
      p.dashTime = TUNING.player.dashDuration;
      p.dashCooldown = TUNING.player.dashCooldown;
      h.iframes = Math.max(h.iframes, TUNING.player.dashIFrames);
    }
  }

  if (p.phase === 'dash') {
    const dashSpeed = TUNING.player.dashDistance / TUNING.player.dashDuration;
    b.vx = p.dashX * dashSpeed;
    b.vy = p.dashY * dashSpeed;
    p.dashTime -= dt;
    if (p.dashTime <= 0) {
      p.phase = 'normal';
      b.vx *= TUNING.player.dashExitFactor;
      b.vy *= TUNING.player.dashExitFactor;
    }
    // Во время рывка субъект не стреляет: рывок — это трата хода.
    return;
  }

  const targetVx = w.input.moveX * TUNING.player.speed;
  const targetVy = w.input.moveY * TUNING.player.speed;
  const rate = (w.input.moveX === 0 && w.input.moveY === 0 ? TUNING.player.friction : TUNING.player.accel) * dt;
  b.vx = approach(b.vx, targetVx, rate);
  b.vy = approach(b.vy, targetVy, rate);

  fireSystem(w, p, t.x, t.y, dt);
}

function regenAmmo(w: World, p: PlayerC, dt: number): void {
  for (let i = 0; i < WEAPON_FORMS.length; i++) {
    const form = WEAPON_FORMS[i];
    if (form === undefined) continue;
    const delay = p.regenDelay[i] ?? 0;
    if (delay > 0) {
      p.regenDelay[i] = Math.max(0, delay - dt);
      continue;
    }
    const max = ammoMax(w, form.id);
    const current = Math.min(p.ammo[i] ?? max, max);
    p.ammo[i] = Math.min(max, current + formStat(w, form.id, 'regen') * dt);
  }
}

function fireSystem(w: World, p: PlayerC, x: number, y: number, dt: number): void {
  const form = WEAPON_FORMS[p.form];
  if (form === undefined || w.status === 'dead') return;

  // Залп доигрывается сам, даже если ЛКМ уже отпущена.
  if (p.queued > 0) {
    p.queueTimer -= dt;
    if (p.queueTimer <= 0) {
      launchVolleyShot(w, p, x, y);
      p.queued -= 1;
      p.queueTimer = formStat(w, 'volley', 'gap');
    }
    return;
  }

  if (form.id === 'lance') {
    if (w.input.fireHeld) {
      p.charge = Math.min(formStat(w, 'lance', 'chargeTime'), p.charge + dt);
      return;
    }
    if (p.charge > 0) {
      const charge = p.charge;
      p.charge = 0;
      if (charge >= formStat(w, 'lance', 'minCharge') && spend(w, p, 'lance')) {
        launchLance(w, p, x, y, charge);
      }
    }
    return;
  }

  if (!w.input.fireHeld || p.fireCooldown > 0) return;

  switch (form.id) {
    case 'precise':
      if (!spend(w, p, 'precise')) return;
      p.fireCooldown = formStat(w, 'precise', 'interval');
      launchPrecise(w, p, x, y);
      break;
    case 'scatter':
      if (!spend(w, p, 'scatter')) return;
      p.fireCooldown = formStat(w, 'scatter', 'interval');
      launchScatter(w, p, x, y);
      break;
    case 'volley':
      if (!spend(w, p, 'volley')) return;
      p.fireCooldown = formStat(w, 'volley', 'interval');
      p.queued = Math.max(1, Math.round(formStat(w, 'volley', 'count')));
      p.queueTimer = 0;
      break;
  }
}

/** Списать боезапас формы. Не хватило — выстрела нет. */
function spend(w: World, p: PlayerC, formId: string): boolean {
  const index = WEAPON_FORMS.findIndex((form) => form.id === formId);
  if (index < 0) return false;
  const cost = Math.max(0, formStat(w, formId, 'cost'));
  const have = p.ammo[index] ?? 0;
  if (have < cost) return false;
  p.ammo[index] = have - cost;
  p.regenDelay[index] = formStat(w, formId, 'regenDelay');
  return true;
}

function muzzleAt(x: number, y: number, dirX: number, dirY: number): [number, number] {
  return [x + dirX * TUNING.weapon.muzzle, y + dirY * TUNING.weapon.muzzle];
}

function recoil(w: World, dirX: number, dirY: number, shake: number): void {
  const b = w.body.get(w.player);
  if (b !== undefined) {
    b.vx -= dirX * TUNING.player.recoil;
    b.vy -= dirY * TUNING.player.recoil;
  }
  addShake(w, shake);
}

function launchPrecise(w: World, p: PlayerC, x: number, y: number): void {
  const angle = Math.atan2(p.aimY, p.aimX) + w.rng.spread(formStat(w, 'precise', 'spreadDeg') * DEG);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const spec: BulletSpec = {
    speed: formStat(w, 'precise', 'speed'),
    radius: formStat(w, 'precise', 'radius'),
    damage: formStat(w, 'precise', 'damage'),
    life: formStat(w, 'precise', 'life'),
    shape: 'dot',
  };
  const [mx, my] = muzzleAt(x, y, dirX, dirY);
  spawnBullet(w, 'player', spec, mx, my, dirX, dirY);
  recoil(w, dirX, dirY, TUNING.feel.shakeShoot);
}

function launchScatter(w: World, p: PlayerC, x: number, y: number): void {
  const pellets = Math.max(1, Math.round(formStat(w, 'scatter', 'pellets')));
  const spread = formStat(w, 'scatter', 'spreadDeg') * DEG;
  const base = Math.atan2(p.aimY, p.aimX);
  const jitter = formStat(w, 'scatter', 'speedJitter');
  for (let i = 0; i < pellets; i++) {
    const angle = base + w.rng.spread(spread / 2);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const spec: BulletSpec = {
      speed: formStat(w, 'scatter', 'speed') + w.rng.spread(jitter),
      radius: formStat(w, 'scatter', 'radius'),
      damage: formStat(w, 'scatter', 'damage'),
      life: formStat(w, 'scatter', 'life'),
      shape: 'dot',
    };
    const [mx, my] = muzzleAt(x, y, dirX, dirY);
    spawnBullet(w, 'player', spec, mx, my, dirX, dirY);
  }
  recoil(w, p.aimX, p.aimY, TUNING.feel.shakeEnemyHit);
}

function launchLance(w: World, p: PlayerC, x: number, y: number, charge: number): void {
  const full = formStat(w, 'lance', 'chargeTime');
  const ratio = full <= 0 ? 1 : Math.min(1, charge / full);
  const low = formStat(w, 'lance', 'damage');
  const high = formStat(w, 'lance', 'damageCharged');
  const spec: BulletSpec = {
    speed: formStat(w, 'lance', 'speed'),
    radius: formStat(w, 'lance', 'radius'),
    damage: low + (high - low) * ratio,
    life: formStat(w, 'lance', 'life'),
    pierce: Math.max(0, Math.round(formStat(w, 'lance', 'pierce'))),
    shape: 'bar',
  };
  const [mx, my] = muzzleAt(x, y, p.aimX, p.aimY);
  spawnBullet(w, 'player', spec, mx, my, p.aimX, p.aimY);
  recoil(w, p.aimX, p.aimY, TUNING.feel.shakeEnemyKill * ratio);
}

function launchVolleyShot(w: World, p: PlayerC, x: number, y: number): void {
  const angle = Math.atan2(p.aimY, p.aimX) + w.rng.spread((formStat(w, 'volley', 'spreadDeg') * DEG) / 2);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const spec: BulletSpec = {
    speed: formStat(w, 'volley', 'speed'),
    radius: formStat(w, 'volley', 'radius'),
    damage: formStat(w, 'volley', 'damage'),
    life: formStat(w, 'volley', 'life'),
    homing: formStat(w, 'volley', 'homingDeg') * DEG,
    shape: 'diamond',
  };
  const [mx, my] = muzzleAt(x, y, dirX, dirY);
  spawnBullet(w, 'player', spec, mx, my, dirX, dirY);
  addShake(w, TUNING.feel.shakeShoot);
}
