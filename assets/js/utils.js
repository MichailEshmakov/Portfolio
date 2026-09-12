/* Мелкие утилиты: приведение текста, разбор перечислений, числа.
   Ни от чего, кроме настроек, не зависят. */

import { CONFIG } from './config.js';

export const $ = (sel) => document.querySelector(sel);

export const YEAR_RE = /^(19|20)\d{2}(\s*(год|г\.?))?$/i;
export const URL_RE = /https?:\/\/[^\s,;"'<>()]+/g;
export const HAS_URL = /https?:\/\//i;

/** Приводит строку к виду, по которому удобно сравнивать названия колонок. */
export function norm(s) {
  return String(s == null ? '' : s)
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[-–—]+/g, ' ')
    .replace(/[\s\t]+/g, ' ')
    .replace(/[:：.]+$/, '')
    .trim();
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Разбивает ячейку-перечисление на отдельные значения. */
export function splitList(value) {
  return String(value || '')
    .split(/[,;/|\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Значение перечисления для показа: первое слово с большой буквы,
    остальное — как в таблице, чтобы не испортить «C#», «2D» и «HTML5». */
function capitalize(value) {
  const v = String(value || '').trim();
  return v ? v[0].toLocaleUpperCase('ru') + v.slice(1) : v;
}

/* Одно и то же значение в таблице встречается в разном регистре
   («Unity», «unity», «UNITY»). Фильтры сравнивают значения без регистра,
   поэтому в списках такое значение должно быть одно и с одним написанием:
   для каждого значения выбираем самое частое в таблице написание
   и пишем его с большой буквы. */
const labels = new Map();        // значение без регистра → как показываем

export function collectLabels(games) {
  const votes = new Map();
  games.forEach((game) => game.fields.forEach((field) => {
    if (!CONFIG.chipFields.includes(field.role)) return;
    splitList(field.value).forEach((raw) => {
      const key = norm(raw);
      if (!key) return;
      const spellings = votes.get(key) || new Map();
      spellings.set(raw, (spellings.get(raw) || 0) + 1);
      votes.set(key, spellings);
    });
  }));

  labels.clear();
  votes.forEach((spellings, key) => {
    // при равной частоте остаётся написание, встреченное в таблице первым
    const best = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    labels.set(key, capitalize(best));
  });
}

/** Как показать значение перечисления — одинаково в чипсах и в фильтрах. */
export function labelOf(raw) {
  return labels.get(norm(raw)) || capitalize(raw);
}

export function extractUrls(value) {
  return String(value || '').match(URL_RE) || [];
}

export function prettyUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

/** Стабильный цвет карточки по названию — чтобы список не был одноцветным. */
export function hueOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

/** Оценка важности из ячейки: «4», «4,5», «5/5» → число. Пусто → null. */
export function parseScore(value) {
  const match = String(value == null ? '' : value).replace(',', '.').match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/** Число для показа: 4 → «4», 4.5 → «4,5». */
export function showNumber(n) {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
