const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const REFRESH_MIN = 10;          // как часто обновлять заказы (минуты)
const KEEP_DAYS = 14;            // сколько дней хранить старые заказы
const DATA_FILE = path.join(__dirname, 'data', 'orders.json');
const { translatePending, translatorState } = require('./translator');
const { checkClosed, closedState, PAGE_CHECKED } = require('./closed');

const SOURCES = {
  'FL.ru': require('./sources/fl'),
  'Kwork': require('./sources/kwork'),
  'Freelance.ru': require('./sources/freelanceru'),
  'Freelancejob': require('./sources/freelancejob'),
  'Workspace': require('./sources/workspace'),
  'Freelancer.com': require('./sources/freelancer'),
  'Telegram': require('./sources/telegram'),
  'Reddit': require('./sources/reddit'),
};

let orders = new Map();
let status = { lastRun: null, running: false, sources: {} };

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    orders = new Map(data.orders.map((o) => [o.id, o]));
    status.lastRun = data.lastRun || null;
    status.sources = data.sources || {};
  } catch { /* первый запуск */ }
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ lastRun: status.lastRun, sources: status.sources, orders: [...orders.values()] }));
}

async function refresh() {
  if (status.running) return;
  status.running = true;
  const now = new Date().toISOString();
  const seenIds = new Set(); // заказы, которые есть в свежей выдаче
  await Promise.all(
    Object.entries(SOURCES).map(async ([name, fn]) => {
      try {
        const list = await fn();
        if (list === null) {
          // источник требует настройки (например, ключ Reddit) — не ошибка
          status.sources[name] = { ok: true, disabled: true, count: 0, at: now };
          return;
        }
        let added = 0;
        for (const o of list) {
          const prev = orders.get(o.id);
          // заказ уже пришёл с самой биржи — её данные полнее (цена, отклики), репост из Telegram не нужен
          if (prev && o.source === 'Telegram' && prev.source !== 'Telegram') continue;
          if (!prev) added++;
          // готовый перевод сохраняем, если текст заказа не поменялся
          const tr = prev?.tr && prev.title === o.title && prev.description === o.description ? prev.tr : undefined;
          // пометку «закрыт» по странице заказа сохраняем (в ленте площадки заказ может ещё висеть);
          // для остальных площадок заказ в свежей выдаче — открыт
          const keep = PAGE_CHECKED.includes(o.source) ? { closed: prev?.closed, checkedAt: prev?.checkedAt } : {};
          orders.set(o.id, { ...o, date: o.date || prev?.date || now, firstSeen: prev?.firstSeen || now, ...(tr ? { tr } : {}), ...keep });
          seenIds.add(o.id);
        }
        // площадка отдала выдачу целиком (Kwork) — чего в ней нет, то закрыто
        if (list.complete) {
          for (const o of orders.values()) if (o.source === name && !seenIds.has(o.id) && !o.closed) o.closed = now;
        }
        // источник может вернуть заказы под несколькими именами (Freelancer.com и «Freelancer.com · не IT»)
        const counts = { [name]: 0 };
        for (const o of list) counts[o.source] = (counts[o.source] || 0) + 1;
        for (const [src, count] of Object.entries(counts)) {
          status.sources[src] = { ok: true, count, ...(src === name ? { added } : {}), at: now };
        }
        console.log(`[${new Date().toLocaleTimeString()}] ${name}: ${counts[name]} заказов, новых ${added}` +
          Object.entries(counts).filter(([s]) => s !== name).map(([s, c]) => `; ${s}: ${c}`).join(''));
      } catch (e) {
        status.sources[name] = { ok: false, error: e.message, at: now };
        console.error(`[${new Date().toLocaleTimeString()}] ${name}: ошибка — ${e.message}`);
      }
    })
  );
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  for (const [id, o] of orders) if (new Date(o.firstSeen).getTime() < cutoff) orders.delete(id);
  status.lastRun = now;
  status.running = false;
  save();
  translatePending(orders, save); // в фоне, не ждём
  checkClosed(orders, seenIds, save); // тоже в фоне
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/orders') {
    const list = [...orders.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return send(res, 200, { status: { ...status, translate: translatorState, closed: closedState }, orders: list });
  }
  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    await refresh();
    return send(res, 200, { ok: true });
  }
  // иконка и описание приложения — чтобы у окна была своя иконка на панели задач
  if (url.pathname === '/icon.png') return send(res, 200, fs.readFileSync(path.join(__dirname, 'app', 'icon.png')), 'image/png');
  if (url.pathname === '/favicon.ico') return send(res, 200, fs.readFileSync(path.join(__dirname, 'app', 'icon.ico')), 'image/x-icon');
  if (url.pathname === '/manifest.webmanifest') {
    return send(res, 200, {
      name: 'IT-заказы', short_name: 'IT-заказы', start_url: '/', display: 'standalone',
      background_color: '#f4f5f7', theme_color: '#2563eb',
      icons: [{ src: '/icon.png', sizes: '256x256', type: 'image/png', purpose: 'any' }],
    }, 'application/manifest+json; charset=utf-8');
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html')), 'text/html; charset=utf-8');
  }
  send(res, 404, { error: 'not found' });
});

load();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Агрегатор заказов запущен: http://localhost:${PORT}`);
  console.log(`Обновление каждые ${REFRESH_MIN} мин. Закрой это окно, чтобы остановить.`);
  refresh();
  setInterval(refresh, REFRESH_MIN * 60 * 1000);
});
