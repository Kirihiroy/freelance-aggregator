// Freelancejob.ru. Фильтр по разделам на сайте не работает (отдаёт общий список),
// а страница «Работа для программистов» обновляется с опозданием. Поэтому берём:
//  - общий список свежих заказов, отфильтрованный по IT-словам в заголовке;
//  - страницу «Работа для программистов» целиком.
const cheerio = require('cheerio');
const { get, sleep, parsePrice, moscowToIso, clean, IT_WORDS } = require('./common');

const PAGES = [
  { url: 'https://www.freelancejob.ru/projects/', category: null, itFilter: true },
  { url: 'https://www.freelancejob.ru/projects/p2/', category: null, itFilter: true },
  { url: 'https://www.freelancejob.ru/vacancies/rabota-dlya-programmistov/', category: 'Работа для программистов', itFilter: false },
];

async function fetchFreelancejob() {
  const out = new Map();
  for (const page of PAGES) {
    const $ = cheerio.load(await get(page.url));
    $('div.x17').each((_, el) => {
      const c = $(el);
      const a = c.find('a.big').first();
      const href = a.attr('href') || '';
      const id = (href.match(/(\d+)/) || [])[1];
      if (!id || out.has(id)) return;
      const title = clean(a.text());
      const description = clean(c.children('div').eq(1).text());
      if (page.itFilter && !IT_WORDS.test(title)) return;
      const budget = c.find('.x18').text();
      const info = c.find('.x20').text();
      const d = info.match(/(\d{2}\.\d{2}\.\d{4})\s*в\s*(\d{2}:\d{2})/);
      out.set(id, {
        id: 'fj:' + id,
        source: 'Freelancejob',
        title,
        description: description.slice(0, 600),
        url: new URL(href, 'https://www.freelancejob.ru').href,
        price: /договор/i.test(budget) ? null : parsePrice(c.find('.x19').text() || budget),
        category: page.category || 'IT',
        date: d ? moscowToIso(`${d[1]} ${d[2]}`) : null,
        offers: parseInt((info.match(/Ответов:\s*(\d+)/) || [])[1], 10) || null,
      });
    });
    await sleep(1200);
  }
  return [...out.values()];
}

module.exports = fetchFreelancejob;
