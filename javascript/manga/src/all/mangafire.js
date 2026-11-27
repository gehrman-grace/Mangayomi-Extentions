const mangayomiSources = [
  {
    name: "Manga Fire",
    id: 431927856,
    lang: "en",
    baseUrl: "https://mangafire.to",
    apiUrl: "https://mangafire.to",
    iconUrl:
      "https://raw.githubusercontent.com/gehrman-grace/Mangayomi-Extentions/main/javascript/icon/en.mangafire.png",
    typeSource: "single",
    itemType: 0,
    version: "1.0.1",
    dateFormat: "",
    dateFormatLocale: "",
    isManga: true,
    isNsfw: false,
    hasCloudflare: false,
    isFullData: false,
    appMinVerReq: "0.5.0",
    additionalParams: "",
    sourceCodeLanguage: 1,
    notes: "Uses MangaFire's JSON API. If the site shows a captcha, open the source in the app's WebView once.",
    pkgPath: "manga/src/all/mangafire.js",
  },
];

// MangaFire signs every /api request with a `vrf` query parameter. The signature
// is a three-stage byte substitution over the canonical request path; the tables
// and keys below are the ones the site itself ships. Ported from the keiyoushi
// VrfSigner interceptor.
const VRF_TABLE_1 =
  "yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==";
const VRF_KEY_1 = "0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA=";
const VRF_TABLE_2 =
  "IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==";
const VRF_KEY_2 = "AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ==";
const VRF_TABLE_3 =
  "NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ==";
const VRF_KEY_3 = "DELOJgPsVaCcblDtTGMdHzM=";

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this._vrfStages = null;
  }

  get siteBase() {
    return String(this.source.baseUrl).replace(/\/+$/, "");
  }

  get lang() {
    return (this.source.lang || "en").replace("es-419", "es-la").replace("pt-BR", "pt-br");
  }

  get headers() {
    return {
      Accept: "application/json",
      Referer: this.siteBase + "/browse",
    };
  }

  // ---- vrf signer -----------------------------------------------------------

  b64ToBytes(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = String(input).replace(/[^A-Za-z0-9+/=]/g, "");
    const out = [];
    for (let i = 0; i < clean.length; i += 4) {
      const c0 = chars.indexOf(clean.charAt(i));
      const c1 = chars.indexOf(clean.charAt(i + 1));
      const c2 = chars.indexOf(clean.charAt(i + 2));
      const c3 = chars.indexOf(clean.charAt(i + 3));
      if (c0 < 0 || c1 < 0) break;
      const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
      out.push((n >> 16) & 0xff);
      if (c2 >= 0) out.push((n >> 8) & 0xff);
      if (c3 >= 0) out.push(n & 0xff);
    }
    return out;
  }

  bytesToB64Url(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : null;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : null;
      out += chars.charAt(b0 >> 2);
      out += chars.charAt(((b0 & 3) << 4) | ((b1 === null ? 0 : b1) >> 4));
      if (b1 === null) break;
      out += chars.charAt(((b1 & 15) << 2) | ((b2 === null ? 0 : b2) >> 6));
      if (b2 === null) break;
      out += chars.charAt(b2 & 63);
    }
    return out;
  }

  utf8Bytes(text) {
    const out = [];
    const str = String(text);
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const low = str.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) out.push(code);
      else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      else
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 63),
          0x80 | ((code >> 6) & 63),
          0x80 | (code & 63),
        );
    }
    return out;
  }

  get vrfStages() {
    if (this._vrfStages) return this._vrfStages;
    this._vrfStages = [
      { table: this.b64ToBytes(VRF_TABLE_1), key: this.b64ToBytes(VRF_KEY_1), iv: 0x5a },
      { table: this.b64ToBytes(VRF_TABLE_2), key: this.b64ToBytes(VRF_KEY_2), iv: 0x35 },
      { table: this.b64ToBytes(VRF_TABLE_3), key: this.b64ToBytes(VRF_KEY_3), iv: 0xba },
    ];
    return this._vrfStages;
  }

  vrfSign(path) {
    let data = this.utf8Bytes(path);
    const stages = this.vrfStages;
    for (let s = 0; s < stages.length; s++) {
      const stage = stages[s];
      const out = new Array(data.length);
      let prev = stage.iv;
      for (let i = 0; i < data.length; i++) {
        prev = stage.table[(data[i] ^ stage.key[i % stage.key.length] ^ prev) & 0xff];
        out[i] = prev;
      }
      data = out;
    }
    return this.bytesToB64Url(data);
  }

  // `params` is a list of [name, value] pairs, since names like languages[]
  // repeat. The signed form sorts by name and numbers the [] entries.
  vrfFor(path, params) {
    const sorted = params.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    let canonical = path.replace(/^\/api/, "");
    if (sorted.length) {
      let lastKey = "";
      let index = 0;
      const parts = [];
      for (let i = 0; i < sorted.length; i++) {
        let key = sorted[i][0];
        if (key.slice(-2) === "[]") {
          if (lastKey !== key) index = 0;
          lastKey = key;
          key = key.slice(0, -2) + "[" + index++ + "]";
        }
        parts.push(key + "=" + sorted[i][1]);
      }
      canonical += "?" + parts.join("&");
    }
    return this.vrfSign(canonical);
  }

  // ---- API -----------------------------------------------------------------

  async apiGet(path, params) {
    let url = this.siteBase + path;
    const query = [];
    for (const pair of params || []) {
      query.push(encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]));
    }
    query.push("vrf=" + this.vrfFor(path, params || []));
    url += (url.indexOf("?") >= 0 ? "&" : "?") + query.join("&");

    const res = await new Client().get(url, this.headers);
    if (res.statusCode === 403) {
      const body = String(res.body || "");
      if (body.indexOf("captcha_required") >= 0) {
        throw new Error("MangaFire is asking for a captcha. Open this source in the app's WebView, solve it, then retry.");
      }
      throw new Error(`MangaFire refused the request (403): ${body.slice(0, 120)}`);
    }
    if (res.statusCode !== 200) {
      throw new Error(`MangaFire API ${res.statusCode} for ${path}: ${String(res.body || "").slice(0, 160)}`);
    }
    return JSON.parse(res.body);
  }

  statusCode(status) {
    switch (String(status || "").toLowerCase()) {
      case "releasing":
        return 0;
      case "finished":
      case "completed":
        return 1;
      case "on_hiatus":
        return 2;
      case "discontinued":
        return 3;
      case "not_yet_released":
        return 4;
      default:
        return 5;
    }
  }

  async listPage(params) {
    const json = await this.apiGet("/api/titles", params);
    const items = json.items || [];
    const meta = json.meta || {};
    return {
      list: items.map((item) => ({
        name: item.title || "",
        imageUrl: (item.poster && (item.poster.medium || item.poster.large || item.poster.small)) || "",
        link: this.siteBase + (item.url || `/title/${item.hid}-${item.slug}`),
      })),
      hasNextPage: meta.hasNext === true,
    };
  }

  langParam(extra) {
    return [["languages[]", this.lang]].concat(extra || []);
  }

  async getPopular(page) {
    return this.listPage(
      this.langParam([
        ["order[views_7d]", "desc"],
        ["page", String(page)],
        ["limit", "30"],
      ]),
    );
  }

  async getLatestUpdates(page) {
    return this.listPage(
      this.langParam([
        ["order[chapter_updated_at]", "desc"],
        ["page", String(page)],
        ["limit", "30"],
      ]),
    );
  }

  async search(query, page, filters) {
    const params = [];
    if (query) params.push(["keyword", query]);

    const safe = filters || [];
    const typeFilter = safe[0];
    if (typeFilter && Array.isArray(typeFilter.state)) {
      for (const box of typeFilter.state) if (box.state) params.push(["type[]", box.value]);
    }
    const genreFilter = safe[1];
    if (genreFilter && Array.isArray(genreFilter.state)) {
      for (const box of genreFilter.state) {
        if (box.state === 1) params.push(["genre[]", box.value]);
        else if (box.state === 2) params.push(["genre[]", "-" + box.value]);
      }
    }
    const statusFilter = safe[2];
    if (statusFilter && Array.isArray(statusFilter.state)) {
      for (const box of statusFilter.state) if (box.state) params.push(["status[]", box.value]);
    }
    if (safe[3] && safe[3].values) {
      const len = safe[3].values[safe[3].state];
      // The API rejects min_chap=0 ("must be at least 1"), so "Any" is omitted.
      if (len && len.value && parseInt(len.value, 10) >= 1) params.push(["min_chap", len.value]);
    }
    if (safe[4] && safe[4].values) {
      const sort = safe[4].values[safe[4].state];
      if (sort && sort.value) params.push(["order[" + sort.value + "]", sort.value === "title" ? "asc" : "desc"]);
    }

    return this.listPage(this.langParam(params.concat([["page", String(page)], ["limit", "30"]])));
  }

  // /title/{hid}-{slug}; older entries use /manga/{slug}.{hid}
  hidFromUrl(url) {
    let path = String(url || "")
      .replace(this.siteBase, "")
      .split("?")[0]
      .replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop() || "";
    if (last.indexOf(".") >= 0) return last.split(".").pop();
    return last.split("-")[0];
  }

  async getDetail(url) {
    const hid = this.hidFromUrl(url);
    if (!hid) throw new Error("Could not read a MangaFire id from " + url);

    const json = await this.apiGet("/api/titles/" + encodeURIComponent(hid));
    const data = json.data || json;

    const synopsisDoc = new Document(String(data.synopsisHtml || "").replace(/<br\s*\/?>/gi, "\n"));
    let description = synopsisDoc.text;
    const links = synopsisDoc.select("a");
    if (links.length) {
      const extra = [];
      for (const link of links) {
        const label = link.text;
        const href = link.getHref;
        if (label && href && description.indexOf(label) < 0) extra.push(`${label} - ${href}`);
      }
      if (extra.length) description += "\n\n" + extra.join("\n");
    }

    const chapters = [];
    let page = 1;
    let hasNext = true;
    while (hasNext && page <= 50) {
      const chunk = await this.apiGet(`/api/titles/${encodeURIComponent(hid)}/chapters`, [
        ["language", this.lang],
        ["sort", "number"],
        ["order", "desc"],
        ["limit", "200"],
        ["page", String(page)],
      ]);
      const rows = chunk.items || [];
      for (const row of rows) {
        const id = String(row.id);
        const number = row.number != null ? `Ch. ${row.number}` : "Chapter";
        const name = row.name ? `${number}: ${String(row.name).trim()}` : number;
        const chapter = {
          name: name,
          url: id,
          dateUpload: row.createdAt ? String(row.createdAt * 1000) : null,
        };
        if (row.type === "official") chapter.scanlator = "Official";
        chapters.push(chapter);
      }
      hasNext = !!(chunk.meta && chunk.meta.hasNext) && rows.length > 0;
      page++;
    }

    return {
      name: data.title || "",
      link: this.siteBase + (data.url || "/title/" + hid),
      imageUrl: (data.poster && (data.poster.large || data.poster.medium || data.poster.small)) || "",
      description: description,
      author: (data.authors || []).map((a) => a.title).filter(Boolean).join(", "),
      artist: (data.artists || []).map((a) => a.title).filter(Boolean).join(", "),
      status: this.statusCode(data.status),
      genre: (data.genres || []).map((g) => g.title).filter(Boolean),
      chapters: chapters,
    };
  }

  async getPageList(chapterId) {
    const id = String(chapterId).replace(/^.*\//, "").split("-")[0];
    const json = await this.apiGet("/api/chapters/" + encodeURIComponent(id));
    const pages = (json.data && json.data.pages) || [];
    if (!pages.length) throw new Error("MangaFire returned no pages for this chapter.");
    const headers = { Referer: this.siteBase + "/" };
    return pages.map((p) => ({ url: typeof p === "string" ? p : p.url, headers: headers }));
  }

  getFilterList() {
    const map = (type, entries) =>
      entries.map((e) => ({ type_name: type, name: e[0], value: e[1] }));
    return [
      {
        type_name: "GroupFilter",
        name: "Type",
        state: map("CheckBox", [
          ["Manga", "manga"],
          ["One-Shot", "one_shot"],
          ["Doujinshi", "doujinshi"],
          ["Manhwa", "manhwa"],
          ["Manhua", "manhua"],
        ]),
      },
      {
        type_name: "GroupFilter",
        name: "Genre",
        state: map("TriState", [
          ["Action", "1"],
          ["Adventure", "78"],
          ["Comedy", "5"],
          ["Drama", "6"],
          ["Fantasy", "79"],
          ["Horror", "530"],
          ["Isekai", "13"],
          ["Josei", "15"],
          ["Magic", "539"],
          ["Martial Arts", "534"],
          ["Mecha", "19"],
          ["Mystery", "22"],
          ["Psychological", "536"],
          ["Romance", "26"],
          ["School", "73"],
          ["Sci-Fi", "28"],
          ["Seinen", "537"],
          ["Shoujo", "30"],
          ["Shounen", "31"],
          ["Slice of Life", "538"],
          ["Sports", "34"],
          ["Supernatural", "76"],
          ["Thriller", "38"],
        ]),
      },
      {
        type_name: "GroupFilter",
        name: "Status",
        state: map("CheckBox", [
          ["Releasing", "releasing"],
          ["Completed", "completed"],
          ["On Hiatus", "on_hiatus"],
          ["Discontinued", "discontinued"],
          ["Not Yet Released", "not_yet_released"],
        ]),
      },
      {
        type_name: "SelectFilter",
        name: "Minimum Chapters",
        state: 0,
        values: map("SelectOption", [
          ["Any", ""],
          ["1+", "1"],
          ["5+", "5"],
          ["10+", "10"],
          ["20+", "20"],
          ["50+", "50"],
          ["100+", "100"],
        ]),
      },
      {
        type_name: "SelectFilter",
        name: "Sort",
        state: 2,
        values: map("SelectOption", [
          ["Added", "created_at"],
          ["Updated", "chapter_updated_at"],
          ["Trending", "views_7d"],
          ["Most Relevance", "relevance"],
          ["Name", "title"],
        ]),
      },
    ];
  }
}
