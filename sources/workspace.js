// Workspace.ru — тендеры (обычно крупные проекты под ключ). Берём только открытые.
const cheerio = require('cheerio');
const { get, sleep, parsePrice, clean } = require('./common');

const CATEGORIES = {
  'web-development': 'Разработка сайтов',
  'apps-development': 'Мобильные приложения',
  'crm': 'CRM',
  'gamedev': 'Геймдев',
};
const PAGES = 2;

const MONTHS = { январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6, июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12 };

// "20 ноября 2026" -> ISO (полдень по Москве — время не указано)
function ruDate(text) {
  const m = (text || '').match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (!m) return null;
  const key = Object.keys(MONTHS).find((k) => m[2].toLowerCase().startsWith(k));
  if (!key) return null;
  const mm = String(MONTHS[key]).padStart(2, '0');
  return new Date(`${m[3]}-${mm}-${m[1].padStart(2, '0')}T12:00:00+03:00`).toISOString();
}

// "от 50 000 до 200 000" / "до 200 000" / "от 50 000" / "100 000"
function budget(text) {
  const t = clean(text);
  const from = t.match(/от\s*([\d\s]+)/i);
  const to = t.match(/до\s*([\d\s]+)/i);
  if (from || to) {
    const a = from && parsePrice(from[1]);
    const b = to && parsePrice(to[1]);
    return { price: a || b || null, priceMax: a && b ? b : null };
  }
  return { price: parsePrice(t), priceMax: null };
}

async function fetchWorkspace() {
  const out = [];
  for (const [cat, name] of Object.entries(CATEGORIES)) {
    for (let page = 1; page <= PAGES; page++) {
      const $ = cheerio.load(await get(`https://workspace.ru/tenders/${cat}/?page=${page}`));
      const cards = $('.vacancies__card._tender');
      if (!cards.length) break;
      cards.each((_, el) => {
        const c = $(el);
        if (c.find('[data-change-status-text]').attr('data-change-status-text') !== 'open') return;
        const a = c.find('.b-tender__title a').first();
        const href = a.attr('href') || '';
        const id = (href.match(/-(\d+)\/?$/) || [])[1];
        if (!id) return;
        const info = {};
        c.find('.b-tender__info-item').each((_, it) => {
          info[clean($(it).find('.b-tender__info-item-title').text())] = clean($(it).find('.b-tender__info-item-text').text());
        });
        const deadline = Object.entries(info).find(([k]) => /срок/i.test(k));
        out.push({
          id: 'ws:' + id,
          source: 'Workspace',
          title: clean(a.text()),
          description: deadline ? `Тендер. Приём заявок до ${deadline[1]}.` : 'Тендер.',
          url: new URL(href, 'https://workspace.ru').href,
          ...budget(c.find('.b-tender__block--title .b-tender__info-item-text').first().text()),
          category: name,
          date: ruDate(info['Опубликован']),
        });
      });
      await sleep(1200);
    }
  }
  return out;
}

module.exports = fetchWorkspace;
