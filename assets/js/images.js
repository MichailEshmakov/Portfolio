/* Картинки: как из ячейки таблицы или из имени файла получить адрес для <img>
   и как прочитать список картинок, лежащих в папке сайта. */

import { CONFIG } from './config.js';
import { norm, HAS_URL } from './utils.js';

const IMG_RE = /\.(png|jpe?g|webp|gif|avif|bmp)(\?|#|$)/i;

/** Ссылку на картинку превращает в пригодный для <img> адрес, иначе null.
    Узнаём то, в чём уверены: гугл-диск во всех его видах, прямые адреса
    с расширением, imgur. Остальное разбирает optimisticImage. */
export function asImage(url) {
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

/** Имя файла из папки сайта → адрес для <img>. В именах есть пробелы
    и кириллица — их надо закодировать, иначе часть хостингов отдаёт 404.
    Уже закодированное имя оставляем как есть. */
export function imagePath(name) {
  const clean = String(name || '').trim().replace(/\\/g, '/').replace(/^[./]+/, '');
  if (!clean) return '';
  const parts = clean.split('/').map(
    (part) => (/%[0-9a-f]{2}/i.test(part) ? part : encodeURIComponent(part))
  );
  return CONFIG.imageDir + parts.join('/');
}

/** Имена файлов из колонки «Скрины» → адреса картинок в папке сайта.
    Всё, что не похоже на имя картинки, пропускаем: в ячейке может быть
    и обычная заметка. */
export function localImages(value) {
  return String(value || '')
    .split(/[,;|\r\n]+/)
    .map((part) => part.trim())
    .filter((part) => part && !HAS_URL.test(part) && IMG_RE.test(part))
    .map((name) => imagePath(name));
}

/** Для колонки со скринами: чего не узнали — всё равно пробуем показать
    картинкой. Не загрузилось — картинка на странице сама заменится ссылкой,
    так что колонка работает с любым файлообменником, а не только со знакомыми. */
export function optimisticImage(url) {
  return asImage(url) || url;
}

/** Список картинок из папки сайта: игра → иконка и скрины.
    Файла нет или он сломан — просто работаем без картинок из папки,
    колонка «Скрины» в таблице от этого не страдает. */
export async function loadImages() {
  try {
    const res = await fetch(CONFIG.imagesFile, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return buildImageIndex(data && data.games ? data.games : data);
  } catch {
    return new Map();
  }
}

/** Одна запись списка: «файл», ['файл', 'файл'] или {icon, shots}. */
function imageEntry(raw) {
  const list = (value) => (Array.isArray(value) ? value : [value])
    .filter((v) => typeof v === 'string' && v.trim());

  if (!raw) return null;
  if (typeof raw === 'string' || Array.isArray(raw)) return { icon: '', shots: list(raw) };
  return {
    icon: typeof raw.icon === 'string' ? raw.icon.trim() : '',
    shots: list(raw.shots !== undefined ? raw.shots : raw.shot),
  };
}

/** Короткое имя игры — то, что стоит до первого разделителя:
    «Крутой побег. Обби, блин.» → «крутой побег». Нужно, чтобы картинки
    не отвалились, если в таблице подрежут хвост названия. */
function shortTitleKey(title) {
  return norm(String(title).split(/[.:|\/]|—|–|,\s/)[0]);
}

/** Названия игр → картинки. Сравниваем так же нестрого, как названия колонок:
    регистр, ё/е и лишние пробелы не важны. */
function buildImageIndex(map) {
  const index = new Map();
  const shorts = new Map();

  Object.keys(map || {}).forEach((title) => {
    const entry = imageEntry(map[title]);
    if (!entry || (!entry.icon && !entry.shots.length)) return;

    const key = norm(title);
    index.set(key, entry);

    const short = shortTitleKey(title);
    // короткое имя годится, только если оно ведёт к одной-единственной игре
    if (short && short !== key) shorts.set(short, shorts.has(short) ? null : entry);
  });

  shorts.forEach((entry, key) => { if (entry && !index.has(key)) index.set(key, entry); });
  return index;
}
