/**
 * Royal Road (royalroad.com) — LNReader-format plugin.
 *
 * Everything is server-rendered HTML: listings, search, the fiction page and
 * the chapter page. The chapter list is not markup, though — the fiction page
 * embeds it as `window.chapters = [...]`, which is read and parsed as JSON.
 *
 * The site sits behind Cloudflare and answers a request without browser
 * headers with its "Just a moment" check page. Browser-like headers get
 * through; when a check still comes back the reader is told to open the site
 * in the WebView once (the app stores the cookies it gets).
 */

const { load } = require('cheerio');
const { fetchApi } = require('@libs/fetch');
const { NovelStatus } = require('@libs/novelStatus');

const BASE = 'https://www.royalroad.com';
const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
};

const BOT_CHECK =
  "Royal Road's bot check answered instead of the page. Open royalroad.com in the app's WebView once, wait for it to load, then try again.";

const absolute = url => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return BASE + (url.charAt(0) === '/' ? url : '/' + url);
};

const text = ($, el) =>
  ($(el).text() || '')
    .replace(/\s+/g, ' ')
    .trim();

const fetchHtml = async url => {
  // A check page can come back as 403 or as a 200 with the check body, so
  // both are detected; one immediate retry covers a transient challenge.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchApi(url, { headers: HEADERS });
    lastStatus = res.status;
    const body = await res.text();
    const headers = res.headers || {};
    const challenged =
      res.status === 403 ||
      String(headers['cf-mitigated'] || '').length > 0 ||
      /<title>\s*Just a moment/i.test(body) ||
      body.indexOf('anubis_challenge') !== -1;
    if (!challenged && res.ok) return body;
  }
  if (lastStatus === 404) {
    throw new Error(`Royal Road: page not found (HTTP 404) for ${url}`);
  }
  throw new Error(BOT_CHECK);
};

/** `window.chapters = [...]` / `window.volumes = [...]` are JSON, not markup */
const readJsonVar = (html, name) => {
  const match = html.match(
    new RegExp('window\\.' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\]);'),
  );
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return [];
  }
};

/** The cards shared by the popular/latest listings and search results */
const parseNovelList = html => {
  const $ = load(html);
  const novels = [];
  $('.fiction-list-item').each((i, el) => {
    const link = $(el).find('h2.fiction-title a').first();
    const href = link.attr('href');
    if (!href) return;
    const name = text($, link);
    if (!name) return;
    const img = $(el).find('img').first();
    novels.push({
      name,
      path: absolute(href),
      cover: absolute(img.attr('src') || img.attr('data-src')),
    });
  });
  return novels;
};

const parseChapters = html => {
  const chapters = readJsonVar(html, 'chapters');
  return chapters
    .filter(chapter => chapter && chapter.url && chapter.title)
    .filter(chapter => chapter.visible !== 0)
    .map(chapter => ({
      name: chapter.title,
      path: absolute(chapter.url),
      releaseTime: chapter.date,
    }));
};

const STATUS = {
  ONGOING: NovelStatus.Ongoing,
  COMPLETED: NovelStatus.Completed,
  HIATUS: NovelStatus.OnHiatus,
  STUB: NovelStatus.STUB,
  INACTIVE: NovelStatus.Inactive,
  CANCELLED: NovelStatus.Cancelled,
  DROPPED: NovelStatus.Cancelled,
};

/** Paragraphs of the fiction description, without the "show more" control */
const readSummary = ($, root) => {
  const el = $(root).find('.description').first();
  if (!el.length) return '';
  const paragraphs = [];
  el.find('p, li').each((i, node) => {
    const value = text($, node);
    if (value) paragraphs.push(value);
  });
  const summary = paragraphs.length
    ? paragraphs.join('\n\n')
    : text($, el.find('.hidden-content').length ? el.find('.hidden-content') : el);
  return summary
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

class RoyalRoad {
  constructor() {
    this.id = 'royalroad';
    this.name = 'Royal Road';
    this.version = '1.0.0';
    this.icon =
      'https://www.google.com/s2/favicons?sz=256&domain=https://www.royalroad.com';
    this.site = BASE;
    this.headers = HEADERS;
    this.imageRequestInit = {
      headers: { Referer: BASE, 'User-Agent': UA },
    };
  }

  async popularNovels(pageNo, options) {
    const opts = options || {};
    const slug = opts.showLatestNovels
      ? `/fictions/latest-updates?page=${pageNo}`
      : `/fictions/active-popular?page=${pageNo}`;
    return parseNovelList(await fetchHtml(BASE + slug));
  }

  async searchNovels(searchTerm, pageNo) {
    const url = `${BASE}/fictions/search?title=${encodeURIComponent(
      searchTerm,
    )}&page=${pageNo}`;
    return parseNovelList(await fetchHtml(url));
  }

  async parseNovel(novelPath) {
    const html = await fetchHtml(absolute(novelPath));
    const $ = load(html);

    let status = NovelStatus.Unknown;
    $('.label-sm').each((i, el) => {
      const value = STATUS[text($, el).toUpperCase()];
      if (value) status = value;
    });

    const genres = $('.tags a.fiction-tag')
      .map((i, el) => text($, el))
      .get()
      .filter(Boolean)
      .join(', ');

    return {
      path: novelPath,
      name: text($, $('h1').first()) || 'No title found',
      cover:
        absolute($('img.thumbnail').first().attr('src')) ||
        $('meta[property="og:image"]').attr('content'),
      summary: readSummary($, $.root()) || 'No summary found',
      author: text($, $('a[href^="/profile/"]').first()) || 'Unknown',
      status,
      genres,
      chapters: parseChapters(html),
    };
  }

  /**
   * The fiction page carries the whole chapter list, so the app never has to
   * paginate it; page "1" is answered for a saved novel whose list is missing.
   */
  async parsePage(novelPath, page) {
    if (`${page}` !== '1') {
      return { path: novelPath, chapters: [] };
    }
    const html = await fetchHtml(absolute(novelPath));
    return { path: novelPath, chapters: parseChapters(html) };
  }

  async parseChapter(chapterPath) {
    const html = await fetchHtml(absolute(chapterPath));
    const $ = load(html);

    // Royal Road scatters random `cn…` classes through the text and hides one
    // class with a per-page stylesheet rule; its paragraphs are not part of
    // the chapter and must not reach the reader.
    const hidden = [];
    $('style').each((i, el) => {
      const css = $(el).text() || '';
      const rule = /\.([A-Za-z0-9_-]+)\s*\{[^}]*display\s*:\s*none/gi;
      let match;
      while ((match = rule.exec(css))) hidden.push(match[1]);
    });

    const content = $('.chapter-content').first();
    if (!content.length) {
      throw new Error(
        'Royal Road: this chapter has no text. It may be locked for subscribers or removed.',
      );
    }
    hidden.forEach(cls => content.find('.' + cls).remove());
    content
      .find('script, style, ins, iframe, .author-note-portlet, .adsbygoogle')
      .remove();

    const title = text($, $('h1').first());
    const body = content.html() || '';
    if (!body.replace(/<[^>]*>/g, '').trim()) {
      throw new Error('Royal Road: the chapter page came back without text.');
    }
    return `${title ? `<h2>${title}</h2>` : ''}<div class="royalroad-content">${body}</div>`;
  }
}

exports.default = new RoyalRoad();
