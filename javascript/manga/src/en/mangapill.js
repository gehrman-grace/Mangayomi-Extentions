const mangayomiSources = [
  {
    name: "Manga Pill",
    id: 960321322,
    lang: "en",
    baseUrl: "https://mangapill.com",
    apiUrl: "",
    iconUrl: "https://www.google.com/s2/favicons?sz=256&domain=https://mangapill.com",
    typeSource: "single",
    itemType: 0,
    version: "2.0.0",
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
    pkgPath: "manga/src/en/mangapill.js",
  },
];

class DefaultExtension extends MProvider {
  get siteBase() {
    return String(this.source.baseUrl).replace(/\/+$/, "");
  }

  get headers() {
    return { Referer: this.siteBase + "/" };
  }

  async getDoc(path) {
    const url = path.indexOf("http") === 0 ? path : this.siteBase + path;
    const res = await new Client().get(url, this.headers);
    if (res.statusCode !== 200) throw new Error(`Manga Pill ${res.statusCode} for ${url}`);
    return new Document(res.body);
  }

  // Cards: an anchor to /manga/<id>/<slug> with a lazy-loaded cover, followed by
  // a title anchor and small type/year/status badges.
  parseList(doc) {
    const list = [];
    const seen = {};
    for (const grid of doc.select("div.grid")) {
      for (const cell of grid.children || []) {
        const anchors = cell.select("a[href^='/manga/']");
        if (!anchors.length) continue;
        const href = anchors[0].attr("href");
        if (!href || seen[href]) continue;
        seen[href] = true;

        let name = "";
        const titleAnchor = anchors.length > 1 ? anchors[1] : anchors[0];
        const titleDiv = titleAnchor.selectFirst("div");
        if (titleDiv && titleDiv.text) name = titleDiv.text;
        if (!name) {
          const img = cell.selectFirst("img");
          name = img ? String(img.attr("alt") || "").trim() : "";
        }
        if (!name) name = titleAnchor.text;
        name = String(name || "").trim();
        if (!name) continue;

        const img = cell.selectFirst("img");
        let imageUrl = "";
        if (img) {
          imageUrl = img.attr("data-src") || img.attr("src") || "";
        }
        list.push({ name: name, imageUrl: imageUrl, link: this.siteBase + href });
      }
    }
    return list;
  }

  // Only /search honours ?page=; /mangas/new and /chapters always answer with
  // the same first page, so those two report that there is nothing further.
  async listing(path, paginated) {
    const doc = await this.getDoc(path);
    const list = this.parseList(doc);
    return { list: list, hasNextPage: paginated === true && list.length >= 20 };
  }

  async getPopular(page) {
    return this.listing(`/mangas/new?page=${page}`, false);
  }

  async getLatestUpdates(page) {
    return this.listing(`/chapters?page=${page}`, false);
  }

  async search(query, page, filters) {
    const safe = filters || [];
    const pick = (index) => {
      const filter = safe[index];
      if (!filter || !filter.values) return "";
      const option = filter.values[filter.state];
      return option && option.value ? option.value : "";
    };
    const parts = ["q=" + encodeURIComponent(query || "")];
    const type = pick(0);
    const status = pick(1);
    if (type) parts.push("type=" + encodeURIComponent(type));
    if (status) parts.push("status=" + encodeURIComponent(status));
    const genreFilter = safe[2];
    if (genreFilter && Array.isArray(genreFilter.state)) {
      for (const box of genreFilter.state) {
        if (box.state) parts.push("genre=" + encodeURIComponent(box.value));
      }
    }
    parts.push("page=" + page);
    return this.listing("/search?" + parts.join("&"), true);
  }

  statusCode(status) {
    switch (String(status || "").toLowerCase()) {
      case "publishing":
        return 0;
      case "finished":
        return 1;
      case "on hiatus":
        return 2;
      case "discontinued":
        return 3;
      case "not yet published":
        return 4;
      default:
        return 5;
    }
  }

  async getDetail(url) {
    const path = String(url).replace(this.siteBase, "");
    const doc = await this.getDoc(path);

    let name = "";
    const h1 = doc.selectFirst("h1");
    if (h1) name = h1.text;
    if (!name) {
      const alt = doc.selectFirst("img[alt]");
      name = alt ? alt.attr("alt") : "";
    }

    let imageUrl = "";
    const cover = doc.selectFirst("img[data-src]");
    if (cover) imageUrl = cover.attr("data-src");

    let description = "";
    const desc = doc.selectFirst("meta[name='description']");
    if (desc) description = desc.attr("content");

    let status = 5;
    const labels = doc.select("label");
    for (const label of labels) {
      if (String(label.text || "").trim().toLowerCase() !== "status") continue;
      const parent = label.parent;
      const value = parent ? parent.selectFirst("div") : null;
      if (value) status = this.statusCode(value.text);
    }

    const genre = [];
    for (const anchor of doc.select("a[href*='genre=']")) {
      const text = String(anchor.text || "").trim();
      if (text && genre.indexOf(text) < 0) genre.push(text);
    }

    const chapters = [];
    const seen = {};
    for (const anchor of doc.select("div#chapters a[href^='/chapters/']")) {
      const href = anchor.attr("href");
      if (!href || seen[href]) continue;
      seen[href] = true;
      chapters.push({
        name: String(anchor.attr("title") || anchor.text || "").trim(),
        url: this.siteBase + href,
      });
    }

    return {
      name: name.trim(),
      link: this.siteBase + path,
      imageUrl: imageUrl,
      description: description,
      status: status,
      genre: genre,
      chapters: chapters,
    };
  }

  async getPageList(url) {
    const path = String(url).replace(this.siteBase, "");
    const doc = await this.getDoc(path);
    const headers = { Referer: this.siteBase + "/" };
    const pages = [];
    for (const img of doc.select("img.js-page")) {
      const src = img.attr("data-src") || img.attr("src");
      if (src) pages.push({ url: src, headers: headers });
    }
    if (!pages.length) throw new Error("Manga Pill returned no pages for this chapter.");
    return pages;
  }

  getFilterList() {
    const option = (name, value) => ({ type_name: "SelectOption", name: name, value: value });
    const box = (name, value) => ({ type_name: "CheckBox", name: name, value: value });
    return [
      {
        type_name: "SelectFilter",
        name: "Type",
        state: 0,
        values: [
          option("All", ""),
          option("Manga", "manga"),
          option("One-Shot", "one-shot"),
          option("Doujinshi", "doujinshi"),
          option("Manhwa", "manhwa"),
          option("Manhua", "manhua"),
          option("Oel", "oel"),
        ],
      },
      {
        type_name: "SelectFilter",
        name: "Status",
        state: 0,
        values: [
          option("All", ""),
          option("Publishing", "publishing"),
          option("Finished", "finished"),
          option("On Hiatus", "on hiatus"),
          option("Discontinued", "discontinued"),
          option("Not Yet Published", "not yet published"),
        ],
      },
      {
        type_name: "GroupFilter",
        name: "Genre",
        state: [
          "Action",
          "Adventure",
          "Cars",
          "Comedy",
          "Dementia",
          "Demons",
          "Drama",
          "Ecchi",
          "Fantasy",
          "Game",
          "Gender Bender",
          "Harem",
          "Historical",
          "Horror",
          "Isekai",
          "Josei",
          "Kids",
          "Magic",
          "Martial Arts",
          "Mecha",
          "Military",
          "Music",
          "Mystery",
          "Parody",
          "Police",
          "Psychological",
          "Romance",
          "Samurai",
          "School",
          "Sci-Fi",
          "Seinen",
          "Shoujo",
          "Shoujo Ai",
          "Shounen",
          "Shounen Ai",
          "Slice of Life",
          "Space",
          "Sports",
          "Super Power",
          "Supernatural",
          "Thriller",
          "Tragedy",
          "Vampire",
          "Yaoi",
          "Yuri",
        ].map((g) => box(g, g)),
      },
    ];
  }
}
