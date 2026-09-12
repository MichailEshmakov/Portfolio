/* Отрисовка списка: карточка игры, разбивка на группы и очередь,
   в которой качаются картинки. */

import { CONFIG } from './config.js';
import {
  $, esc, splitList, labelOf, extractUrls, prettyUrl, showNumber, plural, URL_RE,
} from './utils.js';
import { asImage } from './images.js';
import { state, matches, hiddenCounts } from './state.js';
import { updateJump } from './jump.js';

export function renderHeroLinks(sheetLinks) {
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
        parts.map((p) => '<span class="chip">' + esc(labelOf(p)) + '</span>').join('') + '</span>';
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

  // Ссылки из колонки со скринами кнопками не дублируем: они уже в галерее,
  // а не открывшаяся картинка сама превратится там в ссылку.
  const links = game.fields
    .filter((f) => !CONFIG.hiddenFields.includes(f.role) && f.role !== 'shots')
    .flatMap((f) => extractUrls(f.value).map((u) => ({ label: f.label, url: u, role: f.role })))
    .filter((a) => !asImage(a.url));

  const btnHtml = (a) => '<a class="btn' + (a.role === 'play' ? ' btn--primary' : '') +
    '" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.label) + '</a>';

  // «Поиграть» стоит прямо под скриншотом — это главное действие карточки.
  const play = links.filter((a) => a.role === 'play').map(btnHtml).join('');
  const actions = links.filter((a) => a.role !== 'play').map(btnHtml).join('');

  const shots = game.images.map((img) =>
    '<a class="shot" href="' + esc(img.url) + '" target="_blank" rel="noopener" ' +
    'data-fallback="' + esc(prettyUrl(img.url)) + '">' +
    '<img class="shot__img" data-src="' + esc(img.src) + '" alt="" decoding="async">' +
    '</a>').join('');

  // Без скриншотов «поиграть» остаётся в общем ряду кнопок под карточкой.
  const gallery = shots
    ? '<div class="card__shots">' + shots +
      (play ? '<div class="card__play">' + play + '</div>' : '') + '</div>'
    : '';
  const buttons = shots ? actions : play + actions;

  const icon = game.icon
    ? '<img class="card__icon" data-src="' + esc(game.icon) + '" alt="" decoding="async">'
    : '';

  return '<article class="card" style="--hue:' + game.hue + '">' +
    '<header class="card__head">' +
      icon +
      '<h3 class="card__title">' + esc(game.title) + '</h3>' +
      (game.year ? '<span class="card__year">' + esc(game.year) + '</span>' : '') +
    '</header>' +
    '<div class="card__body">' +
      gallery +
      (props ? '<dl class="props">' + props + '</dl>' : '') +
      (buttons ? '<div class="card__actions">' + buttons + '</div>' : '') +
    '</div>' +
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

export function render() {
  const visible = state.games.filter((game) => matches(game));
  const groups = groupsOf(visible);

  $('#list').innerHTML = groups.map((group) =>
    '<section class="year-block">' +
      '<div class="year"><h2>' + esc(group.title) + '</h2>' +
      '<span>' + group.items.length + ' ' +
      plural(group.items.length, 'игра', 'игры', 'игр') + '</span></div>' +
      group.items.map(cardHtml).join('') +
    '</section>'
  ).join('');

  loadShotsInOrder();

  $('#empty').hidden = visible.length > 0;
  $('#count').textContent = visible.length === state.games.length
    ? state.games.length + ' ' + plural(state.games.length, 'проект', 'проекта', 'проектов')
    : visible.length + ' из ' + state.games.length;

  renderMore(visible.length);
  updateJump();
}

/** Подпись под списком: список закончился, но это ещё не все игры. Она стоит
    в самом низу страницы, поэтому попадается на глаза как раз тогда, когда
    список долистан до конца, и только если что-то действительно спрятано. */
function renderMore(shown) {
  const box = $('#more');
  const { byScore, byOthers } = hiddenCounts();

  if (!byScore && !byOthers) { box.hidden = true; box.innerHTML = ''; return; }

  const lines = [];
  if (byScore) {
    lines.push('Порог важности прячет ещё ' + byScore + ' ' +
      plural(byScore, 'игру', 'игры', 'игр') + '. ' +
      '<button class="more__btn" type="button" data-more="score">' +
      'Снизить важность до ' + showNumber(CONFIG.scoreMin) + '</button>');
  }
  if (byOthers) {
    lines.push('Остальные фильтры прячут ещё ' + byOthers + ' ' +
      plural(byOthers, 'игру', 'игры', 'игр') + '. ' +
      '<button class="more__btn" type="button" data-more="reset">Сбросить фильтры</button>');
  }

  box.hidden = false;
  box.innerHTML = '<p class="more__head">Это не все игры: показано ' + shown +
    ' из ' + state.games.length + '.</p>' +
    lines.map((line) => '<p class="more__line">' + line + '</p>').join('');
}

/** Картинки грузятся не все разом, а по очереди — в том порядке, в каком
    сейчас идут карточки. Сначала иконки (их видно сразу, они лёгкие),
    потом скрины: тяжёлая гифка из середины списка не мешает посмотреть
    верхние карточки, а пока читаешь плашку, её скрин уже подгружается.
    Перерисовали список (фильтр, сортировка) — старая очередь бросается
    и начинается новая, в новом порядке. */
let shotQueue = 0;

function loadShotsInOrder() {
  const token = ++shotQueue;
  const pick = (sel) => Array.from(document.querySelectorAll(sel + '[data-src]'));
  const queue = [...pick('.card__icon'), ...pick('.shot__img')];
  let at = 0;

  const next = () => {
    if (token !== shotQueue) return;     // список перерисовали — эта очередь уже не нужна
    const img = queue[at++];
    if (!img) return;

    const src = img.dataset.src;
    img.removeAttribute('data-src');
    img.addEventListener('load', next, { once: true });
    img.addEventListener('error', () => { showShotFallback(img); next(); }, { once: true });
    img.src = src;
  };

  // столько картинок качаем одновременно: 1 — строго по очереди, сверху вниз
  for (let i = 0; i < CONFIG.shotsAtOnce; i++) next();
}

/** Картинка не открылась: иконка просто исчезает, а на месте скрина
    остаётся ссылка, по которой его всё-таки можно посмотреть. */
function showShotFallback(img) {
  const link = img.closest('.shot');
  if (!link) { img.remove(); return; }
  link.classList.add('shot--link');
  link.textContent = link.dataset.fallback;
}
