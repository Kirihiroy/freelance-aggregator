// Проверка, не закрыт ли заказ: исполнителя уже выбрали, заказ в архиве или удалён.
// Закрытым заказам ставится o.closed = дата; интерфейс их скрывает (можно показать галочкой).
//
// Как узнаём по площадкам:
//   Kwork          — выдача читается целиком (см. sources/kwork.js), пропал из неё = закрыт (это делает server.js)
//   Freelancer.com — статус заказа из официального API, пачками по 100
//   FL.ru, Workspace, Freelancejob — надпись на странице заказа (по одной странице, с паузами)
//   Freelance.ru, Telegram, Reddit — признака закрытия нет, не проверяются
const { get, sleep } = require('./sources/common');

const RECHECK_MIN = 60;     // одну и ту же страницу заказа проверяем не чаще раза в час
const MAX_PAGES = 40;       // страниц заказов за один проход (проход — раз в 10 минут)
const PAGE_PAUSE_MS = 2000; // пауза между страницами, чтобы не нагружать площадки

const PAGE_RULES = {
  'FL.ru': /Заказ находится в архиве|Исполнитель (?:определ|выбран)/i,
  'Workspace': /При[её]м заявок заверш[её]н|Тендер заверш[её]н/i,
  'Freelancejob': /Предложение отклонено администрацией/i,
};
const FLCOM = ['Freelancer.com', 'Freelancer.com · не IT'];

const closedState = { running: false, closed: 0, lastRun: null, error: null };
const httpCode = (e) => Number((String(e.message).match(/^HTTP (\d+)/) || [])[1]) || 0;

// Freelancer.com: проверяем только те заказы, которых нет в свежей выдаче активных
async function checkFreelancer(orders, seenIds, now) {
  const ids = [...orders.values()]
    .filter((o) => FLCOM.includes(o.source) && !o.closed && !seenIds.has(o.id))
    .map((o) => o.id.split(':')[1]);
  for (let i = 0; i < ids.length && i < 500; i += 100) {
    const batch = ids.slice(i, i + 100);
    const j = JSON.parse(await get('https://www.freelancer.com/api/projects/0.1/projects/?compact=true&' +
      batch.map((id) => 'projects[]=' + id).join('&')));
    const found = j.result?.projects || {};
    for (const id of batch) {
      const p = found[id];
      if (!p || p.status !== 'active' || p.frontend_project_status !== 'open') orders.get('flcom:' + id).closed = now;
    }
    await sleep(1000);
  }
}

async function checkPages(orders, now) {
  const due = [...orders.values()]
    .filter((o) => PAGE_RULES[o.source] && !o.closed &&
      (!o.checkedAt || Date.now() - new Date(o.checkedAt) > RECHECK_MIN * 60000))
    .sort((a, b) => (a.checkedAt || '').localeCompare(b.checkedAt || ''))
    .slice(0, MAX_PAGES);
  const blocked = new Set(); // площадка ответила 403/429 — до следующего прохода её не трогаем
  for (const o of due) {
    if (blocked.has(o.source)) continue;
    try {
      const html = await get(o.url);
      if (PAGE_RULES[o.source].test(html)) o.closed = now;
    } catch (e) {
      const code = httpCode(e);
      if (code === 404 || code === 410) o.closed = now;     // заказ удалён
      else if (code === 403 || code === 429) blocked.add(o.source);
    }
    o.checkedAt = now;
    await sleep(PAGE_PAUSE_MS);
  }
}

async function checkClosed(orders, seenIds, save) {
  if (closedState.running) return;
  closedState.running = true;
  const now = new Date().toISOString();
  let error = null;
  try { await checkFreelancer(orders, seenIds, now); } catch (e) { error = 'Freelancer.com: ' + e.message; }
  try { await checkPages(orders, now); } catch (e) { error = e.message; }
  closedState.error = error;
  closedState.closed = [...orders.values()].filter((o) => o.closed).length;
  closedState.lastRun = now;
  closedState.running = false;
  save();
}

module.exports = { checkClosed, closedState, PAGE_CHECKED: Object.keys(PAGE_RULES) };
