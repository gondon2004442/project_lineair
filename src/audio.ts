/**
 * Звук. Никаких файлов и никаких зависимостей: всё синтезируется
 * из осциллятора и шума по рецептам из src/data/sounds.ts.
 *
 * Симуляция про звук не знает. Системы складывают имена событий
 * в w.sounds, а точка входа раз в кадр отдаёт их сюда. Поэтому
 * детерминизм забега звуком не задет.
 */
import { SOUNDS, type SoundRecipe } from './data/sounds';
import { TUNING } from './tuning';

export interface Audio {
  /** Проиграть событие по имени. Незнакомые имена молча пропускаются. */
  play(id: string): void;
  /** Браузер запускает звук только после действия пользователя. */
  resume(): void;
}

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  /** Сколько звуков уже запущено в этом кадре: защита от каши на залпах. */
  let inFrame = 0;
  let frameStamp = -1;

  const ensure = (): boolean => {
    if (ctx !== null) return true;
    const Ctor = window.AudioContext;
    if (Ctor === undefined) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);

    // Шум делается один раз и переиспользуется.
    const frames = Math.ceil(ctx.sampleRate * TUNING.audio.noiseSeconds);
    noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return true;
  };

  return {
    resume() {
      if (!ensure() || ctx === null) return;
      if (ctx.state === 'suspended') void ctx.resume();
    },

    play(id) {
      const recipe = SOUNDS[id];
      if (recipe === undefined || TUNING.audio.master <= 0) return;
      if (!ensure() || ctx === null || master === null) return;
      if (ctx.state === 'suspended') return;

      // За один кадр звуков не больше потолка: иначе дробовик и циркуляр
      // складываются в белый шум и глушат всё остальное.
      const stamp = Math.floor(ctx.currentTime * TUNING.sim.hz);
      if (stamp !== frameStamp) {
        frameStamp = stamp;
        inFrame = 0;
      }
      if (inFrame >= TUNING.audio.voicesPerFrame) return;
      inFrame += 1;

      master.gain.value = TUNING.audio.master;
      voice(ctx, master, noise, recipe);
    },
  };
}

function voice(ctx: AudioContext, out: GainNode, noise: AudioBuffer | null, r: SoundRecipe): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const attack = Math.max(0.001, r.duration * (r.attack ?? TUNING.audio.attack));
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(r.gain, now + attack);
  gain.gain.exponentialRampToValueAtTime(TUNING.audio.tailFloor, now + r.duration);
  gain.connect(out);

  if (r.source === 'noise') {
    if (noise === null) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = r.cutoff ?? TUNING.audio.defaultCutoff;
    src.connect(filter);
    filter.connect(gain);
    src.start(now);
    src.stop(now + r.duration);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = r.wave ?? 'square';
  osc.frequency.setValueAtTime(r.freq, now);
  if (r.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, r.freqEnd), now + r.duration);
  }
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + r.duration);
}
