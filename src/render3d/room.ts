/**
 * Помещение в объёме: что отдаёт сборщик рендеру. Собирается из тайлмапа
 * один раз на вход и на каждый щелчок замка — как запекался бетон в
 * плоском виде.
 *
 * Вестибюль собирается своим сборщиком (lobby.ts), участки этажей —
 * общим, по теме уровня (dressed.ts).
 */
import type { Group, Mesh, Object3D } from 'three';
import type { World } from '../ecs';
import { buildDressed } from './dressed';
import { buildLobby } from './lobby';
import type { Materials } from './materials';

export interface Lamp {
  x: number;
  z: number;
  /** Мигает: свет, луч и пятно гаснут вместе. */
  flicker: boolean;
  /** Горит на тёмном уровне: решение берётся хешем, как в плоском виде. */
  darkLit: boolean;
  beam: Mesh;
  pool: Mesh;
  panel: Mesh;
}

/**
 * Свет, который помещение задаёт само. Пусто — общий ключевой свет из
 * крутилок «ВИД 3D».
 */
export interface RoomLook {
  /** Солнце за окнами вместо общего ключевого света. */
  sun: { az: number; el: number; intensity: number; color: number };
  sky: number;
  env: number;
  exposure: number;
  /** Цвет неба и пола для рассеянного света. */
  skyColor?: number;
  groundColor?: number;
  /** Цвет пустоты вокруг помещения и дымки. */
  voidColor?: number;
  fog?: number;
  /** Сила зеркала пола. */
  reflect?: number;
  /** Лампы помещения светят пулом точечного света. */
  lamps?: boolean;
  /** Множитель свечения. */
  bloom?: number;
}

export interface RoomView {
  group: Group;
  /** Лучи и пятна света: рисуются отдельным проходом, мимо затенения углов. */
  fx: Group;
  lamps: Lamp[];
  warm: boolean;
  /** Полы: их прячут, когда снимают отражение. */
  floors: Mesh[];
  /** То, чего не должно быть в буфере затенения углов. */
  aoHidden: Object3D[];
  /** Читается каждый кадр: крутилки меняют свет на живую. */
  look?: () => RoomLook;
  /** Живое помещения: часы, мерцание экрана, ветер в листьях. */
  tick?(time: number): void;
  dispose(): void;
}

export function buildRoom(w: World, m: Materials): RoomView {
  return w.scene === 'lobby' ? buildLobby(w, m) : buildDressed(w, m);
}
