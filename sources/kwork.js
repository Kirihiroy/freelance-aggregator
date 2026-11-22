// Kwork — биржа проектов, категория «Разработка и IT» (c=11).
// Данные встроены в страницу как JSON-массив "wants".
const { get, sleep, moscowToIso, clean } = require('./common');

const MAX_PAGES = 10;

function extractArray(html, key) {
  const start = html.indexOf(`"${key}":[`);
  if (start < 0) return null;
  const from = start + key.length + 3; // index of '['
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return JSON.parse(html.slice(from, i + 1));
  }
  return null;
}

async function fetchKwork() {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await get(`https://kwork.ru/projects?c=11&page=${page}`);
    const wants = extractArray(html, 'wants');
    if (!wants || wants.length === 0) { out.complete = page > 1; break; }
    for (const w of wants) {
      const price = Math.round(parseFloat(w.priceLimit)) || null;
      const max = Math.round(parseFloat(w.possiblePriceLimit)) || null;
      out.push({
        id: 'kwork:' + w.id,
        source: 'Kwork',
        title: clean(w.name),
        description: clean(w.description).slice(0, 600),
        url: `https://kwork.ru/projects/${w.id}`,
        price,
        priceMax: max && price && max > price ? max : null,
        category: 'Разработка и IT',
        date: moscowToIso(w.date_active || w.date_create),
        offers: w.kwork_count != null ? Number(w.kwork_count) : null,
      });
    }
    const last = html.match(/"last_page":(\d+)/);
    // дочитали до последней страницы — выдача полная, и заказ, которого в ней нет, закрыт (см. closed.js)
    if (last && page >= Number(last[1])) { out.complete = true; break; }
    await sleep(1500);
  }
  return out;
}

module.exports = fetchKwork;
