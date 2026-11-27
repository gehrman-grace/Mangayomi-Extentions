# Mangayomi Grey extensions

Manga, anime and novel sources for [Mangayomi](https://github.com/kodjodevf/mangayomi), in plain JavaScript.

## Sources

| Name | Type | Site | Version |
|------|------|------|---------|
| Asura Scans | Manga | https://asurascans.com | 0.3.0 |
| Manga Fire | Manga | https://mangafire.to | 1.0.0 |
| Vortex Scans | Manga | https://vortexscans.org | 1.0.0 |
| Manga Pill | Manga | https://mangapill.com | 2.0.0 |
| Atsumaru | Manga | https://atsu.moe | 1.0.0 |
| HiAnime | Anime | https://hianime.fm | 0.7.4 |
| AniKoto | Anime | https://anikototv.bz | 0.4.31 |
| Anidap | Anime | https://anidap.lol | 1.10.6 |
| Webnovel | Novel | https://www.webnovel.com | 1.0.0 |
| Novel Fire | Novel | https://novelfire.net | 1.0.0 |

## Layout

```
repo.json                                   repository name/website
index.json                                  manga catalogue
anime_index.json                            anime catalogue
novel_index.json                            novel catalogue
javascript/manga/src/en/*.js                manga sources
javascript/manga/src/all/mangafire.js       Manga Fire (multi-language capable)
javascript/anime/src/en/*.js                anime sources
javascript/novel/src/en/*.js                novel sources (LNReader plugin format)
```

## Adding the repository

Publish this folder at the root of
[gehrman-grace/Mangayomi-Extentions](https://github.com/gehrman-grace/Mangayomi-Extentions)
(branch `main`) so the paths below exist, then add the catalogues in the app
(More → Settings → Browse):

```
manga repo: https://raw.githubusercontent.com/gehrman-grace/Mangayomi-Extentions/main/index.json
anime repo: https://raw.githubusercontent.com/gehrman-grace/Mangayomi-Extentions/main/anime_index.json
novel repo: https://raw.githubusercontent.com/gehrman-grace/Mangayomi-Extentions/main/novel_index.json
```

A source installs by downloading its `sourceCodeUrl`, for example
`.../main/javascript/manga/src/en/asurascans.js`, so the `javascript/` folder
has to sit at the repository root exactly as it does here.

## Notes

- Manga Fire signs every API call with the `vrf` parameter the site itself uses;
  no login is involved. If the site serves its shape captcha, open the source in
  the app's WebView once and solve it.
- Asura Scans chapters flagged premium return no pages; the source reports that
  instead of an empty reader.
- Vortex Scans and Manga Pill are parsed from their server-rendered HTML.

## Novels

Novel sources use the LNReader plugin format: the app evaluates the file from
`sourceCodeUrl` as a plugin with `exports.default`, so the catalogue
(`novel_index.json`) lists `id`/`name`/`site`/`lang`/`version`/`url`/`iconUrl`
per source and the app installs it as an LNReader-format novel extension.

- **Webnovel** reads the mobile Next.js site (`m.webnovel.com`): listings and
  search come from the page's `__NEXT_DATA__`, the chapter list from
  `/book/<id>/catalog`, and chapter text from the chapter page. Most chapters
  after the latest few are locked by Webnovel itself (Fast Pass/coins); those
  are marked 🔒 and the reader explains why there is no text. The site is
  behind Cloudflare bot management: if a request is challenged, open
  webnovel.com in the app's WebView once and retry.
- **Novel Fire** is parsed from server-rendered HTML (listings, search, the
  paginated chapter list at `/book/<slug>/chapters?page=n`, and `#content`).
