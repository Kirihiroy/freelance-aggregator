// Freelance.ru — категории «Веб-разработка и IT» (4) и «ИИ и Нейросети» (724)
const cheerio = require('cheerio');
const { get, sleep, parsePrice, moscowToIso, clean } = require('./common');

const PAGES = 3;

async function fetchFreelanceRu() {
  const out = [];
  for (let page = 1; page <= PAGES; page++) {
    const html = await get(`https://freelance.ru/task?c%5B%5D=4&c%5B%5D=724&page=${page}`);
    const $ = cheerio.load(html);
    const cards = $('article.task-card');
    if (cards.length === 0) break;
    cards.each((_, el) => {
      const c = $(el);
      const a = c.find('a.task-card__title-link');
      const href = a.attr('href') || '';
      const budget = c.find('.task-card__budget .bold').first();
      const price = budget.hasClass('cost-not-set') ? null : parsePrice(budget.text());
      out.push({
        id: 'frru:' + (href.match(/(\d+)/) || [, href])[1],
        source: 'Freelance.ru',
        title: clean(a.attr('title') || a.text()),
        description: clean(c.find('.task-card__desc').text()).slice(0, 600),
        url: new URL(href, 'https://freelance.ru').href,
        price,
        category: clean(c.find('.task-chip--cat').first().text()),
        date: moscowToIso(c.find('.task-card__foot-item[title]').first().attr('title')),
        offers: parseInt(c.find('.fa-comments').parent().text(), 10) || null,
      });
    });
    await sleep(1500);
  }
  return out;
}

module.exports = fetchFreelanceRu;
