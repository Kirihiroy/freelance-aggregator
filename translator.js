// Автоперевод английских заказов на русский — локально, нейросетью NLLB-200 (Meta) через transformers.js.
// Никаких внешних сервисов и лимитов: модель (~0.9 ГБ) один раз скачивается в data/models и дальше работает офлайн.
// Перевод идёт в фоне: сначала заголовки (новые заказы первыми), затем описания.
// Отключить: переменная окружения TRANSLATE=0.
const path = require('path');

const MODEL = 'Xenova/nllb-200-distilled-600M';
const MODELS_DIR = path.join(__dirname, 'data', 'models');
const DESC_CHARS = 450; // описание переводим не целиком: в ленте видно 3 строки, полный текст — по ссылке
const THREADS = 2;      // чтобы перевод не нагружал весь процессор

const state = { enabled: process.env.TRANSLATE !== '0', loading: false, running: false, pending: 0, done: 0, error: null };
let translatorPromise = null;

function getTranslator() {
  if (!translatorPromise) {
    state.loading = true;
    translatorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = MODELS_DIR;
      const tr = await pipeline('translation', MODEL, { dtype: 'q8', session_options: { intraOpNumThreads: THREADS } });
      state.loading = false;
      return tr;
    })().catch((e) => {
      state.loading = false;
      translatorPromise = null;
      throw e;
    });
  }
  return translatorPromise;
}

// текст на английском, если латиницы заметно больше кириллицы
function isEnglish(text) {
  const lat = (text.match(/[a-z]/gi) || []).length;
  const cyr = (text.match(/[а-яё]/gi) || []).length;
  return lat >= 15 && lat > cyr * 3;
}

function needsTranslation(o) {
  return isEnglish(o.title + ' ' + (o.description || '').slice(0, 200));
}

// NLLB теряет хвост длинного текста, поэтому переводим по предложениям
function sentences(text) {
  return (text.match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);
}

// «Build My Online Store Website» → «Build my online store website»: Title Case нейросеть переводит заметно хуже.
// Аббревиатуры (SEO, AWS) и слова с заглавной внутри (WordPress, iOS) не трогаем.
function sentenceCase(s) {
  return s.split(' ').map((w, i) => (i === 0 || /^[A-Z0-9]{2,}$/.test(w) || /[a-z][A-Z]/.test(w) ? w : w.toLowerCase())).join(' ');
}

// версия перевода: при улучшении алгоритма увеличиваем — старые переводы переделаются
const TR_VERSION = 2;

async function translate(text) {
  const tr = await getTranslator();
  const out = await tr(text, { src_lang: 'eng_Latn', tgt_lang: 'rus_Cyrl' });
  return out[0].translation_text;
}

async function translateLong(text) {
  const parts = [];
  let len = 0;
  for (const s of sentences(text)) {
    if (len >= DESC_CHARS) break;
    parts.push(await translate(s.slice(0, 300)));
    len += s.length;
  }
  return parts.join(' ') + (len < text.length ? '…' : '');
}

/**
 * Переводит заказы без перевода. orders — Map id → заказ; save() сохраняет базу.
 * Перевод кладётся в o.tr = { title, description }.
 */
async function translatePending(orders, save) {
  if (!state.enabled || state.running) return;
  state.running = true;
  state.error = null;
  try {
    // сначала то, что видно в ленте по умолчанию; источники «· не IT» — в самом конце
    const rank = (o) => (/не IT/.test(o.source) ? 1 : 0);
    const byDate = () => [...orders.values()].filter(needsTranslation)
      .sort((a, b) => rank(a) - rank(b) || (b.date || '').localeCompare(a.date || ''));
    // заголовки, переведённые старой версией алгоритма, переводим заново
    for (const o of orders.values()) {
      if (o.tr && o.tr.v !== TR_VERSION) { delete o.tr.title; o.tr.v = TR_VERSION; }
    }
    const countPending = () => byDate().filter((o) => !o.tr?.title || (o.description && o.tr.description == null)).length;
    state.pending = countPending();
    let sinceSave = 0;
    // IT: заголовки → описания, потом «не IT»: заголовки → описания
    for (const [stage, part] of [['title', 0], ['description', 0], ['title', 1], ['description', 1]]) {
      for (const o of byDate()) {
        if (rank(o) !== part) continue;
        if (!orders.has(o.id)) continue;
        if (stage === 'title' && o.tr?.title) continue;
        if (stage === 'description' && (!o.description || o.tr?.description != null)) continue;
        const value = stage === 'title' ? await translate(sentenceCase(o.title)) : await translateLong(o.description);
        const cur = orders.get(o.id);
        if (cur) cur.tr = { v: TR_VERSION, ...(cur.tr || {}), [stage]: value };
        state.done++;
        if (++sinceSave >= 10) { save(); sinceSave = 0; state.pending = countPending(); }
      }
    }
    save();
    state.pending = countPending();
  } catch (e) {
    state.error = e.message;
    console.error('Перевод: ошибка —', e.message);
  } finally {
    state.running = false;
  }
}

module.exports = { translatePending, translatorState: state, needsTranslation };
