/**
 * Чтение PNG без зависимостей: стендам нужно считать пиксели, а тащить
 * ради этого библиотеку в проект, где их две, нельзя.
 *
 * Понимает то, что отдаёт браузерный снимок: 8 бит на канал, RGB или
 * RGBA, без чересстрочности.
 */
import zlib from 'node:zlib';

/** Разобрать PNG в { width, height, rgb } — по три байта на точку. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('это не PNG');
  let at = 8;
  let width = 0, height = 0, depth = 0, colour = 0;
  const части = [];
  while (at < buffer.length) {
    const длина = buffer.readUInt32BE(at);
    const тип = buffer.toString('ascii', at + 4, at + 8);
    const тело = buffer.subarray(at + 8, at + 8 + длина);
    if (тип === 'IHDR') {
      width = тело.readUInt32BE(0);
      height = тело.readUInt32BE(4);
      depth = тело.readUInt8(8);
      colour = тело.readUInt8(9);
      if (depth !== 8) throw new Error(`глубина ${depth} не поддерживается`);
      if (colour !== 2 && colour !== 6) throw new Error(`тип цвета ${colour} не поддерживается`);
      if (тело.readUInt8(12) !== 0) throw new Error('чересстрочный PNG не поддерживается');
    } else if (тип === 'IDAT') {
      части.push(тело);
    } else if (тип === 'IEND') {
      break;
    }
    at += длина + 12;
  }
  const каналов = colour === 6 ? 4 : 3;
  const сырое = zlib.inflateSync(Buffer.concat(части));
  const строка = width * каналов;
  const rgb = Buffer.alloc(width * height * 3);
  const прошлая = Buffer.alloc(строка);
  const текущая = Buffer.alloc(строка);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const фильтр = сырое[p];
    p += 1;
    сырое.copy(текущая, 0, p, p + строка);
    p += строка;
    // Развёртка фильтров PNG: каждая строка считается от предыдущей.
    for (let i = 0; i < строка; i++) {
      const a = i >= каналов ? текущая[i - каналов] : 0;
      const b = прошлая[i];
      const c = i >= каналов ? прошлая[i - каналов] : 0;
      let v = текущая[i];
      if (фильтр === 1) v += a;
      else if (фильтр === 2) v += b;
      else if (фильтр === 3) v += (a + b) >> 1;
      else if (фильтр === 4) {
        const p0 = a + b - c;
        const pa = Math.abs(p0 - a), pb = Math.abs(p0 - b), pc = Math.abs(p0 - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      текущая[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const из = x * каналов;
      const в = (y * width + x) * 3;
      rgb[в] = текущая[из];
      rgb[в + 1] = текущая[из + 1];
      rgb[в + 2] = текущая[из + 2];
    }
    текущая.copy(прошлая);
  }
  return { width, height, rgb };
}

/** Светлота по Rec.709: ею меряется всё, что про «темнее — светлее». */
export function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
