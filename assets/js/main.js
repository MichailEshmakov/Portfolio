/* ===========================================================================
   Портфолио — данные берутся напрямую из Google-таблицы при каждой загрузке
   страницы. Скрипт не знает заранее ни номера строки с шапкой, ни порядка
   колонок: он находит шапку сам и сопоставляет колонки по названиям.
   Поэтому таблицу можно двигать вниз, вставлять года в середину и
   добавлять/убирать столбцы — сайт подстроится.

   На странице таблицы нет: каждая игра — карточка, внутри неё поля
   «название поля → значение». Появилась в таблице новая колонка —
   в карточках появилась новая строка. Пропала колонка — строка пропала.
   =========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   1. Настройки. Почти всё, что захочется поменять, живёт здесь.
   -------------------------------------------------------------------------- */

const CONFIG = {
  sheetId: '1nLEEhJkWVQu3oMntNVr1hYLYvCDsXhqsOMU-S9Au9KM',
  gid: '0',

  /* Ссылки, которых нет в таблице. Остальные подтягиваются из строк
     над шапкой: текст в одной ячейке + ссылка в соседней. */
  fixedLinks: [
    { label: 'Telegram', url: 'https://t.me/MikhailAllowsHimself', primary: true },
  ],

  /* Названия колонок. Сравнение нестрогое: регистр, ё/е и лишние пробелы
     не важны, достаточно совпадения по слову («Моя роль» → роль).
     Роли нужны только для оформления: по ним понятно, что показать
     чипсами, что кнопкой, где искать жанры и картинки.
     Колонка, которой тут нет, всё равно попадёт в карточку —
     просто обычной строкой «название → значение». */
  columns: {
    title:    ['игра', 'название', 'проект', 'game', 'title'],
    genre:    ['жанр', 'жанры', 'genre'],
    tags:     ['тэги', 'теги', 'тэг', 'тег', 'tags', 'ключевые слова'],
    role:     ['моя роль', 'роль', 'role'],
    desc:     ['описание', 'описание игры', 'description'],
    goal:     ['цель', 'зачем', 'goal'],
    tech:     ['технологии', 'технология', 'стек', 'движок', 'tech'],
    platform: ['площадка', 'площадки', 'платформа', 'платформы', 'platform'],
    play:     ['поиграть', 'играть', 'ссылка', 'play', 'демо'],
    shots:    ['скрины', 'скриншоты', 'скрин', 'обложка', 'картинки', 'screenshots'],
    dim:      ['2д/3д', '2d/3d', 'размерность'],
    score:    ['оценка важности', 'важность', 'приоритет', 'score'],
    year:     ['год', 'year'],
  },

  /* Поля, которые показываем чипсами, а не сплошным текстом. */
  chipFields: ['genre', 'tags', 'platform', 'tech', 'role', 'dim'],

  /* Служебные колонки: в карточке не показываем никогда.
     Поиск и фильтр по ним при этом работают.
     Убери роль из списка — поле появится в карточках. */
  hiddenFields: ['score', 'dim', 'tags'],

  /* Поля, спрятанные под переключатель: по умолчанию свёрнуты,
     кнопка в панели фильтров показывает их у всех карточек сразу. */
  collapsedFields: ['tech'],
  collapsedLabel: 'Технологии',

  /* Папка со скринами, которые лежат рядом с сайтом. Картинка, вставленная
     в ячейку Google-таблицы, в выгрузку CSV не попадает вообще — таблица
     отдаёт пустую ячейку. Поэтому скрин задают одним из двух способов:
     ссылкой на файл или именем файла из этой папки («arena-1.png»). */
  imageDir: 'assets/img/',

  /* Из какой колонки собирается выпадающий список фильтра
     (и запасная колонка, если основной в таблице не оказалось). */
  filterField: 'genre',
  filterFallback: 'tags',

  /* Ползунок «важность от»: ниже этой оценки игры не показываем.
     Шкалу ползунка берём из самой таблицы, а этот максимум — запасной,
     если колонка с оценками пустая. У игры без оценки важность считается
     равной scoreWhenMissing — она ведёт себя как обычная игра с такой оценкой. */
  minScoreDefault: 1,
  scoreWhenMissing: 2,
  scoreMaxFallback: 5,

  /* Порядок по умолчанию: сначала года, внутри года — по важности. */
  sortDefault: 'date',

  cacheKey: 'portfolio-sheet-cache-v1',
};

/* --------------------------------------------------------------------------
   2. Мелкие утилиты
   -------------------------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);

const YEAR_RE = /^(19|20)\d{2}(\s*(год|г\.?))?$/i;
const URL_RE = /https?:\/\/[^\s,;"'<>()]+/g;
const HAS_URL = /https?:\/\//i;
const IMG_RE = /\.(png|jpe?g|webp|gif|avif|bmp)(\?|#|$)/i;

/** Приводит строку к виду, по которому удобно сравнивать названия колонок. */
function norm(s) {
  return String(s == null ? '' : s)
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s\t]+/g, ' ')
    .replace(/[:：.]+$/, '')
    .trim();
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Разбивает ячейку-перечисление на отдельные значения. */
function splitList(value) {
  return String(value || '')
    .split(/[,;/|\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function extractUrls(value) {
  return String(value || '').match(URL_RE) || [];
}

/** Ссылку на картинку превращает в пригодный для <img> адрес, иначе null.
    Узнаём то, в чём уверены: гугл-диск во всех его видах, прямые адреса
    с расширением, imgur. Остальное разбирает optimisticImage. */
function asImage(url) {
  const drive = url.match(
    /(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^]*id=|thumbnail\?[^]*id=)([\w-]{20,})/) ||
    url.match(/drive\.usercontent\.google\.com\/(?:download|uc)\?[^]*id=([\w-]{20,})/);
  if (drive) return 'https://drive.google.com/thumbnail?id=' + drive[1] + '&sz=w1200';

  if (IMG_RE.test(url)) return url;
  if (/googleusercontent\.com/.test(url)) return url;

  const imgur = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/([\w]{5,})$/);
  if (imgur) return 'https://i.imgur.com/' + imgur[1] + '.jpeg';

  return null;
}

/** Имена файлов из колонки «Скрины» → адреса картинок в папке сайта.
    Всё, что не похоже на имя картинки, пропускаем: в ячейке может быть
    и обычная заметка. */
function localImages(value) {
  return String(value || '')
    .split(/[,;|\r\n]+/)
    .map((part) => part.trim())
    .filter((part) => part && !HAS_URL.test(part) && IMG_RE.test(part))
    .map((name) => CONFIG.imageDir + name.replace(/^[.\\/]+/, ''));
}

/** Для колонки со скринами: чего не узнали — всё равно пробуем показать
    картинкой. Не загрузилось — картинка на странице сама заменится ссылкой,
    так что колонка работает с любым файлообменником, а не только со знакомыми. */
function optimisticImage(url) {
  return asImage(url) || url;
}

function prettyUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

/** Стабильный цвет карточки по названию — чтобы список не был одноцветным. */
function hueOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

/** Оценка важности из ячейки: «4», «4,5», «5/5» → число. Пусто → null. */
function parseScore(value) {
  const match = String(value == null ? '' : value).replace(',', '.').match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/** Число для показа: 4 → «4», 4.5 → «4,5». */
function showNumber(n) {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/* --------------------------------------------------------------------------
   3. Разбор CSV (кавычки, переносы строк внутри ячеек, CRLF)
   -------------------------------------------------------------------------- */

function parseCsv(text) {
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

/* --------------------------------------------------------------------------
   4. Загрузка таблицы
   -------------------------------------------------------------------------- */

function sheetUrls() {
  const bust = '_=' + Date.now();
  const base = 'https://docs.google.com/spreadsheets/d/' + CONFIG.sheetId;
  return [
    base + '/export?format=csv&gid=' + CONFIG.gid + '&' + bust,
    base + '/gviz/tq?tqx=out:csv&headers=0&gid=' + CONFIG.gid + '&' + bust,
  ];
}

async function loadCsv() {
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
      return { text, cached: false };
    } catch (err) {
      lastError = err;
    }
  }

  try {
    const raw = localStorage.getItem(CONFIG.cacheKey);
    if (raw) {
      const saved = JSON.parse(raw);
      return { text: saved.text, cached: true, at: saved.at, error: lastError };
    }
  } catch { /* нет кэша */ }

  throw lastError || new Error('не удалось загрузить таблицу');
}

/* --------------------------------------------------------------------------
   5. Понимание таблицы: где шапка, что за колонки, где года
   -------------------------------------------------------------------------- */

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

function buildModel(csvText) {
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

    games.push({
      title,
      year,
      fields,
      byRole,
      images,
      hue: hueOf(title),
      order: games.length,          // порядок строк в таблице — он же порядок по дате
      score: rated === null ? CONFIG.scoreWhenMissing : rated,
      rated: rated !== null,        // оценка стоит в таблице, а не подставлена
      roles: splitList(byRole.role || ''),
      genres: splitList(byRole[CONFIG.filterField] || byRole[CONFIG.filterFallback] || ''),
      // в поиск попадает всё, включая спрятанные поля
      search: norm([title, year, ...fields.map((f) => f.value)].join(' ')),
    });
  }

  return { games, links: readMetaLinks(rows, headerIndex), headerIndex, header, indexOf };
}

/* --------------------------------------------------------------------------
   6. Отрисовка: список карточек, у каждой — свои поля
   -------------------------------------------------------------------------- */

const state = {
  games: [], genreOptions: [], roles: [],
  q: '', include: [], exclude: [], role: '',
  minScore: CONFIG.minScoreDefault,
  scoreMax: CONFIG.scoreMaxFallback,
  sort: CONFIG.sortDefault,
  showExtra: false,
};

function renderHeroLinks(sheetLinks) {
  const all = [...CONFIG.fixedLinks, ...sheetLinks];
  $('#hero-links').innerHTML = all.map((l) =>
    '<a class="btn' + (l.primary ? ' btn--primary' : '') + '" href="' + esc(l.url) +
    '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'
  ).join('');
}

/** Значение поля: перечисление — чипсами, ссылки — ссылками, остальное — текстом. */
function valueHtml(field) {
  if (CONFIG.chipFields.includes(field.role)) {
    const parts = splitList(field.value);
    if (parts.length) {
      return '<span class="chips">' +
        parts.map((p) => '<span class="chip">' + esc(p) + '</span>').join('') + '</span>';
    }
  }

  const urls = extractUrls(field.value);
  if (urls.length) {
    const rest = field.value.replace(URL_RE, '').replace(/[\s,;]+/g, ' ').trim();
    const links = urls.map((u) =>
      '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(prettyUrl(u)) + '</a>'
    ).join(', ');
    return (rest ? esc(rest) + ' — ' : '') + links;
  }

  return esc(field.value).replace(/\n/g, '<br>');
}

/** Поля, которые не показываем строкой: служебные, картинки, год (он в заголовке)
    и ячейки из одних ссылок — они и так превращаются в кнопки под карточкой. */
function isSkipped(field) {
  if (CONFIG.hiddenFields.includes(field.role)) return true;
  if (field.role === 'shots' || field.role === 'year') return true;
  const urls = extractUrls(field.value);
  return urls.length > 0 && !field.value.replace(URL_RE, '').replace(/[\s,;]+/g, '').trim();
}

function cardHtml(game) {
  const props = game.fields.filter((f) => !isSkipped(f)).map((f) => {
    const extra = CONFIG.collapsedFields.includes(f.role) ? ' prop--extra' : '';
    return '<div class="prop' + extra + '"><dt>' + esc(f.label) + '</dt>' +
      '<dd>' + valueHtml(f) + '</dd></div>';
  }).join('');

  const gallery = game.images.length
    ? '<div class="card__shots">' + game.images.map((img) =>
        '<a class="shot" href="' + esc(img.url) + '" target="_blank" rel="noopener" ' +
        'data-fallback="' + esc(prettyUrl(img.url)) + '">' +
        '<img src="' + esc(img.src) + '" alt="" loading="lazy"></a>').join('') + '</div>'
    : '';

  // Ссылки из колонки со скринами кнопками не дублируем: они уже в галерее,
  // а не открывшаяся картинка сама превратится там в ссылку.
  const actions = game.fields
    .filter((f) => !CONFIG.hiddenFields.includes(f.role) && f.role !== 'shots')
    .flatMap((f) => extractUrls(f.value).map((u) => ({ label: f.label, url: u, role: f.role })))
    .filter((a) => !asImage(a.url))
    .map((a) => '<a class="btn' + (a.role === 'play' ? ' btn--primary' : '') + '" href="' + esc(a.url) +
      '" target="_blank" rel="noopener">' + esc(a.label) + '</a>')
    .join('');

  return '<article class="card" style="--hue:' + game.hue + '">' +
    '<header class="card__head">' +
      '<h3 class="card__title">' + esc(game.title) + '</h3>' +
      (game.year ? '<span class="card__year">' + esc(game.year) + '</span>' : '') +
    '</header>' +
    gallery +
    (props ? '<dl class="props">' + props + '</dl>' : '') +
    (actions ? '<div class="card__actions">' + actions + '</div>' : '') +
  '</article>';
}

/** Разбивает список на блоки с заголовками — по тому, что выбрано в сортировке.
    «Сначала дата» — блоки по годам (в порядке таблицы), внутри года важное выше.
    «Сначала важность» — блоки по оценке, внутри блока порядок таблицы, то есть по дате. */
function groupsOf(games) {
  const byScore = state.sort === 'score';
  const groups = [];
  const index = new Map();

  games.forEach((game) => {
    const key = byScore ? String(game.score) : (game.year || '');
    let group = index.get(key);
    if (!group) {
      group = {
        title: byScore ? 'Важность ' + showNumber(game.score) : (game.year || 'Без года'),
        score: game.score,
        items: [],
      };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(game);
  });

  if (byScore) {
    groups.sort((a, b) => b.score - a.score);
    groups.forEach((g) => g.items.sort((a, b) => a.order - b.order));
  } else {
    groups.forEach((g) => g.items.sort((a, b) => b.score - a.score || a.order - b.order));
  }
  return groups;
}

function render() {
  const visible = state.games.filter(matches);
  const groups = groupsOf(visible);

  $('#list').innerHTML = groups.map((group) =>
    '<section class="year-block">' +
      '<div class="year"><h2>' + esc(group.title) + '</h2>' +
      '<span>' + group.items.length + '</span></div>' +
      group.items.map(cardHtml).join('') +
    '</section>'
  ).join('');

  bindShotFallbacks();

  $('#empty').hidden = visible.length > 0;
  $('#count').textContent = visible.length === state.games.length
    ? state.games.length + ' ' + plural(state.games.length, 'проект', 'проекта', 'проектов')
    : visible.length + ' из ' + state.games.length;
}

/** Файлообменник не отдал картинку — вместо битого скрина показываем ссылку,
    по которой её всё-таки можно открыть. */
function bindShotFallbacks() {
  document.querySelectorAll('.card__shots img').forEach((img) => {
    img.addEventListener('error', () => {
      const link = img.closest('.shot');
      if (!link) return;
      link.classList.add('shot--link');
      link.textContent = link.dataset.fallback;
    }, { once: true });
  });
}

function matches(game) {
  // Выбрано несколько жанров — подойдёт любой из них; «кроме» убирает игру,
  // если у неё есть хоть один из отброшенных жанров.
  const genres = game.genres.map(norm);
  if (state.include.length && !genres.some((g) => state.include.includes(g))) return false;
  if (state.exclude.length && genres.some((g) => state.exclude.includes(g))) return false;
  if (state.role && !game.roles.some((r) => norm(r) === state.role)) return false;

  if (game.score < state.minScore) return false;

  if (state.q) {
    const terms = state.q.split(/\s+/).filter(Boolean);
    if (!terms.every((t) => game.search.includes(t))) return false;
  }
  return true;
}

/* --------------------------------------------------------------------------
   7. Фильтры, переключатели, тема
   -------------------------------------------------------------------------- */

/** Пункты выпадающего списка из значений всех игр, с числом игр у каждого.
    Частые значения идут первыми. */
function optionsFrom(games, pick) {
  const counts = new Map();
  games.forEach((game) => pick(game).forEach((raw) => {
    const key = norm(raw);
    if (!key) return;
    const item = counts.get(key) || { key, label: raw, n: 0 };
    item.n++;
    counts.set(key, item);
  }));

  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ru'));
}

function optionHtml(option) {
  return '<option value="' + esc(option.key) + '">' +
    esc(option.label) + ' (' + option.n + ')</option>';
}

function labelOfGenre(key) {
  const option = state.genreOptions.find((o) => o.key === key);
  return option ? option.label : key;
}

/** Оба жанровых фильтра принимают по нескольку значений: выбранное уходит
    из списка вниз, под него, чипсой — клик по чипсе снимает выбор. */
function renderGenreControls() {
  fillGenreSelect($('#genre-in'), state.include, 'любой');
  fillGenreSelect($('#genre-out'), state.exclude, '—');
  renderPicked($('#genre-in-picked'), state.include);
  renderPicked($('#genre-out-picked'), state.exclude);
  $('#genre-in-hint').hidden = state.include.length < 2;
}

function fillGenreSelect(select, picked, placeholder) {
  select.innerHTML = '<option value="">' + (picked.length ? 'добавить ещё…' : placeholder) + '</option>' +
    state.genreOptions.filter((o) => !picked.includes(o.key)).map(optionHtml).join('');
  select.value = '';
}

function renderPicked(box, picked) {
  box.hidden = !picked.length;
  box.innerHTML = picked.map((key) =>
    '<button class="chip chip--pick" type="button" data-genre="' + esc(key) + '" ' +
    'title="Убрать из фильтра">' + esc(labelOfGenre(key)) + ' <span>×</span></button>'
  ).join('');
}

function fillFilters(games) {
  state.genreOptions = optionsFrom(games, (g) => g.genres);
  renderGenreControls();

  const roles = optionsFrom(games, (g) => g.roles);
  $('#role').innerHTML = '<option value="">любая</option>' +
    roles.map((o) => optionHtml(o)).join('');
  state.roles = roles.map((o) => o.key);
  $('#field-role').hidden = !roles.length;

  setupScoreSlider(games);
}

/** Шкалу ползунка берём из самой таблицы: максимум — самая высокая оценка,
    шаг — половинный, если в таблице встречаются дробные оценки.
    Считаем только проставленные оценки: если их нет совсем, ползунок ни к чему. */
function setupScoreSlider(games) {
  const scores = games.filter((g) => g.rated).map((g) => g.score);
  const field = $('#field-score');

  if (!scores.length) {
    field.hidden = true;
    state.scoreMax = 0;
    return;
  }

  const slider = $('#score');
  state.scoreMax = Math.max(
    CONFIG.minScoreDefault, CONFIG.scoreWhenMissing, Math.ceil(Math.max(...scores)));
  slider.max = String(state.scoreMax);
  slider.step = scores.some((s) => !Number.isInteger(s)) ? '0.5' : '1';
  field.hidden = false;
}

/** Ставит порог важности и подписывает его рядом с ползунком. */
function applyScore(value) {
  state.minScore = Math.min(Math.max(value, 0), state.scoreMax);
  $('#score').value = String(state.minScore);
  $('#score-out').textContent = showNumber(state.minScore);
}

/** Кнопка «показать спрятанные поля». Подпись берём из самой таблицы. */
function setupExtraToggle(games) {
  const btn = $('#toggle-extra');
  const labels = [...new Set(games.flatMap((g) => g.fields
    .filter((f) => CONFIG.collapsedFields.includes(f.role))
    .map((f) => f.label)))];

  if (!labels.length) { btn.hidden = true; return; }

  btn.hidden = false;
  btn.textContent = labels.join(', ') || CONFIG.collapsedLabel;
  applyExtra(localStorage.getItem('portfolio-show-extra') === '1');

  btn.addEventListener('click', () => {
    applyExtra(!state.showExtra);
    try { localStorage.setItem('portfolio-show-extra', state.showExtra ? '1' : '0'); }
    catch { /* ок */ }
  });
}

function applyExtra(on) {
  state.showExtra = on;
  document.body.classList.toggle('show-extra', on);
  const btn = $('#toggle-extra');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('btn--on', on);
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.include.length) p.set('g', state.include.join(','));
  if (state.exclude.length) p.set('x', state.exclude.join(','));
  if (state.role) p.set('r', state.role);
  if (state.minScore !== CONFIG.minScoreDefault) p.set('s', String(state.minScore));
  if (state.sort !== CONFIG.sortDefault) p.set('sort', state.sort);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

/** «аркада,головоломка» из адреса страницы → список ключей. */
function splitKeys(value) {
  return String(value || '').split(',').map(norm).filter(Boolean);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = norm(p.get('q') || '');
  state.include = splitKeys(p.get('g'));
  state.exclude = splitKeys(p.get('x'));
  state.role = norm(p.get('r') || '');

  const min = parseScore(p.get('s'));
  state.minScore = min === null ? CONFIG.minScoreDefault : min;
  state.sort = p.get('sort') === 'score' ? 'score' : CONFIG.sortDefault;

  $('#q').value = p.get('q') || '';
}

function applyControls() {
  const known = state.genreOptions.map((o) => o.key);
  state.include = state.include.filter((k) => known.includes(k));
  state.exclude = state.exclude.filter((k) => known.includes(k));
  renderGenreControls();

  if (state.roles.includes(state.role)) $('#role').value = state.role;
  else { state.role = ''; $('#role').value = ''; }

  applyScore(state.minScore);
  $('#sort').value = state.sort;
}

/** Список добавляет жанр к фильтру, клик по чипсе — убирает. */
function bindGenrePicker(select, box, key) {
  select.addEventListener('change', (e) => {
    const value = e.target.value;
    if (value && !state[key].includes(value)) state[key].push(value);
    renderGenreControls();
    render();
    syncUrl();
  });

  box.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-genre]');
    if (!chip) return;
    state[key] = state[key].filter((g) => g !== chip.dataset.genre);
    renderGenreControls();
    render();
    syncUrl();
  });
}

function bindEvents() {
  $('#q').addEventListener('input', (e) => {
    state.q = norm(e.target.value);
    render();
    syncUrl();
  });

  bindGenrePicker($('#genre-in'), $('#genre-in-picked'), 'include');
  bindGenrePicker($('#genre-out'), $('#genre-out-picked'), 'exclude');

  $('#role').addEventListener('change', (e) => {
    state.role = e.target.value;
    render();
    syncUrl();
  });

  $('#score').addEventListener('input', (e) => {
    applyScore(parseFloat(e.target.value));
    render();
    syncUrl();
  });

  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
    syncUrl();
  });

  $('#reset').addEventListener('click', () => {
    state.q = state.role = '';
    state.include = [];
    state.exclude = [];
    state.sort = CONFIG.sortDefault;
    $('#q').value = '';
    renderGenreControls();
    $('#role').value = '';
    $('#sort').value = state.sort;
    applyScore(CONFIG.minScoreDefault);
    render();
    syncUrl();
  });

  const themeBtn = $('#theme');
  const saved = localStorage.getItem('portfolio-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('portfolio-theme', next); } catch { /* ок */ }
  });
}

function sheetHref() {
  return 'https://docs.google.com/spreadsheets/d/' + CONFIG.sheetId + '/edit#gid=' + CONFIG.gid;
}

function showError(err) {
  const status = $('#status');
  const reason = esc(err && err.message ? err.message : err);
  status.hidden = false;
  status.className = 'status status--error';

  // Самая частая причина — страницу открыли двойным кликом. Из file:// браузер
  // запрещает запрос к гуглу, и доступ к таблице тут совершенно ни при чём.
  if (location.protocol === 'file:') {
    status.innerHTML = '<b>Страница открыта как файл, поэтому браузер запретил запрос к таблице.</b><br>' +
      'Доступ к таблице тут ни при чём. Нужен любой веб-адрес: опубликованный сайт ' +
      '(GitHub Pages) или локальный сервер — запусти <code>start-local-server.bat</code> ' +
      'из этой папки и открой <code>http://localhost:8000/</code>.<br>' +
      '<span class="status__tech">Техническая причина: ' + reason + '</span>';
    return;
  }

  status.innerHTML = 'Не получилось прочитать таблицу (' + reason + ').<br>' +
    'Проверь, что у неё включён доступ «Все, у кого есть ссылка» — ' +
    '<a href="' + esc(sheetHref()) + '" target="_blank" rel="noopener">открыть таблицу</a>.';
}

/* --------------------------------------------------------------------------
   8. Старт
   -------------------------------------------------------------------------- */

async function init() {
  $('#year').textContent = new Date().getFullYear();
  $('#sheet-link').href = sheetHref();
  bindEvents();

  let data;
  try {
    data = await loadCsv();
  } catch (err) {
    showError(err);
    return;
  }

  const model = buildModel(data.text);
  state.games = model.games;

  renderHeroLinks(model.links);
  fillFilters(model.games);
  setupExtraToggle(model.games);
  readUrl();
  applyControls();
  render();

  const status = $('#status');
  if (data.cached) {
    status.hidden = false;
    status.className = 'status status--error';
    status.textContent = 'Таблица сейчас недоступна — показаны сохранённые данные от ' +
      new Date(data.at).toLocaleString('ru-RU') + '.';
  } else {
    status.hidden = true;
  }

  if (!model.games.length) {
    $('#empty').hidden = false;
    $('#empty').textContent = 'В таблице не нашлось ни одной строки с игрой. ' +
      'Проверь, что колонка с названием игры называется «Игра».';
  }
}

init();
