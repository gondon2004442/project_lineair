/**
 * ВСЕ СТЕНДЫ ПОДРЯД. Один прогон перед тем, как сказать «готово».
 *
 * Запускает каждый стенд своим процессом, печатает его заметки и
 * сводит итог. Выход ненулевой, если хоть один стенд нашёл беду.
 *
 * Запуск (сначала `npm run build` и `npm run preview`):
 *   node tools/all.mjs
 *   npm run stands
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const СТЕНДЫ = [
  ['registry', 'сходимость данных', []],
  ['content', 'правки попадают в живые числа', []],
  ['determinism', 'один seed — один забег', []],
  ['review', 'проход по бедам', []],
  ['counters', 'стойки делают обещанное', []],
  ['arsenal', 'урон по формам', []],
  ['threat', 'чем опасна каждая должность', []],
  ['leaks', 'что не убирается за собой', []],
  ['overlay', 'что написано в деле', []],
  ['fullrun', 'сквозной прогон', ['4242']],
];

const пуск = (имя, аргументы) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ЗДЕСЬ, `${имя}.mjs`), ...аргументы], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let вывод = '';
    p.stdout.on('data', (d) => { вывод += d; });
    p.stderr.on('data', (d) => { вывод += d; });
    p.on('close', (код) => resolve({ код, вывод }));
  });

let бед = 0;
for (const [имя, оЧём, аргументы] of СТЕНДЫ) {
  const начало = Date.now();
  const { код, вывод } = await пуск(имя, аргументы);
  const секунд = ((Date.now() - начало) / 1000).toFixed(0);
  const итог = код === 0 ? 'ЧИСТО' : 'БЕДА';
  if (код !== 0) бед += 1;
  console.log(`\n=== ${имя}: ${оЧём} — ${итог} за ${секунд} с`);
  // Печатаем только заметки и беды: полные таблицы смотрят отдельно.
  for (const строка of вывод.split('\n')) {
    if (/беда|бед |"беды"|не сдал|не вышел|ОШИБКИ|ДЕТЕРМИНИЗМ|ИТОГО|сдаётся/i.test(строка)) {
      console.log('   ' + строка.trim());
    }
  }
}
console.log(`\nСТЕНДОВ ${СТЕНДЫ.length}, С БЕДАМИ ${бед}`);
process.exit(бед === 0 ? 0 : 1);
