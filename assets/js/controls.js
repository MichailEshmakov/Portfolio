/* Панель над списком: выпадающие списки фильтров, ползунок важности,
   переключатель спрятанных полей, тема и подписка на все события. */

import { CONFIG } from './config.js';
import { $, esc, norm, labelOf, showNumber } from './utils.js';
import { state, syncUrl } from './state.js';
import { render } from './cards.js';
import { bindJump } from './jump.js';

/** Пункты выпадающего списка из значений всех игр, с числом игр у каждого.
    Частые значения идут первыми. */
function optionsFrom(games, pick) {
  const counts = new Map();
  games.forEach((game) => pick(game).forEach((raw) => {
    const key = norm(raw);
    if (!key) return;
    const item = counts.get(key) || { key, label: labelOf(raw), n: 0 };
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

/** Поля фильтров-списков делаются из CONFIG.pickFilters, чтобы новый фильтр
    добавлялся одной строкой настроек, а не правкой разметки.
    Встают перед сортировкой — она всегда последняя в панели. */
function ensurePickFields() {
  const sortField = $('#field-sort');
  CONFIG.pickFilters.forEach((f) => {
    if ($('#field-' + f.id)) return;
    const field = document.createElement('p');
    field.className = 'field';
    field.id = 'field-' + f.id;
    field.hidden = true;
    field.innerHTML = '<label for="' + esc(f.id) + '">' + esc(f.label) + '</label>' +
      '<select id="' + esc(f.id) + '"><option value="">' + esc(f.empty) + '</option></select>';
    sortField.parentNode.insertBefore(field, sortField);
  });
}

export function fillFilters(games) {
  ensurePickFields();
  state.genreOptions = optionsFrom(games, (g) => g.genres);
  renderGenreControls();

  CONFIG.pickFilters.forEach((f) => {
    const options = optionsFrom(games, (g) => g.picks[f.id]);
    state.pickOptions[f.id] = options;
    $('#' + f.id).innerHTML = '<option value="">' + esc(f.empty) + '</option>' +
      options.map(optionHtml).join('');
    $('#field-' + f.id).hidden = !options.length;
  });

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
    CONFIG.scoreDefault, CONFIG.scoreWhenMissing, Math.ceil(Math.max(...scores)));
  slider.min = String(CONFIG.scoreMin);
  slider.max = String(state.scoreMax);
  slider.step = scores.some((s) => !Number.isInteger(s)) ? '0.5' : '1';
  renderScoreTicks();
  field.hidden = false;
}

/** Подписи делений под ползунком — чтобы шкала была видна без движения ручки. */
function renderScoreTicks() {
  const ticks = [];
  for (let n = CONFIG.scoreMin; n <= state.scoreMax; n++) ticks.push(n);
  $('#score-ticks').innerHTML = ticks.map((n) => '<span>' + n + '</span>').join('');
}

/* Подпись под ползунком. На самой левой ступени порог никого не отсекает —
   говорим об этом шуткой, а не сухим «показаны все». */
const SCORE_HINT_DEFAULT = 'можете оставить только хорошие';
const SCORE_HINT_ALL = 'А сертификаты Русского Медвежонка надо показывать?';

/** Ставит порог важности и подписывает его рядом с ползунком. */
function applyScore(value) {
  state.minScore = Math.min(Math.max(value, CONFIG.scoreMin), state.scoreMax);
  $('#score').value = String(state.minScore);
  $('#score-out').textContent = showNumber(state.minScore);
  $('#score-hint').textContent = state.minScore <= CONFIG.scoreMin
    ? SCORE_HINT_ALL
    : SCORE_HINT_DEFAULT;
}

/** Кнопка «показать спрятанные поля». Подпись берём из самой таблицы. */
export function setupExtraToggle(games) {
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


export function applyControls() {
  const known = state.genreOptions.map((o) => o.key);
  state.include = state.include.filter((k) => known.includes(k));
  state.exclude = state.exclude.filter((k) => known.includes(k));
  renderGenreControls();

  CONFIG.pickFilters.forEach((f) => {
    const known = (state.pickOptions[f.id] || []).some((o) => o.key === state.picked[f.id]);
    if (!known) state.picked[f.id] = '';
    $('#' + f.id).value = state.picked[f.id];
  });

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

/** Возвращает панель в исходное состояние: видны все игры. */
function resetFilters() {
  state.q = '';
  state.include = [];
  state.exclude = [];
  state.sort = CONFIG.sortDefault;
  $('#q').value = '';
  renderGenreControls();
  CONFIG.pickFilters.forEach((f) => {
    state.picked[f.id] = '';
    $('#' + f.id).value = '';
  });
  $('#sort').value = state.sort;
  applyScore(CONFIG.scoreDefault);
  render();
  syncUrl();
}

export function bindEvents() {
  bindJump();
  ensurePickFields();

  $('#q').addEventListener('input', (e) => {
    state.q = norm(e.target.value);
    render();
    syncUrl();
  });

  bindGenrePicker($('#genre-in'), $('#genre-in-picked'), 'include');
  bindGenrePicker($('#genre-out'), $('#genre-out-picked'), 'exclude');

  CONFIG.pickFilters.forEach((f) => {
    $('#' + f.id).addEventListener('change', (e) => {
      state.picked[f.id] = e.target.value;
      render();
      syncUrl();
    });
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

  $('#reset').addEventListener('click', resetFilters);

  // кнопки в подписи под списком: подпись перерисовывается, поэтому слушаем блок
  $('#more').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-more]');
    if (!btn) return;
    if (btn.dataset.more === 'reset') { resetFilters(); return; }
    applyScore(CONFIG.scoreMin);
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
