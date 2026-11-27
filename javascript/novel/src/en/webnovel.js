/**
 * Webnovel (webnovel.com) — LNReader-format plugin.
 *
 * Everything comes from the mobile Next.js site (m.webnovel.com): each page
 * ships its data in `<script id="__NEXT_DATA__">`, so no private API and no
 * signing is involved.
 *
 * Webnovel sits behind Cloudflare bot management. When it answers with a
 * challenge ("Just a moment...") instead of the page, the plugin retries once
 * and then reports it, so the app shows a reason instead of an empty list.
 */

const { load } = require('cheerio');
const { fetchApi } = require('@libs/fetch');
const { NovelStatus } = require('@libs/novelStatus');

const SITE = 'https://www.webnovel.com';
const MOBILE = 'https://m.webnovel.com';
/** Category the source opens on: Asian fantasy, male lead */
const CATEGORY = '/stories/novel-fantasy-male';
const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
// Cloudflare scores plain clients lower, so the request also carries the
// headers a navigating browser sends.
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};
const STATUS = {
  30: NovelStatus.Ongoing,
  50: NovelStatus.Completed,
  60: NovelStatus.OnHiatus,
  70: NovelStatus.Cancelled,
};

const strip = html =>
  String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const bookIdOf = path => {
  const m = String(path || '').match(/(\d{6,})/);
  return m ? m[1] : undefined;
};

const coverOf = (bookId, coverUpdateTime) =>
  coverUpdateTime
    ? `https://book-pic.webnovel.com/bookcover/${bookId}?imageMogr2/thumbnail/600x&imageId=${coverUpdateTime}`
    : `https://book-pic.webnovel.com/bookcover/${bookId}`;

/** `props` of a page's `__NEXT_DATA__`, or undefined when there is none */
const nextProps = html => {
  const tag = html.indexOf('id="__NEXT_DATA__"');
  if (tag < 0) return undefined;
  const start = html.indexOf('>', tag) + 1;
  const end = html.indexOf('</script>', start);
  if (start < 1 || end < 0) return undefined;
  try {
    return JSON.parse(html.slice(start, end)).props;
  } catch (e) {
    return undefined;
  }
};

const fetchHtml = async url => {
  let status = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchApi(url, { headers: HEADERS });
    if (res.ok) return await res.text();
    status = res.status;
    // 404 is final; a 403/503 is usually Cloudflare and worth one retry
    if (status === 404) break;
  }
  throw new Error(
    `Webnovel: HTTP ${status} for ${url} — the site is blocking the request (Cloudflare). Open webnovel.com in the app's WebView once, then retry.`,
  );
};

const bookToNovel = book => {
  const bookId = book.bookId;
  if (!bookId || !book.bookName) return undefined;
  return {
    name: book.bookName,
    path: `/book/${bookId}`,
    cover: coverOf(bookId, book.coverUpdateTime),
  };
};

/** Books of a listing/search page, in the order the site returned them */
const booksOf = (props, searchId) => {
  if (!props) return [];
  const entities = (props.initialState && props.initialState.entities) || {};
  const books = entities.books || {};
  const listed = [];

  const searchResults = entities.searchResultList || {};
  const key = searchId && searchId in searchResults ? searchId : Object.keys(searchResults)[0];
  const items =
    key && searchResults[key] && searchResults[key].bookInfo
      ? searchResults[key].bookInfo.bookItems
      : undefined;

  if (items && items.length) {
    items.forEach(id => {
      const book = books[id];
      if (book) listed.push(book);
    });
    return listed;
  }

  Object.keys(books).forEach(id => listed.push(books[id]));
  return listed;
};

/** Chunks have to stay small: QuickJS is the runtime */
const catalogChapters = (html, bookId) => {
  const chapters = [];
  const pattern = new RegExp(
    `<a[^>]*href="(?:https?://[^"]*)?/book/${bookId}/(\\d+)"[^>]*>([\\s\\S]*?)</a>`,
    'g',
  );
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const inner = match[2];
    const strong = inner.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    let name = strong ? strip(strong[1]) : strip(inner).replace(/^\d+\s*/, '');
    if (!name) continue;
    const locked = /<svg/i.test(inner);
    chapters.push({
      name: locked ? `${name} 🔒` : name,
      path: `/book/${bookId}/${match[1]}`,
    });
  }
  return chapters;
};

class Webnovel {
  constructor() {
    this.id = 'webnovel';
    this.name = 'Webnovel';
    this.version = '1.0.0';
    this.icon = 'https://www.google.com/s2/favicons?sz=256&domain=https://webnovel.com';
    this.site = SITE;
    this.headers = HEADERS;
    this.imageRequestInit = { headers: { referrer: SITE } };
    this.filters = {
      genre: {
        label: 'Category',
        value: CATEGORY,
        options: [
          { label: 'Fantasy (male)', value: '/stories/novel-fantasy-male' },
          { label: 'Action (male)', value: '/stories/novel-action-male' },
          { label: 'Eastern (male)', value: '/stories/novel-eastern-male' },
          { label: 'Sci-fi (male)', value: '/stories/novel-scifi-male' },
          { label: 'Urban (male)', value: '/stories/novel-urban-male' },
          { label: 'History (male)', value: '/stories/novel-history-male' },
          { label: 'Fantasy (female)', value: '/stories/novel-fantasy-female' },
          { label: 'Romance (female)', value: '/stories/novel-romance-female' },
        ],
        type: 'Picker',
      },
    };
  }

  async popularNovels(pageNo, options) {
    const opts = options || {};
    const url = opts.showLatestNovels
      ? `${SITE}/stories/novel?orderBy=5&pageIndex=${pageNo}`
      : `${SITE}${
          (opts.filters && opts.filters.genre && opts.filters.genre.value) || CATEGORY
        }?pageIndex=${pageNo}`;

    const html = await fetchHtml(url);
    return booksOf(nextProps(html))
      .map(bookToNovel)
      .filter(Boolean);
  }

  async searchNovels(searchTerm, pageNo) {
    const url = `${SITE}/search?keywords=${encodeURIComponent(
      searchTerm,
    )}&pageIndex=${pageNo}`;
    const html = await fetchHtml(url);
    const props = nextProps(html);
    const keywords = searchTerm.replace(/\s+/g, ' ').trim();
    return booksOf(props, `${keywords}-1-novel-1`)
      .map(bookToNovel)
      .filter(Boolean);
  }

  async parseNovel(novelPath) {
    const bookId = bookIdOf(novelPath);
    if (!bookId) throw new Error(`Webnovel: no book id in ${novelPath}`);

    const html = await fetchHtml(`${MOBILE}/book/${bookId}`);
    const props = nextProps(html);
    const initData =
      props && props.initialProps && props.initialProps.pageProps
        ? props.initialProps.pageProps.initData
        : undefined;
    const book = (initData && initData.bookInfo) || {};
    if (!book.bookName) {
      throw new Error(`Webnovel: no data for book ${bookId} (Cloudflare block?)`);
    }

    const genres = [];
    [book.categoryName].concat((book.tagInfos || []).map(t => t.tagName)).forEach(tag => {
      const name = tag ? String(tag).trim() : '';
      if (name && genres.indexOf(name) < 0) genres.push(name);
    });

    const catalogHtml = await fetchHtml(`${MOBILE}/book/${bookId}/catalog`);
    const chapters = catalogChapters(catalogHtml, bookId);
    if (!chapters.length) {
      throw new Error(`Webnovel: empty chapter list for book ${bookId}`);
    }

    return {
      path: novelPath,
      name: book.bookName,
      cover: coverOf(bookId, book.coverUpdateTime),
      summary: String(book.description || 'No summary found')
        .replace(/\r\n?/g, '\n')
        .trim(),
      author: book.authorName || 'Unknown',
      status: STATUS[book.actionStatus] || NovelStatus.Unknown,
      genres: genres.join(','),
      chapters,
      totalPages: 1,
    };
  }

  /** The catalog arrives in one page, so pagination is never asked for */
  async parsePage(novelPath, page) {
    return { path: novelPath, chapters: [] };
  }

  async parseChapter(chapterPath) {
    const bookId = bookIdOf(chapterPath);
    const html = await fetchHtml(`${MOBILE}${chapterPath}`);
    const props = nextProps(html);

    const pageProps =
      props && props.initialProps ? props.initialProps.pageProps : undefined;
    const data = pageProps && pageProps.data;
    const info =
      data && data.initChapterServer ? data.initChapterServer.chapterInfo : undefined;

    if (info && info.contents && info.contents.length) {
      const body = info.contents
        .map(part => (part && part.content) || '')
        .join('\n');
      const heading = info.chapterName ? `<h2>${info.chapterName}</h2>` : '';
      return `${heading}<div class="webnovel-content">${body}</div>`;
    }

    if (info && (info.vipStatus || info.price)) {
      const title = info.chapterName || 'Chapter';
      return (
        `<h2>${title}</h2><p>This chapter is locked on Webnovel — it needs ` +
        `coins or a Fast Pass, so no text is available to the source.</p>`
      );
    }

    // Locked chapters on the desktop site carry no text either, but the
    // page still answers: say so instead of failing with an empty reader.
    throw new Error(
      `Webnovel: no chapter text for ${chapterPath} (book ${bookId}) — the chapter is probably locked or the site blocked the request.`,
    );
  }
}

exports.default = new Webnovel();
