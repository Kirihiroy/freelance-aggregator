// Freelancer.com — официальный открытый API (без ключа). Заказы на английском,
// бюджеты в разных валютах — пересчитываем в рубли по курсу ЦБ.
const { get, clean } = require('./common');

const IT_CATEGORIES = new Set(['Websites, IT & Software', 'Mobile Phones & Computing', 'Artificial Intelligence']);
const PAGES = 5;
const PER_PAGE = 100;

let usdRub = null; // последний известный курс — если ЦБ недоступен, используем его

async function loadUsdRub() {
  try {
    const j = JSON.parse(await get('https://www.cbr-xml-daily.ru/daily_json.js'));
    usdRub = j.Valute.USD.Value;
  } catch (e) {
    console.warn('Freelancer.com: не удалось получить курс ЦБ —', e.message);
  }
  return usdRub;
}

const SIGN = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$' };

async function fetchFreelancer() {
  const rate = await loadUsdRub();
  const out = [];
  for (let page = 0; page < PAGES; page++) {
    const url =
      'https://www.freelancer.com/api/projects/0.1/projects/active/' +
      `?limit=${PER_PAGE}&offset=${page * PER_PAGE}&job_details=true&compact=true`;
    const j = JSON.parse(await get(url));
    const projects = j.result?.projects || [];
    for (const p of projects) {
      const jobs = p.jobs || [];
      // минимум половина тегов — из IT-категорий; иначе пролезают монтаж, логотипы, маркетинг
      // (у них часто есть один IT-тег вроде «Adobe Premiere Pro» или «Digital Marketing»)
      const itCount = jobs.filter((jb) => IT_CATEGORIES.has(jb.category?.name)).length;
      if (!itCount || itCount * 2 < jobs.length) continue;
      const cur = p.currency || {};
      const toRub = (v) => (v && rate && cur.exchange_rate ? Math.round(v * cur.exchange_rate * rate) : null);
      const hourly = p.type === 'hourly';
      const min = p.budget?.minimum;
      const max = p.budget?.maximum;
      const orig = min ? `${SIGN[cur.code] || cur.code + ' '}${min}${max && max !== min ? '–' + max : ''}${hourly ? '/час' : ''}` : '';
      out.push({
        id: 'flcom:' + p.id,
        source: 'Freelancer.com',
        title: clean(p.title),
        description: clean(p.preview_description || p.description).slice(0, 600),
        url: `https://www.freelancer.com/projects/${p.seo_url}`,
        price: toRub(min),
        priceMax: max && max !== min ? toRub(max) : null,
        priceUnit: hourly ? 'час' : null,
        priceNote: orig || null,
        category: jobs.slice(0, 3).map((jb) => jb.name).join(', '),
        date: new Date((p.time_submitted || p.submitdate) * 1000).toISOString(),
        offers: p.bid_stats?.bid_count ?? null,
      });
    }
    if (projects.length < PER_PAGE) break;
  }
  return out;
}

module.exports = fetchFreelancer;
