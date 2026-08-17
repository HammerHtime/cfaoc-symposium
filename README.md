# Canadian Forum Against Organized Crime — event site

Static site for the CFAOC National Symposium series. One national hub page plus a
full page per city. No frameworks, no dependencies, no database — `events.json`
is the website, and `build.js` turns it into HTML.

```
cfaoc-site/
  events.json        ← ALL content lives here. This is the file you edit.
  build.js           ← renders events.json + static/ into dist/
  netlify.toml       ← Netlify build + headers
  static/            ← copied verbatim into dist/
    styles.css
    main.js
    assets/
      favicon.svg
      hotel/victoria/  ← drop hotel photos here (see below)
  dist/              ← generated. Never edit; never committed.
```

## Build it

```bash
cd cfaoc-site
node build.js            # writes ./dist
node build.js --serve    # builds, then serves ./dist at http://localhost:8080
```

Node 18 or newer. Nothing to install.

## Deploy to Netlify

Connect the repo, then in **Site configuration → Build & deploy → Build settings**:

| Setting | Value |
| --- | --- |
| Base directory | `cfaoc-site` |
| Build command | `node build.js` |
| Publish directory | `cfaoc-site/dist` |

With the base directory set, Netlify picks up `cfaoc-site/netlify.toml` for the
caching and security headers. Push to the branch and Netlify rebuilds.

Prefer drag-and-drop? Run `node build.js` locally and drag the `dist` folder onto
the Netlify dashboard. You have to repeat that after every content change, which
is why the connected-repo route is better.

Once a custom domain is attached, set `site.baseUrl` in `events.json` to that
domain so the canonical URLs, sitemap and social-preview tags point at the real
address.

## Everyday jobs

### Add a registration link

Find the city in `events.json` and paste the URL into `registerUrl`:

```json
"registerUrl": "https://www.ongia.org/event-details/..."
```

Leave it as `""` and the button automatically renders as a non-clickable
"Registration opening soon" — so an unannounced city never ships a dead link.

### Announce one of the two remaining cities

Each TBA city is already in `events.json` with `"status": "tba"`. Fill it in:

```json
{
  "slug": "halifax",              ← becomes /halifax/ , lowercase, no spaces
  "status": "open",               ← "tba" → "open" is what creates the page
  "city": "Halifax",
  "province": "NS",
  "provinceName": "Nova Scotia",
  "regionLabel": "Atlantic Canada",
  "date": "2027-03-11",           ← YYYY-MM-DD
  "timezone": "America/Halifax",  ← IANA zone: America/Vancouver, /Edmonton,
                                  ←  /Winnipeg, /Toronto, /Halifax, /St_Johns
  "timezoneLabel": "AT",
  "registerUrl": "https://…",     ← that city's own registration page
  "venue": { … },
  "hotel": { … }                  ← or null if there's no room block
}
```

Run `node build.js` and the city gets its own page, its own calendar file, a card
on the hub, a sitemap entry and its own event listing for search engines. Nothing
else needs touching.

`timezone` takes an IANA zone name, not an offset. The build works out the
daylight-saving offset from the event's own date, so a May event and a November
event in the same city both land correctly in delegates' calendars. Set the zone
and forget it.

### Regional wording

The Topics intro contains a `{region}` placeholder. It is filled in per page:

- on a city page, from that event's `regionPhrase` (falling back to `regionLabel`)
- on the homepage, from `content.regionFallback` — currently "each host region",
  because that section covers the whole series rather than one city

So a new city only needs its own `regionPhrase` (e.g. `"the prairies"`) and the
sentence reads correctly everywhere. Nothing else to edit.

### Hotel photos

Drop image files into `static/assets/hotel/<slug>/` — for example
`static/assets/hotel/victoria/01-exterior.jpg`. They are picked up automatically in
filename order, so number them. The first one runs wide as the lead image. Give
each a caption by adding its filename to the `captions` map in that event's
`hotel` block:

```json
"captions": { "01-exterior.jpg": "The resort on Victoria's Inner Harbour" }
```

Resize to about 1600px on the long edge before adding them — the originals from a
hotel's press kit are usually far larger than a web page needs.

With no photos in the folder, the hotel section simply renders without a gallery.

### Use the official event artwork for the hero

The hero currently draws its ridge motif as vector art generated in `build.js`, so
it stays sharp at any size. To use the supplied graphic instead, save it as
`static/assets/hero-artwork.png` (`.jpg`, `.webp` and `.svg` also work). The build
detects it and switches the hero over automatically — no code change. Use the
largest, cleanest version available; it renders full-bleed behind the headline.

### Change the wording

Every heading, paragraph, agenda row, FAQ and list item is a string in
`events.json`. Edit, run `node build.js`, look at it, push.

## What the build produces

- `/` — series hub, leading with the next confirmed event
- `/<slug>/` — full page per confirmed city
- `/<slug>/<slug>.ics` — calendar download
- `404.html`, `sitemap.xml`, `robots.txt`
- `Event` structured data on every event page, so Google can show the date,
  location and free admission directly in search results

## Notes

- The site is accessible by construction: semantic landmarks, a skip link, keyboard
  operable nav and gallery, visible focus, and reduced-motion support. Keep that
  intact when editing.
- Display type is Oswald via Google Fonts, with a condensed system fallback. If the
  font fails to load the layout still holds.
- No analytics or tracking is loaded. To add Google Analytics, put the measurement
  ID in `site.googleAnalyticsId`; leave it empty and no script is emitted.
