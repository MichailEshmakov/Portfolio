// Сайт статический: весь контент лежит в data/games.json, разметка строится здесь.
// Чтобы добавить игру — допиши объект в массив "games", HTML трогать не нужно.

const DATA_URL = 'data/games.json';

const grid = document.getElementById('grid');
const filtersBox = document.getElementById('filters');
const emptyNote = document.getElementById('empty');

let allGames = [];
let activeFilter = 'all';

init();

async function init() {
  document.getElementById('year').textContent = new Date().getFullYear();

  let data;
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
    data = await response.json();
  } catch (error) {
    showFatal(error);
    return;
  }

  fillProfile(data.profile || {});
  allGames = Array.isArray(data.games) ? data.games : [];
  renderFilters(allGames);
  renderGames(allGames);
}

function fillProfile(profile) {
  document.querySelectorAll('[data-profile]').forEach((node) => {
    const key = node.dataset.profile;
    if (key === 'links') {
      node.replaceChildren(...(profile.links || []).map(makeProfileLink));
      return;
    }
    if (profile[key]) node.textContent = profile[key];
  });
  if (profile.name) document.title = profile.name + ' — портфолио игр';
}

function makeProfileLink(link) {
  const anchor = document.createElement('a');
  anchor.href = link.url;
  anchor.textContent = link.label;
  if (isExternal(link.url)) {
    anchor.rel = 'noopener';
    anchor.target = '_blank';
  }
  return anchor;
}

function renderFilters(games) {
  const platforms = [...new Set(games.flatMap((game) => game.platforms || []))].sort();
  if (platforms.length < 2) {
    filtersBox.hidden = true;
    return;
  }

  const buttons = ['all', ...platforms].map((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = value === 'all' ? 'Все' : value;
    button.setAttribute('aria-pressed', String(value === activeFilter));
    button.addEventListener('click', () => {
      activeFilter = value;
      filtersBox.querySelectorAll('button').forEach((other) => {
        other.setAttribute('aria-pressed', String(other === button));
      });
      renderGames(allGames);
    });
    return button;
  });

  filtersBox.replaceChildren(...buttons);
}

function renderGames(games) {
  const visible = games.filter(
    (game) => activeFilter === 'all' || (game.platforms || []).includes(activeFilter)
  );
  const sorted = [...visible].sort((a, b) => (b.year || 0) - (a.year || 0));

  grid.replaceChildren(...sorted.map(makeCard));
  emptyNote.hidden = sorted.length > 0;
}

function makeCard(game) {
  const item = document.createElement('li');
  item.className = 'card';

  item.append(makeCover(game));

  const body = document.createElement('div');
  body.className = 'card__body';

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = game.title || 'Без названия';
  body.append(title);

  const metaParts = [game.year, game.engine, game.role].filter(Boolean);
  if (metaParts.length) {
    const meta = document.createElement('p');
    meta.className = 'card__meta';
    meta.textContent = metaParts.join(' · ');
    body.append(meta);
  }

  if (game.summary) {
    const summary = document.createElement('p');
    summary.className = 'card__summary';
    summary.textContent = game.summary;
    body.append(summary);
  }

  const chips = [...(game.platforms || []), ...(game.tags || [])];
  if (chips.length) {
    const tags = document.createElement('ul');
    tags.className = 'tags';
    tags.append(...chips.map((chip) => {
      const tag = document.createElement('li');
      tag.textContent = chip;
      return tag;
    }));
    body.append(tags);
  }

  if ((game.links || []).length) {
    const links = document.createElement('div');
    links.className = 'card__links';
    links.append(...game.links.map((link) => {
      const anchor = makeProfileLink(link);
      if (link.primary) anchor.className = 'primary';
      return anchor;
    }));
    body.append(links);
  }

  item.append(body);
  return item;
}

function makeCover(game) {
  if (!game.cover) {
    const stub = document.createElement('div');
    stub.className = 'card__cover card__cover--empty';
    stub.textContent = '🎮';
    stub.setAttribute('aria-hidden', 'true');
    return stub;
  }
  const image = document.createElement('img');
  image.className = 'card__cover';
  image.src = game.cover;
  image.alt = 'Скриншот игры «' + (game.title || '') + '»';
  image.loading = 'lazy';
  image.addEventListener('error', () => image.replaceWith(makeCover({ ...game, cover: null })));
  return image;
}

function isExternal(url) {
  return /^https?:/i.test(url || '');
}

function showFatal(error) {
  emptyNote.hidden = false;
  emptyNote.textContent =
    'Не удалось загрузить ' + DATA_URL + ' (' + error.message + '). ' +
    'Открывать сайт нужно через локальный сервер, а не двойным кликом по файлу.';
}
