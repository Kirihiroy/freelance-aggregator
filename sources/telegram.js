// Публичные Telegram-каналы через веб-версию https://t.me/s/<канал> (без аккаунта и API-ключей).
// Список каналов — в channels.json.
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { get, sleep, parsePrice, clean } = require('./common');

const CONFIG = path.join(__dirname, '..', 'channels.json');

// для смешанных каналов: пост должен содержать хоть одно из этих слов
const IT_WORDS = new RegExp(
  [
    // (?<![а-яё]) — начало слова: иначе «бот» найдётся в «работа»
    'сайт', 'лендинг', '(?<![а-яё])бот', 'парс', 'скрипт', 'программист', 'программирован', 'разработ', 'верст', 'вёрст', '(?<![а-яё])код',
    'python', 'php', 'javascript', '\\bjs\\b', 'typescript', 'react', 'vue', 'node', 'django', 'laravel',
    'frontend', 'backend', 'фронтенд', 'бэкенд', 'бекенд', 'fullstack', 'фулстек', 'devops', '\\bqa\\b', 'тестировщ',
    '1с', '1c', 'битрикс', 'bitrix', 'wordpress', 'tilda', 'тильд', 'webflow', 'figma', 'ui/ux', 'интерфейс',
    '\\bapi\\b', 'интеграц', 'amocrm', 'n8n', 'make\\.com', 'llm', 'chatgpt', 'нейросет\\S* (?:для|в|на)',
    'мобильн\\S* приложени', 'веб-приложени', 'android', '\\bios\\b', 'unity', 'базы? данных', 'sql', 'хостинг',
    'google apps script', '\\bvba\\b', '(?<![а-яё])ит(?![а-яё])', '\\bit\\b', 'админ\\S* (?:сервер|сайт|linux)',
  ].join('|'),
  'i'
);

// посты, где фрилансер предлагает себя, а не заказчик ищет исполнителя
const NOT_ORDER = /#резюме|(?<![а-яё])резюме(?![а-яё])|ищу (?:проекты|заказы|работу|клиентов)|делаю сайты|возьму (?:в работу|заказ)|мои услуги|портфолио:|меня зовут|ищете [^.!?]{0,40}(?:разработчик|программист|специалист)|мы создаем|мы создаём|предлагаю услуги/i;

// мусорные строки из подписей каналов
const NOISE = /узнать больше|больше проектов|поддержи наш канал|подписаться|контакт заказчика|^#\S+(\s+#\S+)*$/i;

// если пост ссылается на заказ с другой площадки — используем её id, чтобы не было дублей
function nativeId(url) {
  let m;
  if ((m = url.match(/kwork\.ru\/projects\/(\d+)/))) return 'kwork:' + m[1];
  if ((m = url.match(/fl\.ru\/projects\/(\d+)/))) return 'fl:' + m[1];
  if ((m = url.match(/freelance\.ru\/(?:task\/view|projects?)\/(\d+)/))) return 'frru:' + m[1];
  return null;
}

function priceFrom(text) {
  const m = text.match(/(\d[\d\s ]{2,})\s*(₽|руб|р\.|rub)/i) || text.match(/(?:бюджет|оплата|цена|стоимость)[^\d]{0,15}(\d[\d\s ]{2,})/i);
  return m ? parsePrice(m[1]) : null;
}

function loadChannels() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8')).channels.filter((c) => c && c.username);
  } catch (e) {
    throw new Error('не удалось прочитать channels.json: ' + e.message);
  }
}

async function fetchTelegram() {
  const out = [];
  const errors = [];
  for (const ch of loadChannels()) {
    try {
      const html = await get(`https://t.me/s/${encodeURIComponent(ch.username)}`);
      const $ = cheerio.load(html);
      if (!$('.tgme_channel_info').length) throw new Error('канал закрыт или не существует');
      $('.tgme_widget_message').each((_, el) => {
        const msg = $(el);
        const post = msg.attr('data-post');
        const body = msg.find('.tgme_widget_message_text').first();
        if (!post || !body.length) return;

        const links = body.find('a[href^="http"]').map((_, a) => $(a).attr('href')).get();
        body.find('br').replaceWith('\n');
        const lines = body.text().split('\n').map(clean).filter((l) => l && !NOISE.test(l));
        if (!lines.length) return;
        const text = lines.join('\n');
        if (NOT_ORDER.test(text)) return;
        // в смешанных каналах IT-слово должно быть в заголовке (первая строка), а не где-то в описании
        if (ch.itFilter && !IT_WORDS.test(lines[0])) return;

        const external = links.find((u) => !/(^https?:\/\/)?(t\.me|telegram\.me)\//.test(u) && nativeId(u)) ||
          links.find((u) => /kwork\.ru|fl\.ru|freelance\.ru|youdo|workzilla|habr/.test(u));
        const title = lines[0].replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 160) || lines[0];
        out.push({
          id: (external && nativeId(external)) || 'tg:' + post,
          source: 'Telegram',
          title,
          description: lines.slice(1).join(' ').slice(0, 600),
          url: external || `https://t.me/${post}`,
          tgUrl: `https://t.me/${post}`,
          price: priceFrom(text),
          category: '@' + ch.username,
          date: msg.find('time[datetime]').last().attr('datetime')
            ? new Date(msg.find('time[datetime]').last().attr('datetime')).toISOString()
            : null,
        });
      });
    } catch (e) {
      errors.push(`@${ch.username}: ${e.message}`);
    }
    await sleep(1000);
  }
  if (errors.length && !out.length) throw new Error(errors.join('; '));
  if (errors.length) console.warn('Telegram:', errors.join('; '));
  return out;
}

module.exports = fetchTelegram;
