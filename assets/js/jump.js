/* Быстрый переход между группами — кнопка со стрелкой под панелью фильтров. */

import { $ } from './utils.js';

/* Показывается одна кнопка — та, куда человек
   сейчас едет: листает вниз — «↓ 2021», к следующей группе; листает вверх —
   «↑ 2023», к предыдущей. Так год (или ступень важности — смотря что выбрано
   в сортировке) листается целиком одним кликом. Кнопка остаётся на экране
   после остановки и меняется только тогда, когда сменилось направление,
   иначе по ней не успеть кликнуть.
   Вверх — сначала к началу группы, которую сейчас читаешь, и только от самого
   её начала к предыдущей: как перемотка треков. */

const JUMP = {
  gap: 12,      // на сколько ниже панели фильтров встаёт заголовок после перехода
  slack: 6,     // запас на дробные пиксели: без него повторный клик мог не сработать
  near: 140,    // ближе этого к линии считаем, что группа только началась
  show: 220,    // с какой прокрутки показываем кнопку
  turn: 24,     // столько нужно проехать в обратную сторону, чтобы кнопка сменилась
};

/** Линия, выше которой всё считается пролистанным: низ закреплённой панели, если она есть. */
function jumpLine() {
  const bar = $('#toolbar');
  const stuck = bar && ['sticky', 'fixed'].includes(getComputedStyle(bar).position);
  return (stuck ? bar.getBoundingClientRect().height : 0) + JUMP.gap;
}

function jumpTitle(heading) {
  const h2 = heading.querySelector('h2');
  return h2 ? h2.textContent : '';
}

function scrollToHeading(heading) {
  const y = window.scrollY + heading.getBoundingClientRect().top - jumpLine();
  scrollPage(Math.max(0, y));
}

function scrollPage(top) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: still ? 'auto' : 'smooth' });
}

/** Куда ведут кнопки прямо сейчас: индексы заголовков (или -1 — некуда). */
function jumpTargets(headings) {
  const line = jumpLine();
  const tops = headings.map((el) => el.getBoundingClientRect().top);

  let current = -1;
  let next = -1;
  tops.forEach((top, i) => {
    if (top < line + JUMP.slack) current = i;
    else if (next < 0) next = i;
  });

  // группа только началась — значит, вверх это уже предыдущая группа
  const up = (current >= 0 && tops[current] > line - JUMP.near) ? current - 1 : current;
  return { up, next };
}

function setJumpBtn(btn, label, text, hint) {
  btn.hidden = !text;
  if (!text) return;
  label.textContent = text;
  btn.setAttribute('aria-label', hint);
  btn.title = hint;
}

/** Куда человек едет сейчас: 'down' или 'up'. Мелкое дрожание не в счёт —
    направление меняется, только если проехали в обратную сторону заметно. */
let jumpDir = 'down';
let jumpFrom = 0;

function jumpDirection() {
  const y = window.scrollY;
  const delta = y - jumpFrom;
  if (Math.abs(delta) >= JUMP.turn) {
    jumpDir = delta > 0 ? 'down' : 'up';
    jumpFrom = y;
  } else if ((jumpDir === 'down' && y > jumpFrom) || (jumpDir === 'up' && y < jumpFrom)) {
    jumpFrom = y;   // едем в ту же сторону — отсчёт разворота ведём от текущего места
  }
  return jumpDir;
}

export function updateJump() {
  const box = $('#jump');
  const headings = Array.from(document.querySelectorAll('#list .year'));
  const goingUp = jumpDirection() === 'up';

  // кнопка висит сразу под панелью фильтров, а её высота зависит от экрана
  box.style.setProperty('--jump-top', Math.round(jumpLine() + 4) + 'px');

  if (!headings.length || window.scrollY <= JUMP.show) {
    box.classList.remove('jump--on');
    return;
  }

  const { up, next } = jumpTargets(headings);

  // выше первой группы ничего нет — тогда стрелка вверх просто возвращает в начало
  const upTitle = up >= 0 ? jumpTitle(headings[up]) : 'Наверх';
  setJumpBtn($('#jump-up'), $('#jump-up-label'), goingUp ? upTitle : '',
    up >= 0 ? 'Вверх, к группе «' + upTitle + '»' : 'В начало страницы');

  const nextTitle = next >= 0 ? jumpTitle(headings[next]) : '';
  setJumpBtn($('#jump-down'), $('#jump-down-label'), goingUp ? '' : nextTitle,
    'Вниз, к группе «' + nextTitle + '»');

  // показывать нечего: листаем вниз, а групп ниже уже не осталось
  const visible = goingUp ? !$('#jump-up').hidden : !$('#jump-down').hidden;
  box.classList.toggle('jump--on', visible);
}

/** Прокрутка сыплет событиями чаще, чем браузер рисует кадры, поэтому
    пересчитываем подписи не чаще раза на кадр. */
let jumpWaiting = false;

function scheduleJumpUpdate() {
  if (jumpWaiting) return;
  jumpWaiting = true;
  requestAnimationFrame(() => { jumpWaiting = false; updateJump(); });
}

export function bindJump() {
  $('#jump-up').addEventListener('click', () => {
    const headings = Array.from(document.querySelectorAll('#list .year'));
    const { up } = jumpTargets(headings);
    if (up >= 0) scrollToHeading(headings[up]);
    else scrollPage(0);
  });

  $('#jump-down').addEventListener('click', () => {
    const headings = Array.from(document.querySelectorAll('#list .year'));
    const { next } = jumpTargets(headings);
    if (next >= 0) scrollToHeading(headings[next]);
  });

  window.addEventListener('scroll', scheduleJumpUpdate, { passive: true });
  window.addEventListener('resize', scheduleJumpUpdate);
}
