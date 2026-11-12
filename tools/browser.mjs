/**
 * Где взять браузер и как его завести. Отдельным файлом, потому что
 * путь к chromium в контейнере меняется от сборки к сборке, а стенды
 * не должны об этом знать.
 *
 * playwright в зависимости проекта не входит: игра его не требует, он
 * нужен только стендам. Берётся тот, что стоит в системе; если его нет,
 * стенд честно скажет, что ставить.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require_ = createRequire(path.join(process.cwd(), 'x.js'));

/** Исполняемый файл chromium, если он лежит рядом с playwright. */
function браузерВСистеме() {
  const корень = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!fs.existsSync(корень)) return undefined;
  const папки = fs
    .readdirSync(корень)
    .filter((n) => n.startsWith('chromium-'))
    .sort();
  for (const папка of папки.reverse()) {
    for (const ветка of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const файл = path.join(корень, папка, ветка);
      if (fs.existsSync(файл)) return файл;
    }
  }
  return undefined;
}

export async function открытьБраузер() {
  let chromium;
  try {
    ({ chromium } = require_('playwright'));
  } catch {
    throw new Error(
      'Нет playwright. Стенды его требуют, игра — нет: поставь его рядом ' +
        '(npm i -g playwright) или запускай стенды оттуда, где он уже стоит.',
    );
  }
  const executablePath = браузерВСистеме();
  return await chromium.launch(executablePath === undefined ? {} : { executablePath });
}

/** Открытая страница игры со счётчиком ошибок на ней. */
export async function открытьИгру(адрес, размер) {
  const browser = await открытьБраузер();
  const context = await browser.newContext({
    viewport: размер ?? { width: 1280, height: 760 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // Приватное окно: нечего чистить.
    }
  });
  await page.goto(адрес, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.click('canvas');
  return { browser, page, errors };
}
