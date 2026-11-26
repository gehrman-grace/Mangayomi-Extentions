const mangayomiSources = [
  {
    name: "Asura Scans",
    id: 524070078,
    lang: "en",
    baseUrl: "https://asurascans.com",
    apiUrl: "https://api.asurascans.com",
    iconUrl:
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/en.asurascans.png",
    typeSource: "single",
    itemType: 0,
    version: "0.3.0",
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
    pkgPath: "manga/src/en/asurascans.js",
  },
];

class DefaultExtension extends MProvider {
  get apiBase() {
    return String(this.source.apiUrl || "https://api.asurascans.com").replace(/\/+$/, "");
  }

  get siteBase() {
    return String(this.source.baseUrl).replace(/\/+$/, "");
  }

  get headers() {
    return { Referer: this.siteBase + "/", Accept: "application/json" };
  }

  async apiGet(path) {
    const res = await new Client().get(this.apiBase + path, this.headers);
    if (res.statusCode !== 200) {
      throw new Error(`Asura Scans API ${res.statusCode} for ${path}`);
    }
    return JSON.parse(res.body);
  }

  // The site's public URL carries a build hash (/comics/slug-7de80a82) while the
  // API expects the bare slug. Anything after the last dash that is 6-8 hex
  // characters is that hash.
  apiSlug(url) {
    let path = String(url || "")
      .replace(/^https?:\/\/[^/]+/i, "")
      .split("?")[0]
      .split("#")[0]
      .replace(/^\/+|\/+$/g, "");
    const parts = path.split("/").filter(Boolean);
    let slug = parts.length >= 2 && /^(comics|series|manga)$/i.test(parts[0]) ? parts[1] : parts[parts.length - 1];
    if (!slug) throw new Error("Could not read a series slug from " + url);
    slug = slug.replace(/-f?[0-9a-f]{6,8}$/i, "");
    return { slug: slug, parts: parts };
  }

  // Chapter entries keep the series slug and chapter slug only, so they survive
  // the site moving its reader URLs around.
  chapterRef(url) {
    const raw = String(url || "");
    if (raw.indexOf("::") >= 0) {
      const bits = raw.split("::");
      return { series: bits[0], chapter: bits[1] };
    }
    const info = this.apiSlug(raw);
    const parts = info.parts;
    const idx = parts.indexOf("chapter");
    const chapter = idx >= 0 && parts[idx + 1] ? parts[idx + 1] : parts[parts.length - 1];
    return { series: info.slug, chapter: chapter };
  }

  parseDate(value) {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : String(ts);
  }

  statusCode(status) {
    switch (String(status || "").toLowerCase()) {
      case "ongoing":
        return 0;
      case "completed":
        return 1;
      case "hiatus":
      case "seasonal":
        return 2;
      case "dropped":
        return 3;
      default:
        return 5;
    }
  }

  parseList(json) {
    const items = (json && json.data) || [];
    const meta = (json && json.meta) || {};
    return {
      list: items.map((item) => ({
        name: item.title || "",
        imageUrl: item.cover || item.cover_url || "",
        link: this.siteBase + (item.public_url || `/comics/${item.slug}`),
      })),
      hasNextPage: meta.has_more === true || items.length >= 20,
    };
  }

  async getPopular(page) {
    const offset = (page - 1) * 20;
    return this.parseList(
      await this.apiGet(`/api/series?sort=rating&order=desc&offset=${offset}&limit=20`),
    );
  }

  async getLatestUpdates(page) {
    const offset = (page - 1) * 20;
    return this.parseList(
      await this.apiGet(`/api/series?sort=latest&order=desc&offset=${offset}&limit=20`),
    );
  }

  selectedValue(filters, index, fallback) {
    const filter = (filters || [])[index];
    if (!filter || !filter.values) return fallback;
    const option = filter.values[filter.state];
    return option && option.value != null ? option.value : fallback;
  }

  async search(query, page, filters) {
    const offset = (page - 1) * 20;
    let url = `/api/series?offset=${offset}&limit=20`;
    url += `&sort=${this.selectedValue(filters, 0, "rating")}`;
    url += `&order=${this.selectedValue(filters, 1, "desc")}`;

    if (query) url += `&search=${encodeURIComponent(query)}`;
    const status = this.selectedValue(filters, 2, "");
    if (status) url += `&status=${status}`;
    const type = this.selectedValue(filters, 3, "");
    if (type) url += `&type=${type}`;

    const genreFilter = (filters || [])[4];
    if (genreFilter && Array.isArray(genreFilter.state)) {
      const picked = genreFilter.state
        .filter((box) => box.state)
        .map((box) => box.value)
        .join(",");
      if (picked) url += `&genres=${encodeURIComponent(picked)}`;
    }

    return this.parseList(await this.apiGet(url));
  }

  async getDetail(url) {
    const slug = this.apiSlug(url).slug;
    const json = await this.apiGet(`/api/series/${encodeURIComponent(slug)}`);
    const body = json.data || json;
    const series = body.series || body;

    const chapters = [];
    let offset = 0;
    const limit = 100;
    const seen = {};
    while (true) {
      const chunk = await this.apiGet(
        `/api/series/${encodeURIComponent(slug)}/chapters?offset=${offset}&limit=${limit}`,
      );
      const rows = chunk.data || [];
      if (!rows.length) break;
      let added = 0;
      for (const row of rows) {
        const key = String(row.id || row.slug || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        added++;
        const label = row.number != null ? `Chapter ${row.number}` : "Chapter";
        const title = String(row.title || "").trim();
        chapters.push({
          name: title ? `${label} - ${title}` : label,
          url: `${slug}::${row.slug}`,
          dateUpload: this.parseDate(row.published_at),
        });
      }
      if (rows.length < limit || added === 0) break;
      offset += limit;
      if (offset > 5000) break;
    }

    return {
      name: series.title || "",
      link: this.siteBase + (series.public_url || `/comics/${slug}`),
      imageUrl: series.cover || series.cover_url || "",
      description: String(series.description || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      author: series.author || "",
      artist: series.artist || "",
      status: this.statusCode(series.status),
      genre: (series.genres || []).map((g) => (typeof g === "string" ? g : g.name)).filter(Boolean),
      chapters: chapters,
    };
  }

  async getPageList(url) {
    const ref = this.chapterRef(url);
    const res = await new Client().get(
      `${this.apiBase}/api/series/${encodeURIComponent(ref.series)}/chapters/${encodeURIComponent(ref.chapter)}`,
      this.headers,
    );
    if (res.statusCode !== 200) throw new Error(`Asura Scans chapter ${res.statusCode}`);
    const json = JSON.parse(res.body);
    const data = json.data || json;
    const chapter = data.chapter || data;
    const pages = chapter.pages || data.pages || [];
    if (!pages.length && (chapter.is_premium || data.access_gate)) {
      throw new Error("This chapter is premium on Asura Scans.");
    }
    const headers = { Referer: this.siteBase + "/" };
    return pages
      .map((p) => (typeof p === "string" ? p : p.url))
      .filter(Boolean)
      .map((pageUrl) => ({ url: pageUrl, headers: headers }));
  }

  getFilterList() {
    const option = (name, value) => ({ type_name: "SelectOption", name: name, value: value });
    const box = (name, value) => ({ type_name: "CheckBox", name: name, value: value });
    return [
      {
        type_name: "SelectFilter",
        name: "Sort By",
        state: 0,
        values: [option("Rating", "rating"), option("Latest Update", "latest")],
      },
      {
        type_name: "SelectFilter",
        name: "Sort Order",
        state: 1,
        values: [option("Ascending", "asc"), option("Descending", "desc")],
      },
      {
        type_name: "SelectFilter",
        name: "Status",
        state: 0,
        values: [
          option("All", ""),
          option("Ongoing", "ongoing"),
          option("Completed", "completed"),
          option("Hiatus", "hiatus"),
          option("Seasonal", "seasonal"),
          option("Dropped", "dropped"),
        ],
      },
      {
        type_name: "SelectFilter",
        name: "Type",
        state: 0,
        values: [option("All", ""), option("Manhwa", "manhwa"), option("Manga", "manga"), option("Manhua", "manhua")],
      },
      {
        type_name: "GroupFilter",
        name: "Genres",
        state: [
          ["Action", "action"],
          ["Adventure", "adventure"],
          ["Comedy", "comedy"],
          ["Drama", "drama"],
          ["Fantasy", "fantasy"],
          ["Horror", "horror"],
          ["Isekai", "isekai"],
          ["Magic", "magic"],
          ["Martial Arts", "martial-arts"],
          ["Mystery", "mystery"],
          ["Psychological", "psychological"],
          ["Regression", "regression"],
          ["Reincarnation", "reincarnation"],
          ["Romance", "romance"],
          ["School Life", "school-life"],
          ["Sci-fi", "sci-fi"],
          ["Shounen", "shounen"],
          ["Supernatural", "supernatural"],
          ["Thriller", "thriller"],
          ["Tragedy", "tragedy"],
        ].map((g) => box(g[0], g[1])),
      },
    ];
  }
}
