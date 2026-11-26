const mangayomiSources = [
  {
    name: "Vortex Scans",
    id: 758319402,
    lang: "en",
    baseUrl: "https://vortexscans.org",
    apiUrl: "",
    iconUrl: "https://www.google.com/s2/favicons?sz=256&domain=https://vortexscans.org",
    typeSource: "single",
    itemType: 0,
    version: "1.0.0",
    dateFormat: "",
    dateFormatLocale: "",
    isManga: true,
    isNsfw: false,
    hasCloudflare: false,
    isFullData: false,
    appMinVerReq: "0.5.0",
    additionalParams: "",
    sourceCodeLanguage: 1,
    notes: "",
    pkgPath: "manga/src/en/vortexscans.js",
  },
];

class DefaultExtension extends MProvider {
  get siteBase() {
    return String(this.source.baseUrl).replace(/\/+$/, "");
  }

  get headers() {
    return { Referer: this.siteBase + "/", Accept: "text/html,application/xhtml+xml" };
  }

  async getDoc(path) {
    const url = path.indexOf("http") === 0 ? path : this.siteBase + path;
    const res = await new Client().get(url, this.headers);
    if (res.statusCode !== 200) throw new Error(`Vortex Scans ${res.statusCode} for ${url}`);
    return new Document(res.body);
  }

  absolute(href) {
    if (!href) return "";
    if (href.indexOf("http") === 0) return href;
    return this.siteBase + (href.charAt(0) === "/" ? href : "/" + href);
  }

  parseList(doc) {
    const list = [];
    const seen = {};
    // Each card is a bordered row holding a poster link and a title link.
    const cards = doc.select("div.relative.h-full.flex.gap-2");
    for (const card of cards) {
      const anchors = card.select("a[href*='/series/']");
      if (!anchors.length) continue;
      const poster = anchors[0];
      const link = this.absolute(poster.attr("href"));
      if (!link || seen[link]) continue;
      seen[link] = true;

      let name = (anchors.length > 1 && anchors[1].text) || poster.attr("title") || "";
      name = name.trim();
      if (!name) continue;

      const img = card.selectFirst("img");
      const imageUrl = img ? img.attr("src") || img.attr("data-src") || "" : "";
      list.push({ name: name, imageUrl: imageUrl, link: link });
    }
    return list;
  }

  // The archive numbers its pages, so the presence of a link labelled with the
  // next page is exact (no guessing from result counts).
  hasNextPage(doc, page) {
    return !!doc.selectFirst(`a[aria-label='Page ${page + 1}']`);
  }

  async getPopular(page) {
    const doc = await this.getDoc(`/series?page=${page}&sortBy=popular`);
    const list = this.parseList(doc);
    return { list: list, hasNextPage: list.length > 0 && this.hasNextPage(doc, page) };
  }

  async getLatestUpdates(page) {
    const doc = await this.getDoc(`/series?page=${page}`);
    const list = this.parseList(doc);
    return { list: list, hasNextPage: list.length > 0 && this.hasNextPage(doc, page) };
  }

  async search(query, page, filters) {
    const parts = [];
    if (query) parts.push("searchTerm=" + encodeURIComponent(query));
    const typeFilter = (filters || [])[0];
    if (typeFilter && typeFilter.values) {
      const option = typeFilter.values[typeFilter.state];
      if (option && option.value) parts.push("seriesType=" + encodeURIComponent(option.value));
    }
    parts.push("page=" + page);
    const doc = await this.getDoc("/series?" + parts.join("&"));
    const list = this.parseList(doc);
    return { list: list, hasNextPage: list.length > 0 && this.hasNextPage(doc, page) };
  }

  statusCode(status) {
    switch (String(status || "").toUpperCase()) {
      case "ONGOING":
        return 0;
      case "COMPLETED":
        return 1;
      case "HIATUS":
        return 2;
      case "DROPPED":
      case "CANCELLED":
        return 3;
      default:
        return 5;
    }
  }

  parseDate(value) {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : String(ts);
  }

  // Values in the details <dl> (Status, Type, Author, Artist, …), keyed by label.
  detailRows(doc) {
    const rows = {};
    const cells = doc.select("dl > div");
    for (const cell of cells) {
      const label = cell.selectFirst("dt");
      const value = cell.selectFirst("dd");
      if (!label || !value) continue;
      rows[String(label.text || "").replace(/[:\s]+$/g, "").toLowerCase()] = String(value.text || "").trim();
    }
    return rows;
  }

  async getDetail(url) {
    const doc = await this.getDoc(url);

    const nameEl = doc.selectFirst("h1[itemprop='name']") || doc.selectFirst("h1");
    let name = nameEl ? nameEl.text : "";
    if (!name) {
      const og = doc.selectFirst("meta[property='og:title']");
      name = og ? og.attr("content") : "";
    }
    // The <h1> carries the format ("Reality Quest Manhwa"); the title does not.
    name = name.replace(/\s+(manhwa|manga|manhua|comic)$/i, "").trim();

    const cover = doc.selectFirst("img[itemprop='image']");
    const imageUrl = cover
      ? cover.attr("src") || cover.attr("data-fallback-src") || ""
      : "";

    const rows = this.detailRows(doc);
    const status = this.statusCode(rows["status"] || "");

    let description = "";
    const descEl = doc.selectFirst("meta[name='description']");
    if (descEl) description = String(descEl.attr("content") || "").trim();

    const genre = [];
    for (const link of doc.select("a[href*='genre']")) {
      const text = String(link.text || "").trim();
      if (text && genre.indexOf(text) < 0) genre.push(text);
    }

    const chapters = [];
    const seen = {};
    for (const anchor of doc.select("a[href*='/chapter-']")) {
      const href = anchor.attr("href");
      if (!href || seen[href]) continue;
      // The "Start Reading" button also points at a chapter; its label is not a
      // chapter name, so the list is built from the actual chapter rows only.
      if (/start\s+reading/i.test(anchor.text)) continue;
      seen[href] = true;
      const link = this.absolute(href);

      let chapterName = "";
      for (const span of anchor.select("span")) {
        const text = String(span.text || "").trim();
        if (/^chapter\b/i.test(text)) {
          chapterName = text.replace(/\s+/g, " ");
          break;
        }
      }
      if (!chapterName) {
        const slug = (href.split("/").pop() || "")
          .replace(/-/g, " ")
          .replace(/\bchapter\s*/i, "Chapter ");
        chapterName = slug.trim();
      }

      const time = anchor.selectFirst("time");
      chapters.push({
        name: chapterName,
        url: link,
        dateUpload: time ? this.parseDate(time.attr("datetime")) : null,
      });
    }

    return {
      name: name.trim(),
      link: this.absolute(url),
      imageUrl: imageUrl,
      description: description,
      author: rows["author"] || "",
      artist: rows["artist"] || "",
      status: status,
      genre: genre,
      chapters: chapters,
    };
  }

  async getPageList(url) {
    const doc = await this.getDoc(url);
    const headers = { Referer: this.absolute(url) };
    const pages = [];
    for (const img of doc.select("figure.image-container img")) {
      const src = img.attr("src") || img.attr("data-src") || "";
      if (src && pages.indexOf(src) < 0) pages.push(src);
    }
    if (!pages.length) {
      // Older/newer reader layouts still tag the real page images.
      for (const img of doc.select("img[data-reader-page-image]")) {
        const src = img.attr("src") || "";
        if (src && pages.indexOf(src) < 0) pages.push(src);
      }
    }
    if (!pages.length) throw new Error("Vortex Scans returned no pages for this chapter.");
    return pages.map((pageUrl) => ({ url: pageUrl, headers: headers }));
  }

  getFilterList() {
    const option = (name, value) => ({ type_name: "SelectOption", name: name, value: value });
    return [
      {
        type_name: "SelectFilter",
        name: "Type",
        state: 0,
        values: [
          option("Any", ""),
          option("Manga", "MANGA"),
          option("Manhwa", "MANHWA"),
          option("Manhua", "MANHUA"),
        ],
      },
    ];
  }
}
