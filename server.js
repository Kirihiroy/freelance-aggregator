const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const REFRESH_MIN = 10;          // как часто обновлять заказы (минуты)
const KEEP_DAYS = 14;            // сколько дней хранить старые заказы
const DATA_FILE = path.join(__dirname, 'data', 'orders.json');

const SOURCES = {
  'FL.ru': require('./sources/fl'),
  'Kwork': require('./sources/kwork'),
  'Freelance.ru': require('./sources/freelanceru'),
  'Freelancejob': require('./sources/freelancejob'),
  'Workspace': require('./sources/workspace'),
  'Freelancer.com': require('./sources/freelancer'),
  'Telegram': require('./sources/telegram'),
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
  await Promise.all(
    Object.entries(SOURCES).map(async ([name, fn]) => {
      try {
        const list = await fn();
        let added = 0;
        for (const o of list) {
          const prev = orders.get(o.id);
          // заказ уже пришёл с самой биржи — её данные полнее (цена, отклики), репост из Telegram не нужен
          if (prev && o.source === 'Telegram' && prev.source !== 'Telegram') continue;
          if (!prev) added++;
          orders.set(o.id, { ...o, date: o.date || prev?.date || now, firstSeen: prev?.firstSeen || now });
        }
        status.sources[name] = { ok: true, count: list.length, added, at: now };
        console.log(`[${new Date().toLocaleTimeString()}] ${name}: ${list.length} заказов, новых ${added}`);
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
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/orders') {
    const list = [...orders.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return send(res, 200, { status, orders: list });
  }
  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    await refresh();
    return send(res, 200, { ok: true });
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
