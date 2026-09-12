/* ===========================================================================
   Портфолио — данные берутся напрямую из Google-таблицы при каждой загрузке
   страницы. Скрипт не знает заранее ни номера строки с шапкой, ни порядка
   колонок: он находит шапку сам и сопоставляет колонки по названиям.
   Поэтому таблицу можно двигать вниз, вставлять года в середину и
   добавлять/убирать столбцы — сайт подстроится.

   На странице таблицы нет: каждая игра — карточка, внутри неё поля
   «название поля → значение». Появилась в таблице новая колонка —
   в карточках появилась новая строка. Пропала колонка — строка пропала.

   Здесь только запуск. Всё остальное разложено по соседним файлам:
     config.js    — настройки, единственное место для правки «под себя»
     utils.js     — приведение текста, разбор перечислений, числа
     images.js    — адреса картинок и список файлов из папки сайта
     sheet.js     — разбор CSV и загрузка таблицы с запасными копиями
     model.js     — поиск шапки, колонки, сборка списка игр
     state.js     — что выбрано в панели, кто из игр этому подходит, адрес страницы
     cards.js     — карточки, группы, очередь загрузки картинок
     controls.js  — панель фильтров, ползунок, тема
     jump.js      — кнопки перехода между группами
     status.js    — сообщения о том, откуда данные и что пошло не так
   =========================================================================== */

import { $, collectLabels } from './utils.js';
import { loadCsv, sheetHref } from './sheet.js';
import { loadImages } from './images.js';
import { buildModel } from './model.js';
import { state, readUrl } from './state.js';
import { renderHeroLinks, render } from './cards.js';
import { fillFilters, setupExtraToggle, applyControls, bindEvents } from './controls.js';
import { showSource, showError } from './status.js';

async function init() {
  $('#year').textContent = new Date().getFullYear();
  $('#sheet-link').href = sheetHref();
  bindEvents();

  let data;
  const imagesPromise = loadImages();   // список картинок грузится параллельно
  try {
    data = await loadCsv();
  } catch (err) {
    showError(err);
    return;
  }

  const model = buildModel(data.text, await imagesPromise);
  state.games = model.games;

  renderHeroLinks(model.links);
  collectLabels(model.games);
  fillFilters(model.games);
  setupExtraToggle(model.games);
  readUrl();
  applyControls();
  render();

  showSource(data);

  if (!model.games.length) {
    $('#empty').hidden = false;
    $('#empty').textContent = 'В таблице не нашлось ни одной строки с игрой. ' +
      'Проверь, что колонка с названием игры называется «Игра».';
  }
}

init();
