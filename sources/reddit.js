// Reddit — сабреддиты, где заказчики ищут исполнителей (r/forhire и др.).
// Анонимный доступ Reddit блокирует, поэтому нужен бесплатный ключ официального API:
// создай приложение типа "script" на https://www.reddit.com/prefs/apps и впиши
// client_id и client_secret в reddit.json (см. reddit.example.json и README).
const fs = require('fs');
const path = require('path');
const { sleep, clean, IT_WORDS, loadUsdRub } = require('./common');

const CONFIG = path.join(__dirname, '..', 'reddit.json');
const UA = 'windows:freelance-aggregator:1.0 (personal, read-only)';

// по умолчанию: сабреддит -> тег «ищу исполнителя» в заголовке или флейре поста
const DEFAULT_SUBREDDITS = {
  forhire: '[hiring]',
  freelance_forhire: '[hiring]',
  jobbit: '[hiring]',
  slavelabour: '[task]',
  gameDevClassifieds: '[paid]',
};

let token = null;
let tokenExp = 0;

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    if (c.client_id && c.client_secret && !/^ВСТАВЬ/.test(c.client_id)) return c;
  } catch { /* нет файла — источник не настроен */ }
  return null;
}

async function getToken(cfg) {
  if (token && Date.now() < tokenExp) return token;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error(`Reddit не выдал токен (HTTP ${res.status}${j.error ? ', ' + j.error : ''}) — проверь ключи в reddit.json`);
  }
  token = j.access_token;
  tokenExp = Date.now() + (j.expires_in - 60) * 1000;
  return token;
}

// "$500", "$1,500", "500 USD", "$20/hr"
function usdPrice(text) {
  const m = text.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i) || text.match(/(\d[\d,]*)\s*(?:usd|dollars)/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(/,/g, ''));
  if (m[2]) v *= 1000;
  return v > 0 ? v : null;
}

async function fetchReddit() {
  const cfg = loadConfig();
  if (!cfg) return null; // не настроен — сервер покажет «нужен ключ»
  const tok = await getToken(cfg);
  const rate = await loadUsdRub();
  const subs = cfg.subreddits || DEFAULT_SUBREDDITS;
  const out = [];
  const errors = [];

  for (const [sub, tag] of Object.entries(subs)) {
    try {
      const res = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/new?limit=100&raw_json=1`, {
        headers: { Authorization: `Bearer ${tok}`, 'User-Agent': UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      // "[hiring]" -> ищем и "[Hiring]" в заголовке, и "Hiring" во флейре
      const word = tag.replace(/[[\]]/g, '').trim();
      const tagRe = new RegExp(`(^|\\[)\\s*${word.replace(/[.*+?^${}()|\\]/g, '\\$&')}(?![a-z])`, 'i');
      for (const { data: p } of j.data?.children || []) {
        const titleTags = (p.title.match(/\[[^\]]*\]/g) || []).join(' ');
        if (!tagRe.test(titleTags) && !tagRe.test((p.link_flair_text || '').trim())) continue;
        const title = clean(p.title.replace(/\[[^\]]*\]/g, ' '));
        const body = clean(p.selftext || '');
        // в общих сабреддитах (r/forhire) много дизайна, текстов, монтажа — оставляем IT
        if (cfg.itFilter !== false && !IT_WORDS.test(title + ' ' + body.slice(0, 300))) continue;
        const usd = usdPrice(p.title) ?? usdPrice(body.slice(0, 1500));
        const hourly = usd && /\/\s?h(ou)?r|per hour|hourly/i.test(p.title + ' ' + body.slice(0, 1500));
        out.push({
          id: 'reddit:' + p.id,
          source: 'Reddit',
          title: title || p.title,
          description: body.slice(0, 600),
          url: 'https://www.reddit.com' + p.permalink,
          price: usd && rate ? Math.round(usd * rate) : null,
          priceUnit: hourly ? 'час' : null,
          priceNote: usd ? `$${usd}${hourly ? '/час' : ''}` : null,
          category: 'r/' + sub,
          date: new Date(p.created_utc * 1000).toISOString(),
          offers: p.num_comments ?? null,
        });
      }
    } catch (e) {
      errors.push(`r/${sub}: ${e.message}`);
    }
    await sleep(1000);
  }
  if (errors.length && !out.length) throw new Error(errors.join('; '));
  if (errors.length) console.warn('Reddit:', errors.join('; '));
  return out;
}

module.exports = fetchReddit;
