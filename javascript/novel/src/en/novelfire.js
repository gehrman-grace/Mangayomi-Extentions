/**
 * Novel Fire (novelfire.net) — LNReader-format plugin.
 *
 * The site is server rendered: listings, the chapter list and the chapter
 * pages are plain HTML, so everything is parsed with cheerio and no API
 * or signing is involved.
 */

const { load } = require('cheerio');
const { fetchApi } = require('@libs/fetch');
const { NovelStatus } = require('@libs/novelStatus');

const BASE = 'https://novelfire.net';
const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
};
/** Chapters per chapter-list page; the reader paginates in these steps. */
const PER_PAGE = 100;

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
  const res = await fetchApi(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Novel Fire: HTTP ${res.status} for ${url}`);
  }
  return await res.text();
};

const STATUS = {
  ongoing: NovelStatus.Ongoing,
  completed: NovelStatus.Completed,
  hiatus: NovelStatus.OnHiatus,
  cancelled: NovelStatus.Cancelled,
};

/** `ul.novel-list` cards, used by listings and search results alike */
const parseNovelList = html => {
  const $ = load(html);
  const novels = [];
  $('li.novel-item').each((i, el) => {
    const link = $(el).find('a[href*="/book/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const img = $(el).find('img').first();
    const name = (
      link.attr('title') ||
      img.attr('alt') ||
      text($, $(el).find('.novel-title').first()) ||
      ''
    ).trim();
    if (!name) return;
    novels.push({
      name,
      path: absolute(href),
      cover: absolute(img.attr('data-src') || img.attr('src')),
    });
  });
  return novels;
};

/** `/book/<slug>/chapters?page=n` — 100 chapters per page, oldest first */
const parseChapterList = html => {
  const $ = load(html);
  const chapters = [];
  $('.chapter-list li a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const name =
      ($(el).attr('title') || text($, $(el).find('.chapter-title')) || '').trim();
    const time = $(el).find('time').attr('datetime');
    chapters.push({
      name: name || `Chapter ${chapters.length + 1}`,
      path: absolute(href),
      releaseTime: time ? String(time).replace(' ', 'T') : undefined,
    });
  });
  return chapters;
};

const totalChapterPages = html => {
  const $ = load(html);
  let pages = 1;
  $('.pagination .page-link, .pagination a, .pagination span').each((i, el) => {
    const n = parseInt(text($, el), 10);
    if (!isNaN(n) && n > pages) pages = n;
  });
  if (pages > 1) return pages;
  // No pagination block: fall back to the chapter counter in the header
  const counter = $('.header-stats span')
    .filter((i, el) => /chapter/i.test($(el).text()))
    .first()
    .text();
  const count = parseInt(counter, 10);
  if (!isNaN(count) && count > 0) return Math.ceil(count / PER_PAGE);
  return 1;
};

class NovelFire {
  constructor() {
    this.id = 'novelfire';
    this.name = 'Novel Fire';
    this.version = '1.0.0';
    this.icon = 'https://www.google.com/s2/favicons?sz=256&domain=https://novelfire.net';
    this.site = BASE;
    this.headers = HEADERS;
    this.imageRequestInit = { headers: { referrer: BASE } };
    this.filters = {
      sort: {
        label: 'Sort',
        value: 'popular',
        options: [
          { label: 'Popular', value: 'popular' },
          { label: 'Newest', value: 'new' },
          { label: 'Rating', value: 'rating' },
          { label: 'Most chapters', value: 'chapters' },
        ],
        type: 'Picker',
      },
    };
  }

  async popularNovels(pageNo, options) {
    const opts = options || {};
    const showLatest = !!opts.showLatestNovels;
    const sort = showLatest
      ? 'new'
      : (opts.filters && opts.filters.sort && opts.filters.sort.value) || 'popular';
    const url = `${BASE}/genre-all/sort-${sort}/status-all/all-novel?page=${pageNo}`;
    return parseNovelList(await fetchHtml(url));
  }

  async searchNovels(searchTerm, pageNo) {
    const url = `${BASE}/search?keyword=${encodeURIComponent(searchTerm)}&page=${pageNo}`;
    return parseNovelList(await fetchHtml(url));
  }

  /** One chapter-list page; the app asks for page 2..totalPages itself */
  async parsePage(novelPath, page) {
    const url = `${absolute(novelPath)}/chapters?page=${page}`;
    return {
      path: novelPath,
      chapters: parseChapterList(await fetchHtml(url)),
    };
  }

  async parseNovel(novelPath) {
    const html = await fetchHtml(absolute(novelPath));
    const $ = load(html);

    const name = text($, $('h1.novel-title').first()) || text($, $('.novel-title').first());
    const author =
      ($('[itemprop="author"]').first().text() ||
        $('.author a').first().text() ||
        '')
        .replace(/\s+/g, ' ')
        .trim() || 'Unknown';
    const summary = (
      $('[itemprop="description"]').attr('content') ||
      text($, $('.summary .content').first()) ||
      ''
    ).trim();

    // The first <strong> in the stats block is the chapter count, not the status
    let status = NovelStatus.Unknown;
    $('.header-stats strong').each((i, el) => {
      const value = STATUS[text($, el).toLowerCase().split(/\s+/)[0]];
      if (value) status = value;
    });

    const genres = $('.categories ul li a')
      .map((i, el) => text($, el))
      .get()
      .filter(Boolean)
      .join(',');

    const listingHtml = await fetchHtml(`${absolute(novelPath)}/chapters?page=1`);
    const chapters = parseChapterList(listingHtml);

    return {
      path: novelPath,
      name: name || 'No title found',
      cover:
        $('meta[property="og:image"]').attr('content') ||
        absolute($('.novel-cover img').first().attr('src')),
      summary: summary || 'No summary found',
      author,
      status,
      genres,
      chapters,
      totalPages: totalChapterPages(listingHtml),
    };
  }

  async parseChapter(chapterPath) {
    const url = absolute(chapterPath);

    // The site sometimes answers with a small "Loading..." placeholder page
    // instead of the chapter; a fresh request gets the real one.
    let title = '';
    let body = '';
    for (let attempt = 0; attempt < 3 && !body; attempt++) {
      const $ = load(await fetchHtml(url));
      $('script, style, .ads, .ad-container, .chapter-nav, .comment').remove();
      title = text($, $('.chapter-title').first());
      const content = $('#content').first();
      body = content.length ? content.html() || '' : '';
    }

    if (!body) {
      throw new Error(
        `Novel Fire: no chapter text at ${chapterPath} — the site kept answering with its placeholder page, try again in a moment.`,
      );
    }

    const heading = title ? `<h2>${title}</h2>` : '';
    return `${heading}<div class="novelfire-content">${body}</div>`;
  }
}

exports.default = new NovelFire();
