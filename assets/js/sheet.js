/* Таблица: разбор CSV и её загрузка.
   Порядок источников: живая таблица → прошлая удачная загрузка из
   localStorage → запасная копия, лежащая в папке сайта. */

import { CONFIG } from './config.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }

  row.push(field);
  rows.push(row);

  return rows.map((r) => r.map((c) => c.replace(/ /g, ' ').trim()));
}

function sheetUrls() {
  const bust = '_=' + Date.now();
  const base = 'https://docs.google.com/spreadsheets/d/' + CONFIG.sheetId;
  return [
    base + '/export?format=csv&gid=' + CONFIG.gid + '&' + bust,
    base + '/gviz/tq?tqx=out:csv&headers=0&gid=' + CONFIG.gid + '&' + bust,
  ];
}

/** Откуда взялись данные: 'sheet' — живая таблица, 'cache' — прошлая удачная
    загрузка у этого посетителя, 'local' — копия, лежащая в самой папке сайта. */
export async function loadCsv() {
  let lastError = null;

  for (const url of sheetUrls()) {
    try {
      const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text.trim()) throw new Error('пустой ответ');
      try {
        localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ at: Date.now(), text }));
      } catch { /* приватный режим — просто без кэша */ }
      return { text, source: 'sheet' };
    } catch (err) {
      lastError = err;
    }
  }

  try {
    const raw = localStorage.getItem(CONFIG.cacheKey);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.text && saved.text.trim()) {
        return { text: saved.text, source: 'cache', at: saved.at, error: lastError };
      }
    }
  } catch { /* нет кэша */ }

  try {
    const res = await fetch(CONFIG.localCsv, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text.trim()) throw new Error('пустой файл');
    const at = Date.parse(res.headers.get('last-modified') || '');
    return { text, source: 'local', at: Number.isNaN(at) ? null : at, error: lastError };
  } catch { /* нет и копии в папке — значит показываем ошибку */ }

  throw lastError || new Error('не удалось загрузить таблицу');
}

/** Адрес самой таблицы — для ссылки в подвале и в сообщении об ошибке. */
export function sheetHref() {
  return 'https://docs.google.com/spreadsheets/d/' + CONFIG.sheetId + '/edit#gid=' + CONFIG.gid;
}
