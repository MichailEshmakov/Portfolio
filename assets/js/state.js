/* Состояние страницы: что сейчас выбрано в панели, какие игры этому
   подходят и как это состояние живёт в адресе страницы. */

import { CONFIG } from './config.js';
import { $, norm, parseScore } from './utils.js';

/* Что сейчас выбрано в панели фильтров. Единственное место, где это хранится. */
export const state = {
  games: [], genreOptions: [],
  // по фильтру-списку: pickOptions — что есть в таблице, picked — что выбрано
  pickOptions: {}, picked: {},
  q: '', include: [], exclude: [],
  minScore: CONFIG.scoreDefault,
  scoreMax: CONFIG.scoreMaxFallback,
  sort: CONFIG.sortDefault,
  showExtra: false,
};

export function matches(game) {
  return matchesExceptScore(game) && game.score >= state.minScore;
}

/** Все условия, кроме порога важности. Порог отделён, чтобы под списком
    можно было сказать, сколько игр прячет именно он. */
export function matchesExceptScore(game) {
  // Выбрано несколько жанров — подойдёт любой из них; «кроме» убирает игру,
  // если у неё есть хоть один из отброшенных жанров.
  const genres = game.genres.map(norm);
  if (state.include.length && !genres.some((g) => state.include.includes(g))) return false;
  if (state.exclude.length && genres.some((g) => state.exclude.includes(g))) return false;
  for (const f of CONFIG.pickFilters) {
    const want = state.picked[f.id];
    if (want && !game.picks[f.id].some((v) => norm(v) === want)) return false;
  }

  if (state.q) {
    const terms = state.q.split(/\s+/).filter(Boolean);
    if (!terms.every((t) => game.search.includes(t))) return false;
  }
  return true;
}

/** Сколько игр не видно: отдельно из-за порога важности, отдельно из-за
    остальных фильтров. К порогу относим только те игры, которые прошли бы
    все прочие условия, — иначе одна игра попала бы в оба числа. */
export function hiddenCounts() {
  // На левой границе порог уже ничего не прячет — и опустить его ниже нельзя,
  // поэтому про важность в этом случае говорить не о чем.
  const threshold = state.minScore > CONFIG.scoreMin ? state.minScore : -Infinity;
  let byScore = 0;
  let byOthers = 0;

  state.games.forEach((game) => {
    if (!matchesExceptScore(game)) byOthers++;
    else if (game.score < threshold) byScore++;
  });

  return { byScore, byOthers };
}

export function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.include.length) p.set('g', state.include.join(','));
  if (state.exclude.length) p.set('x', state.exclude.join(','));
  CONFIG.pickFilters.forEach((f) => {
    if (state.picked[f.id]) p.set(f.id, state.picked[f.id]);
  });
  if (state.minScore !== CONFIG.scoreDefault) p.set('s', String(state.minScore));
  if (state.sort !== CONFIG.sortDefault) p.set('sort', state.sort);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

/** «аркада,головоломка» из адреса страницы → список ключей. */
function splitKeys(value) {
  return String(value || '').split(',').map(norm).filter(Boolean);
}

export function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = norm(p.get('q') || '');
  state.include = splitKeys(p.get('g'));
  state.exclude = splitKeys(p.get('x'));
  CONFIG.pickFilters.forEach((f) => { state.picked[f.id] = norm(p.get(f.id) || ''); });

  const min = parseScore(p.get('s'));
  state.minScore = min === null ? CONFIG.scoreDefault : min;
  state.sort = p.get('sort') === 'date' ? 'date' : CONFIG.sortDefault;

  $('#q').value = p.get('q') || '';
}
