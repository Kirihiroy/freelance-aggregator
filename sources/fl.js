// FL.ru — официальные RSS-ленты по категориям
const cheerio = require('cheerio');
const { get, sleep, parsePrice, clean } = require('./common');

const CATEGORIES = { 2: 'Сайты', 5: 'Программирование' };

async function fetchFl() {
  const out = [];
  for (const cat of Object.keys(CATEGORIES)) {
    const xml = await get(`https://www.fl.ru/rss/all.xml?category=${cat}`);
    const $ = cheerio.load(xml, { xmlMode: true });
    $('item').each((_, el) => {
      const it = $(el);
      let title = clean(it.find('title').text());
      let price = null;
      const b = title.match(/\(Бюджет:\s*([^)]*)\)\s*$/);
      if (b) {
        price = parsePrice(b[1].replace(/&#8381;|₽/g, ''));
        title = clean(title.slice(0, b.index));
      }
      const url = clean(it.find('link').text());
      const desc = cheerio.load(it.find('description').text()).text();
      out.push({
        id: 'fl:' + (url.match(/projects\/(\d+)/) || [, url])[1],
        source: 'FL.ru',
        title,
        description: clean(desc).slice(0, 600),
        url,
        price,
        category: clean(it.find('category').text()),
        date: new Date(it.find('pubDate').text()).toISOString(),
      });
    });
    await sleep(1000);
  }
  return out;
}

module.exports = fetchFl;
