/* Строка над списком: откуда взялись данные и что делать, если таблица
   не прочиталась. */

import { $, esc } from './utils.js';
import { sheetHref } from './sheet.js';

/** Мелкая пометка о том, откуда данные. Таблица открылась — молчим.
    Не открылась — одна строка мелким шрифтом над списком и уточнение
    в подписи внизу страницы; список при этом показан из запасной копии. */
export function showSource(data) {
  const status = $('#status');
  const note = $('#footer-source');
  if (data.source === 'sheet') {
    status.hidden = true;
    if (note) note.hidden = true;
    return;
  }

  const when = data.at ? ' от ' + new Date(data.at).toLocaleDateString('ru-RU') : '';
  const where = data.source === 'cache'
    ? 'сохранённая копия' + when
    : 'копия из папки сайта' + when;

  status.hidden = false;
  status.className = 'status status--note';
  status.textContent = 'Таблица сейчас не загрузилась — показана ' + where + '.';
  if (note) note.hidden = false;
}

export function showError(err) {
  const status = $('#status');
  const reason = esc(err && err.message ? err.message : err);
  status.hidden = false;
  status.className = 'status status--error';

  // Про открытие страницы из file:// сообщает обычный скрипт в index.html:
  // модули оттуда не грузятся вообще, сюда выполнение уже не доходит.
  status.innerHTML = 'Не получилось прочитать таблицу (' + reason + ').<br>' +
    'Проверь, что у неё включён доступ «Все, у кого есть ссылка» — ' +
    '<a href="' + esc(sheetHref()) + '" target="_blank" rel="noopener">открыть таблицу</a>.';
}
