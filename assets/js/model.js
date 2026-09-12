/* Понимание таблицы: где строка с названиями колонок, что за колонки,
   где строки-разделители с годом. Отсюда выходит модель — список игр,
   с которым дальше работает вся страница. */

import { CONFIG } from './config.js';
import { parseCsv } from './sheet.js';
import {
  norm, splitList, extractUrls, prettyUrl, parseScore, hueOf, HAS_URL, YEAR_RE,
} from './utils.js';
import { asImage, optimisticImage, localImages, imagePath } from './images.js';

/** Совпадает ли заголовок колонки с синонимом — целиком или по слову. */
function headerMatches(header, alias, strictness) {
  const h = norm(header);
  const a = norm(alias);
  if (!h || !a) return false;
  if (strictness === 'exact') return h === a;
  if (strictness === 'edge') return h.startsWith(a) || a.startsWith(h);
  return h.split(/[^a-zа-я0-9#+]+/i).some(
    (w) => w.length >= 2 && (w.startsWith(a) || (a.startsWith(w) && w.length >= 3))
  );
}

function looksLikeHeaderCell(cell) {
  for (const aliases of Object.values(CONFIG.columns)) {
    for (const alias of aliases) {
      if (headerMatches(cell, alias, 'exact') || headerMatches(cell, alias, 'word')) return true;
    }
  }
  return false;
}

/** Ищет строку с названиями колонок: сначала по знакомым словам, потом по плотности. */
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 50);
  let best = { score: 0, index: -1 };

  for (let i = 0; i < limit; i++) {
    const score = rows[i].filter((c) => c && looksLikeHeaderCell(c)).length;
    if (score > best.score) best = { score, index: i };
  }
  if (best.score >= 2) return best.index;

  for (let i = 0; i < limit; i++) {
    if (rows[i].filter((c) => c.trim()).length >= 4) return i;
  }
  return 0;
}

/** Сопоставляет колонки ролям: сначала точные совпадения, потом всё более мягкие. */
function mapColumns(headerRow) {
  const roleOf = {};   // индекс колонки -> роль
  const indexOf = {};  // роль -> индекс колонки

  for (const strictness of ['exact', 'edge', 'word']) {
    for (const [role, aliases] of Object.entries(CONFIG.columns)) {
      if (indexOf[role] !== undefined) continue;
      for (let col = 0; col < headerRow.length; col++) {
        if (roleOf[col] || !headerRow[col]) continue;
        if (aliases.some((a) => headerMatches(headerRow[col], a, strictness))) {
          roleOf[col] = role;
          indexOf[role] = col;
          break;
        }
      }
    }
  }
  return { roleOf, indexOf };
}

/** Строки над шапкой: «подпись + ссылка» превращаем в ссылки для шапки сайта. */
function readMetaLinks(rows, headerIndex) {
  const links = [];
  const seen = new Set();

  for (let i = 0; i < headerIndex; i++) {
    const cells = rows[i].filter((c) => c.trim());
    if (!cells.length) continue;

    const urls = cells.flatMap(extractUrls);
    if (!urls.length) continue;

    const label = cells.find((c) => c.trim() && !HAS_URL.test(c)) || '';

    urls.forEach((url, n) => {
      if (seen.has(url)) return;
      seen.add(url);
      links.push({ label: (n === 0 && label) ? label : prettyUrl(url), url });
    });
  }
  return links;
}

/** Значения игры по каждому фильтру-списку: «Steam, Яндекс Игры» -> два значения. */
function pickValues(byRole) {
  const picks = {};
  CONFIG.pickFilters.forEach((f) => { picks[f.id] = splitList(byRole[f.role] || ''); });
  return picks;
}

/** Содержательные колонки: если хоть одна заполнена — это игра, а не разделитель года. */
const CONTENT_ROLES = ['genre', 'desc', 'role', 'platform', 'play', 'tech', 'tags', 'goal'];

/** Возвращает год, если строка — разделитель вроде «2025», иначе null. */
function detectYearRow(cells, titleCol, roleOf) {
  const filled = cells
    .map((c, i) => ({ col: i, value: c.trim() }))
    .filter((c) => c.value);

  if (!filled.length) return null;

  const single = filled.length === 1 && YEAR_RE.test(filled[0].value);
  const inTitle = YEAR_RE.test(cells[titleCol] || '') &&
    !filled.some((c) => CONTENT_ROLES.includes(roleOf[c.col]));

  if (!single && !inTitle) return null;
  const match = (single ? filled[0].value : cells[titleCol]).match(/(19|20)\d{2}/);
  return match ? match[0] : null;
}

export function buildModel(csvText, folderImages) {
  const rows = parseCsv(csvText);
  const headerIndex = findHeaderRow(rows);
  const header = rows[headerIndex] || [];
  const { roleOf, indexOf } = mapColumns(header);
  const titleCol = indexOf.title !== undefined ? indexOf.title : 0;

  const games = [];
  let currentYear = '';

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells.some((c) => c.trim())) continue;

    // Строка-разделитель года: либо единственная ячейка «2025», либо год в колонке
    // названия при пустых содержательных колонках (пометки сбоку не мешают).
    const yearRow = detectYearRow(cells, titleCol, roleOf);
    if (yearRow) { currentYear = yearRow; continue; }

    const title = (cells[titleCol] || '').trim();
    if (!title) continue;

    // Поля идут в том же порядке, в каком колонки стоят в таблице.
    const fields = [];
    for (let col = 0; col < Math.max(cells.length, header.length); col++) {
      const value = (cells[col] || '').trim();
      if (!value || col === titleCol) continue;
      fields.push({
        col,
        role: roleOf[col] || null,
        label: (header[col] || '').trim() || 'Поле ' + (col + 1),
        value,
      });
    }

    const byRole = {};
    fields.forEach((f) => { if (f.role && byRole[f.role] === undefined) byRole[f.role] = f.value; });

    const ownYear = (byRole.year || '').match(/(19|20)\d{2}/);
    const year = ownYear ? ownYear[0] : currentYear;

    const rated = parseScore(byRole.score);

    // Сначала колонка со скринами (там показываем всё, что есть),
    // потом картинки, случайно попавшие в остальные колонки.
    const images = [];
    const shots = fields.find((f) => f.role === 'shots');
    const ordered = shots ? [shots, ...fields.filter((f) => f !== shots)] : fields;
    const add = (src, url) => {
      if (src && !images.some((i) => i.src === src)) images.push({ src, url: url || src });
    };

    ordered.forEach((f) => {
      extractUrls(f.value).forEach((url) => {
        add(f.role === 'shots' ? optimisticImage(url) : asImage(url), url);
      });
      if (f.role === 'shots') localImages(f.value).forEach((src) => add(src));
    });

    // Картинки, которые лежат в папке сайта: иконка отдельно, скрины — в галерею.
    const folder = (folderImages && folderImages.get(norm(title))) || null;
    if (folder) folder.shots.forEach((name) => add(imagePath(name)));


    games.push({
      title,
      year,
      fields,
      byRole,
      images,
      icon: folder && folder.icon ? imagePath(folder.icon) : '',
      hue: hueOf(title),
      order: games.length,          // порядок строк в таблице — он же порядок по дате
      score: rated === null ? CONFIG.scoreWhenMissing : rated,
      rated: rated !== null,        // оценка стоит в таблице, а не подставлена
      picks: pickValues(byRole),
      genres: splitList(byRole[CONFIG.filterField] || byRole[CONFIG.filterFallback] || ''),
      // в поиск попадает всё, включая спрятанные поля
      search: norm([title, year, ...fields.map((f) => f.value)].join(' ')),
    });
  }

  return { games, links: readMetaLinks(rows, headerIndex), headerIndex, header, indexOf };
}
