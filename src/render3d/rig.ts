/**
 * Фигура с суставами. Таз, корпус, голова, плечи и локти, бёдра и
 * колени — каждый сустав своя точка поворота, и походка собирается из
 * поворотов, а не из растяжения куба.
 *
 * Пропорции задаёт описание: рост, ширина плеч, сутулость, насколько
 * голова ушла в плечи. Из этого и складывается силуэт должности —
 * стажёр сутулый, инспектор прямой, ревизор раздутый и без головы.
 */
import { CapsuleGeometry, Group, Mesh, SphereGeometry, BoxGeometry, type Material } from 'three';

const CAPSULE = new CapsuleGeometry(0.5, 1, 6, 14);
const SPHERE = new SphereGeometry(0.5, 18, 12);
const BOX = new BoxGeometry(1, 1, 1);

export interface RigSpec {
  /** Рост, клеток. */
  height: number;
  /** Полуширина плеч. */
  shoulder: number;
  /** Наклон корпуса вперёд, рад. */
  hunch: number;
  /** Насколько голова ушла в плечи, доля её размера. */
  headSink: number;
  /** Размер головы, множитель. Ноль — головы нет. */
  head: number;
  /** Толщина рук и ног, множитель. */
  bulk: number;
  /** Длина рук, множитель. */
  arm: number;
  /** Сидит: бёдра вперёд, голени вниз. */
  seated?: boolean;
}

export interface RigMats {
  /** Костюм: корпус, рукава, брюки. */
  suit: Material;
  /** Открытое: голова и кисти. */
  skin: Material;
  /** Обувь. */
  shoe: Material;
}

export interface RigPose {
  /** Фаза шага, рад. */
  phase: number;
  /** Размах шага 0..1. */
  amp: number;
  time: number;
  /** Правая рука вытянута к прицелу. */
  aim: boolean;
  /** Обе руки вперёд: несёт или толкает. */
  reach?: boolean;
  /** Рывок: корпус вперёд, ноги поджаты. */
  dash?: boolean;
  /** Застыл: ни шага, ни дыхания. */
  still?: boolean;
  /**
   * Куда идут ноги относительно корпуса, рад. Корпус смотрит на
   * прицел, а шагать можно вбок и назад — таз поворачивается за ходом,
   * плечи остаются на цели.
   */
  legYaw?: number;
}

export class Rig {
  readonly root = new Group();
  readonly pelvis = new Group();
  readonly torso = new Group();
  readonly head = new Group();
  readonly shoulderL = new Group();
  readonly shoulderR = new Group();
  readonly elbowL = new Group();
  readonly elbowR = new Group();
  readonly hipL = new Group();
  readonly hipR = new Group();
  readonly kneeL = new Group();
  readonly kneeR = new Group();
  /** Кисть правой руки: сюда крепится оружие или табличка. */
  readonly handR = new Group();
  readonly handL = new Group();
  readonly legLen: number;
  readonly torsoLen: number;

  constructor(readonly spec: RigSpec, mats: RigMats) {
    const H = spec.height;
    const L = H * 0.46;
    const T = H * 0.3;
    const A = H * 0.37 * spec.arm;
    const sw = spec.shoulder;
    const hw = sw * 0.5;
    const legR = H * 0.058 * spec.bulk;
    const armR = H * 0.044 * spec.bulk;
    this.legLen = L;
    this.torsoLen = T;

    this.root.add(this.pelvis);
    this.pelvis.position.y = L;
    // Таз и корпус.
    limb(this.pelvis, mats.suit, hw * 2.2, H * 0.08, sw * 0.9, 0, 0.0, 0, true);
    this.pelvis.add(this.torso);
    this.torso.rotation.x = spec.hunch;
    limb(this.torso, mats.suit, sw * 1.9, T * 0.62, sw * 1.25, 0, T * 0.5, 0, true);
    // Плечи: перекладина под воротником.
    limb(this.torso, mats.suit, sw * 2.1, H * 0.05, sw * 0.95, 0, T * 0.9, 0, true);

    // Голова.
    if (spec.head > 0) {
      const hr = H * 0.068 * spec.head;
      this.head.position.y = T + hr * (1 - spec.headSink) + H * 0.02;
      this.torso.add(this.head);
      const skull = new Mesh(SPHERE, mats.skin);
      skull.scale.set(hr * 1.8, hr * 2.1, hr * 1.9);
      skull.castShadow = true;
      this.head.add(skull);
      const neck = new Mesh(CAPSULE, mats.skin);
      neck.scale.set(hr * 0.9, hr * 0.6, hr * 0.9);
      neck.position.y = -hr * 1.0;
      this.head.add(neck);
    }

    // Руки.
    for (const [shoulder, elbow, hand, side] of [
      [this.shoulderL, this.elbowL, this.handL, -1],
      [this.shoulderR, this.elbowR, this.handR, 1],
    ] as const) {
      shoulder.position.set(side * sw, T * 0.88, 0);
      this.torso.add(shoulder);
      tube(shoulder, mats.suit, A * 0.5, armR);
      elbow.position.y = -A * 0.5;
      shoulder.add(elbow);
      tube(elbow, mats.suit, A * 0.48, armR * 0.9);
      hand.position.y = -A * 0.5;
      elbow.add(hand);
      const palm = new Mesh(SPHERE, mats.skin);
      palm.scale.set(armR * 2.2, armR * 2.6, armR * 1.6);
      palm.castShadow = true;
      hand.add(palm);
    }

    // Ноги.
    for (const [hip, knee, side] of [
      [this.hipL, this.kneeL, -1],
      [this.hipR, this.kneeR, 1],
    ] as const) {
      hip.position.set(side * hw, 0, 0);
      this.pelvis.add(hip);
      tube(hip, mats.suit, L * 0.5, legR);
      knee.position.y = -L * 0.5;
      hip.add(knee);
      tube(knee, mats.suit, L * 0.48, legR * 0.85);
      const shoe = new Mesh(SPHERE, mats.shoe);
      shoe.scale.set(legR * 1.9, legR * 1.2, legR * 3.0);
      shoe.position.set(0, -L * 0.48 + legR * 0.3, legR * 0.7);
      shoe.castShadow = true;
      knee.add(shoe);
    }
  }

  /** Поза на кадр: шаг, руки, дыхание. */
  pose(p: RigPose): void {
    const s = this.spec;
    const a = p.still === true ? 0 : p.amp;
    const sin = Math.sin(p.phase);
    const cos = Math.cos(p.phase);
    if (s.seated === true) {
      this.pelvis.position.y = 0.5;
      this.hipL.rotation.x = -Math.PI / 2;
      this.hipR.rotation.x = -Math.PI / 2;
      this.kneeL.rotation.x = Math.PI / 2;
      this.kneeR.rotation.x = Math.PI / 2;
      this.torso.rotation.x = s.hunch * 0.5;
      this.shoulderL.rotation.x = -0.7;
      this.shoulderR.rotation.x = -0.7;
      this.elbowL.rotation.x = -0.8;
      this.elbowR.rotation.x = -0.8;
      this.breathe(p);
      return;
    }
    if (p.dash === true) {
      // Рывок: корпус вперёд, одна нога выброшена, другая поджата.
      this.pelvis.position.y = this.legLen * 0.92;
      this.torso.rotation.x = s.hunch + 0.45;
      this.hipL.rotation.x = -0.9;
      this.kneeL.rotation.x = 1.1;
      this.hipR.rotation.x = 0.7;
      this.kneeR.rotation.x = 0.6;
      this.shoulderL.rotation.x = 0.9;
      this.shoulderR.rotation.x = p.aim ? -1.3 : 0.9;
      this.elbowL.rotation.x = -0.4;
      this.elbowR.rotation.x = -0.2;
      return;
    }
    // Шаг: бедро вперёд-назад, колено гнётся на проносе, таз подпрыгивает.
    this.hipL.rotation.x = -sin * 0.55 * a;
    this.hipR.rotation.x = sin * 0.55 * a;
    this.kneeL.rotation.x = Math.max(0, sin) * 0.9 * a + 0.05;
    this.kneeR.rotation.x = Math.max(0, -sin) * 0.9 * a + 0.05;
    this.pelvis.position.y = this.legLen * (1 - 0.03 * a) + Math.abs(cos) * 0.035 * a;
    const legYaw = p.legYaw ?? 0;
    this.pelvis.rotation.y = legYaw + sin * 0.12 * a;
    this.torso.rotation.x = s.hunch + 0.08 * a;
    this.torso.rotation.y = -legYaw - sin * 0.1 * a;
    // Руки идут против ног.
    this.shoulderL.rotation.x = sin * 0.45 * a;
    this.elbowL.rotation.x = -0.15 - Math.max(0, sin) * 0.4 * a;
    this.shoulderL.rotation.z = -0.08;
    if (p.aim) {
      // Правая — к прицелу; локоть почти прямой, кисть на уровне плеча.
      this.shoulderR.rotation.x = -Math.PI / 2 + 0.08 - s.hunch;
      this.shoulderR.rotation.z = 0.12;
      this.elbowR.rotation.x = -0.08;
    } else {
      this.shoulderR.rotation.x = -sin * 0.45 * a;
      this.shoulderR.rotation.z = 0.08;
      this.elbowR.rotation.x = -0.15 - Math.max(0, -sin) * 0.4 * a;
    }
    if (p.reach === true) {
      this.shoulderL.rotation.x = -1.1;
      this.shoulderR.rotation.x = -1.1;
      this.elbowL.rotation.x = -0.5;
      this.elbowR.rotation.x = -0.5;
    }
    this.breathe(p);
  }

  private breathe(p: RigPose): void {
    if (p.still === true) return;
    const b = Math.sin(p.time * 2.1) * 0.012;
    this.torso.scale.set(1 + b * 0.5, 1 + b, 1 + b * 0.5);
  }
}

/** Сегмент руки или ноги: капсула, висящая вниз от сустава. */
function tube(parent: Group, mat: Material, len: number, r: number): Mesh {
  const mesh = new Mesh(CAPSULE, mat);
  mesh.scale.set(r * 2, len / 2, r * 2);
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function limb(parent: Group, mat: Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, capsule: boolean): Mesh {
  const mesh = new Mesh(capsule ? CAPSULE : BOX, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
