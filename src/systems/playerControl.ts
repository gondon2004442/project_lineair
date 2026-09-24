/**
 * Прицел, разгон, рывок и стрельба субъекта.
 * Формы оружия переключаются колесом, у каждой своя обойма.
 * Перезарядка по R или сама, когда патронов на выстрел не хватило.
 */
import { WEAPON_FORMS } from '../data/weaponForms';
import type { Health, PlayerC, World } from '../ecs';
import { spawnBullet, type BulletSpec } from '../spawn';
import { DEG, TUNING } from '../tuning';
import { ammoMax, formStat } from '../weapon';
import { addShake } from './damage';

/**
 * Числа рывка в текущей схеме.
 *
 * Схема 0 «МИГАНИЕ» — то, что было: 110 px за 50 мс и окно неуязвимости
 * в два с половиной раза длиннее самого движения. Платить за такой
 * рывок нечем, поэтому жать его выгодно всегда.
 *
 * Схема 1 «ПЕРЕКАТ» — движение, а не телепорт: окно закрывается на
 * середине, вторую половину субъект едет уязвимым и ничего не может
 * сделать, кроме как отменить хвост выстрелом.
 *
 * Обе живут одновременно и переключаются на ходу: сравнивать ощущение
 * надо руками, а не по числам на бумаге.
 */
export interface DashSpec {
  mode: number;
  distance: number;
  duration: number;
  cooldown: number;
  iframesStart: number;
  iframesEnd: number;
  exitFactor: number;
  turnLock: boolean;
  cancelAfter: number;
}

export function dashSpec(): DashSpec {
  const cfg = TUNING.player;
  if (Math.round(cfg.dashMode) === 0) {
    return {
      mode: 0,
      distance: cfg.dashDistance,
      duration: cfg.dashDuration,
      cooldown: cfg.dashCooldown,
      iframesStart: 0,
      iframesEnd: cfg.dashIFrames,
      exitFactor: cfg.dashExitFactor,
      turnLock: true,
      cancelAfter: 0,
    };
  }
  return {
    mode: 1,
    distance: cfg.rollDistance,
    duration: cfg.rollDuration,
    cooldown: cfg.rollCooldown,
    iframesStart: cfg.rollIFramesStart,
    iframesEnd: cfg.rollIFramesEnd,
    exitFactor: cfg.rollExitFactor,
    turnLock: cfg.rollTurnLock > 0,
    cancelAfter: cfg.rollCancelAfter,
  };
}

/** Длина окна неуязвимости рывка в текущей схеме. */
export function dashIFrameWindow(): number {
  const spec = dashSpec();
  return Math.max(0, spec.iframesEnd - spec.iframesStart);
}

/** Сколько игрового времени живёт непринятое нажатие. */
function bufferTime(): number {
  return Math.max(0, TUNING.player.inputBufferMs) / 1000;
}

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
  reloadTick(w, p, dt);

  if (w.input.formStep !== 0 && p.switchCooldown <= 0) {
    const count = WEAPON_FORMS.length;
    p.form = (((p.form + w.input.formStep) % count) + count) % count;
    p.switchCooldown = TUNING.weapon.switchCooldown;
    // Незавершённые заряд, залп и перезарядка при смене формы сбрасываются.
    p.charge = 0;
    p.queued = 0;
    p.reloading = false;
    p.reloadTimer = 0;
  }
  w.input.formStep = 0;

  const spec = dashSpec();
  const buffer = bufferTime();

  // Перезарядка из буфера: нажатие не пропадает, если оно пришло на
  // полной обойме или во время другой перезарядки.
  if (w.input.reloadQueued) {
    if (startReload(w, p)) {
      w.input.reloadQueued = false;
      w.input.reloadAge = 0;
    } else {
      w.input.reloadAge += dt;
      if (w.input.reloadAge > buffer) {
        w.input.reloadQueued = false;
        w.input.reloadAge = 0;
      }
    }
  }

  // Рывок из буфера: нажатие за десяток миллисекунд до готовности
  // раньше просто пропадало, и это читалось как «игра не слушается».
  if (w.input.dashQueued) {
    if (p.phase === 'normal' && p.dashCooldown <= 0) {
      w.input.dashQueued = false;
      w.input.dashAge = 0;
      startDash(w, p, h, spec);
    } else {
      w.input.dashAge += dt;
      if (w.input.dashAge > buffer) {
        w.input.dashQueued = false;
        w.input.dashAge = 0;
      }
    }
  }

  if (p.phase === 'dash') {
    const elapsed = Math.max(0, spec.duration - p.dashTime);

    // Окно неуязвимости держится ровно между началом и концом. В схеме 0
    // конец дальше длительности, поэтому ведёт она себя как раньше.
    if (elapsed >= spec.iframesStart && elapsed < spec.iframesEnd) {
      h.iframes = Math.max(h.iframes, spec.iframesEnd - elapsed);
    }

    // Без защёлки перекат слушается ввода и правит направление на ходу.
    if (!spec.turnLock && (w.input.moveX !== 0 || w.input.moveY !== 0)) {
      const len = Math.hypot(w.input.moveX, w.input.moveY) || 1;
      p.dashX = w.input.moveX / len;
      p.dashY = w.input.moveY / len;
    }

    const dashSpeed = spec.duration > 0 ? spec.distance / spec.duration : 0;
    b.vx = p.dashX * dashSpeed;
    b.vy = p.dashY * dashSpeed;
    p.dashTime -= dt;

    // Отмена хвоста: во второй, уязвимой половине выстрел прерывает
    // перекат. Это и есть мастерство — выйти раньше, чем кончится
    // анимация, заплатив за это тем, что вышел на открытом месте.
    const cancelAt = spec.cancelAfter > 0 ? spec.duration * spec.cancelAfter : Infinity;
    const wantsFire = w.input.fireHeld || w.input.firePressed;
    const cancelled = wantsFire && elapsed >= cancelAt;

    if (p.dashTime > 0 && !cancelled) return;

    p.phase = 'normal';
    p.dashTime = 0;
    b.vx = p.dashX * dashSpeed * spec.exitFactor;
    b.vy = p.dashY * dashSpeed * spec.exitFactor;
    // Обычный выход тратит шаг целиком, отменённый — продолжает его:
    // ради этого отмену и делали.
    if (!cancelled) return;
  }

  // Асимметрия разворота: резкий разворот на месте стоит мгновения,
  // движение по дуге — ничего. Вес появляется, точность не страдает.
  p.turnLock = Math.max(0, p.turnLock - dt);
  const moveLen = Math.hypot(w.input.moveX, w.input.moveY);
  const speedNow = Math.hypot(b.vx, b.vy);
  if (moveLen > 0 && speedNow >= TUNING.player.turnMinSpeed) {
    const cos = (w.input.moveX * b.vx + w.input.moveY * b.vy) / (moveLen * speedNow);
    const turn = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
    if (turn >= TUNING.player.turnAngleDeg) p.turnLock = TUNING.player.turnLockMs / 1000;
  }

  const targetVx = w.input.moveX * TUNING.player.speed;
  const targetVy = w.input.moveY * TUNING.player.speed;
  const idle = w.input.moveX === 0 && w.input.moveY === 0;
  const accel = TUNING.player.accel * (p.turnLock > 0 ? TUNING.player.turnAccelFactor : 1);
  const rate = (idle ? TUNING.player.friction : accel) * dt;
  b.vx = approach(b.vx, targetVx, rate);
  b.vy = approach(b.vy, targetVy, rate);

  fireSystem(w, p, t.x, t.y, dt);
}

/** Начать рывок по числам текущей схемы. */
function startDash(w: World, p: PlayerC, h: Health, spec: DashSpec): void {
  const hasMove = w.input.moveX !== 0 || w.input.moveY !== 0;
  const dx = hasMove ? w.input.moveX : p.aimX;
  const dy = hasMove ? w.input.moveY : p.aimY;
  const len = Math.hypot(dx, dy) || 1;
  p.dashX = dx / len;
  p.dashY = dy / len;
  p.phase = 'dash';
  w.sounds.push('dash');
  p.dashTime = spec.duration;
  // Выслуга укорачивает кулдаун рывка: контора доверяет проверенным.
  const rec = TUNING.record;
  const cut = Math.min(rec.serviceCooldownCap, w.record.service * rec.serviceCooldownStep);
  p.dashCooldown = spec.cooldown * (1 - cut);
  // Окно, открытое с первого кадра, выставляется разом: так вела себя
  // схема 0, и её поведение трогать нельзя — она эталон для сравнения.
  if (spec.iframesStart <= 0) h.iframes = Math.max(h.iframes, spec.iframesEnd);
}

function reloadTick(w: World, p: PlayerC, dt: number): void {
  if (!p.reloading) return;
  p.reloadTimer -= dt;
  if (p.reloadTimer > 0) return;
  const form = WEAPON_FORMS[p.form];
  p.reloading = false;
  p.reloadTimer = 0;
  if (form === undefined) return;
  // Перезарядка не создаёт патроны, а переносит их из запаса. Сколько в
  // запасе есть — столько и уйдёт в обойму.
  const need = ammoMax(w, form.id) - Math.max(0, p.ammo[p.form] ?? 0);
  const take = Math.max(0, Math.min(need, Math.floor(p.reserve[p.form] ?? 0)));
  p.ammo[p.form] = Math.max(0, p.ammo[p.form] ?? 0) + take;
  p.reserve[p.form] = Math.max(0, (p.reserve[p.form] ?? 0) - take);
}

/** Начать перезарядку текущей формы. Полная обойма — не повод. */
export function startReload(w: World, p: PlayerC): boolean {
  const form = WEAPON_FORMS[p.form];
  if (form === undefined || p.reloading) return false;
  if ((p.ammo[p.form] ?? 0) >= ammoMax(w, form.id)) return false;
  // Пустой запас — перезаряжать нечем. Это и заставляет крутить колесо.
  if ((p.reserve[p.form] ?? 0) <= 0) return false;
  p.reloading = true;
  w.sounds.push('reload');
  p.reloadTimer = formStat(w, form.id, 'reloadTime');
  // Недобранный заряд и недострелянный залп перезарядка отменяет.
  p.charge = 0;
  p.queued = 0;
  return true;
}

function fireSystem(w: World, p: PlayerC, x: number, y: number, dt: number): void {
  const form = WEAPON_FORMS[p.form];
  if (form === undefined || w.status === 'dead' || p.reloading) return;

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
    // Не набираем заряд впустую: пустая обойма уходит в перезарядку сразу.
    if (w.input.fireHeld && (p.ammo[p.form] ?? 0) < Math.max(0, formStat(w, 'lance', 'cost'))) {
      p.charge = 0;
      startReload(w, p);
      return;
    }
    if (w.input.fireHeld) {
      p.charge = Math.min(formStat(w, 'lance', 'chargeTime'), p.charge + dt);
      return;
    }
    if (p.charge > 0) {
      const charge = p.charge;
      p.charge = 0;
      if (charge >= formStat(w, 'lance', 'minCharge') && spend(w, p, 'lance')) {
        w.sounds.push('shot.lance');
        launchLance(w, p, x, y, charge);
      }
    }
    return;
  }

  // Одиночное нажатие тоже ждёт своей очереди: тап короче паузы между
  // выстрелами раньше пропадал целиком.
  const wantsFire = w.input.fireHeld || w.input.firePressed;
  if (!wantsFire || p.fireCooldown > 0) {
    if (w.input.firePressed) {
      w.input.fireAge += dt;
      if (w.input.fireAge > bufferTime()) {
        w.input.firePressed = false;
        w.input.fireAge = 0;
      }
    }
    return;
  }
  w.input.firePressed = false;
  w.input.fireAge = 0;

  switch (form.id) {
    case 'precise':
      if (!spend(w, p, 'precise')) return;
      p.fireCooldown = formStat(w, 'precise', 'interval');
      w.sounds.push('shot.precise');
      launchPrecise(w, p, x, y);
      break;
    case 'scatter':
      if (!spend(w, p, 'scatter')) return;
      p.fireCooldown = formStat(w, 'scatter', 'interval');
      w.sounds.push('shot.scatter');
      launchScatter(w, p, x, y);
      break;
    case 'volley':
      if (!spend(w, p, 'volley')) return;
      p.fireCooldown = formStat(w, 'volley', 'interval');
      w.sounds.push('shot.volley');
      p.queued = Math.max(1, Math.round(formStat(w, 'volley', 'count')));
      p.queueTimer = 0;
      break;
  }
}

/** Списать патроны. Не хватило — уходим в перезарядку вместо выстрела. */
function spend(w: World, p: PlayerC, formId: string): boolean {
  const index = WEAPON_FORMS.findIndex((form) => form.id === formId);
  if (index < 0) return false;
  const cost = Math.max(0, formStat(w, formId, 'cost'));
  const have = p.ammo[index] ?? 0;
  if (have < cost) {
    startReload(w, p);
    return false;
  }
  p.ammo[index] = have - cost;
  return true;
}

function muzzleAt(x: number, y: number, dirX: number, dirY: number): [number, number] {
  return [x + dirX * TUNING.weapon.muzzle, y + dirY * TUNING.weapon.muzzle];
}

function recoil(w: World, dirX: number, dirY: number, shake: number): void {
  const b = w.body.get(w.player);
  if (b !== undefined) {
    // Отдача на форму: дробовая толкает втрое, и выстрел назад становится
    // способом разорвать дистанцию, а не только уроном.
    const form = WEAPON_FORMS[w.playerC.get(w.player)?.form ?? 0];
    const kick = TUNING.player.recoil * formStat(w, form?.id ?? 'precise', 'recoilFactor');
    b.vx -= dirX * kick;
    b.vy -= dirY * kick;
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
  // Залповая тоже отдаёт, хоть и слабее всех: раз отдача стала
  // позиционным инструментом, форма без неё выпадала бы из правила.
  recoil(w, dirX, dirY, TUNING.feel.shakeShoot);
}
