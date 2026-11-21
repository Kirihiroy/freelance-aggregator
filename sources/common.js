const { decodeHTML } = require('entities');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "20 000 ₽" / "от 2 000" -> 20000 / 2000; null if no number
function parsePrice(text) {
  if (!text) return null;
  const m = String(text).replace(/&#8381;/g, '').match(/\d[\d\s ]*/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/[\s ]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Moscow time "2026-11-20 23:52:01" or "20.11.2026 23:05" -> ISO
function moscowToIso(text) {
  if (!text) return null;
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+03:00`).toISOString();
  m = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+03:00`).toISOString();
  return null;
}

// drop tags, decode HTML entities, collapse whitespace
const clean = (s) =>
  decodeHTML((s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

module.exports = { get, sleep, parsePrice, moscowToIso, clean };
