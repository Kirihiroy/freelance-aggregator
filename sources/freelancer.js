// Freelancer.com — официальный открытый API (без ключа). Заказы на английском,
// бюджеты в разных валютах — пересчитываем в рубли по курсу ЦБ.
const { get, clean, loadUsdRub } = require('./common');

const IT_CATEGORIES = new Set(['Websites, IT & Software', 'Mobile Phones & Computing', 'Artificial Intelligence']);

// Теги, которые Freelancer.com относит к IT-категориям, хотя это не программирование
const NOT_DEV_TAGS = new Set([
  'SEO', 'Digital Marketing', 'Link Building', 'Internet Marketing', 'Website Optimization', 'Google Adwords',
  'Search Engine Marketing', 'AI Content Creation', 'AI Art Creation', 'AI Image Generation', 'AI Video Editing',
  'AI Video Creation', 'AI Voice Generation', 'AI Design', 'Prompt Engineering', 'Data Entry', 'Web Search',
  'Content Writing', 'Website Testing', 'Social Media Marketing',
]);
// Заголовки «не про код»: промпты, SEO, реклама, монтаж, тексты…
const NOT_DEV_TITLE = /\bprompts?\b|\bseo\b|\blogo\b|video edit|\breels?\b|voice ?over|\barticles?\b|blog posts?|content writ|backlinks?|copywrit|data entry|social media|thumbnail|translat|\bads\b|marketing|branding/i;
// Это не разработка, даже если рядом есть «website» («Website Form Data Entry»)
const NEVER_DEV_TITLE = /data entry|details entry|\bparticipants?\b|recruit|\bresumes?\b|\btrainer\b|for sale|\bexcel\b|transcri|radio host|cartograph/i;
// …но если в заголовке есть и разработка («SEO website build»), заказ оставляем
const DEV_TITLE = /\b(?:websites?|web ?app|apps?|stores?|shop|bots?|scripts?|api|platform|plugin|portal|dashboard|develop\w*|build|integrat\w*|fix|bugs?|backend|frontend|saas|crm|automation|scraper)\b/i;

function isDevProject(p) {
  const jobs = p.jobs || [];
  // хотя бы треть тегов — программирование (IT-категория и не из списка NOT_DEV_TAGS)
  const dev = jobs.filter((jb) => IT_CATEGORIES.has(jb.category?.name) && !NOT_DEV_TAGS.has(jb.name)).length;
  if (!dev || dev * 3 < jobs.length) return false;
  const title = p.title || '';
  if (NEVER_DEV_TITLE.test(title)) return false;
  if (NOT_DEV_TITLE.test(title) && !DEV_TITLE.test(title.replace(new RegExp(NOT_DEV_TITLE, 'gi'), ' '))) return false;
  return true;
}

const NON_IT_SOURCE = 'Freelancer.com · не IT';
const PAGES = 5;
const PER_PAGE = 100;

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
      // не-IT заказы не выбрасываем, а кладём в отдельный источник (в интерфейсе он выключен по умолчанию)
      const isDev = isDevProject(p);
      const jobs = p.jobs || [];
      const cur = p.currency || {};
      const toRub = (v) => (v && rate && cur.exchange_rate ? Math.round(v * cur.exchange_rate * rate) : null);
      const hourly = p.type === 'hourly';
      const min = p.budget?.minimum;
      const max = p.budget?.maximum;
      const orig = min ? `${SIGN[cur.code] || cur.code + ' '}${min}${max && max !== min ? '–' + max : ''}${hourly ? '/час' : ''}` : '';
      out.push({
        id: 'flcom:' + p.id,
        source: isDev ? 'Freelancer.com' : NON_IT_SOURCE,
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
module.exports.isDevProject = isDevProject;
