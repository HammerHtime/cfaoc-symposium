# Canadian Forum Against Organized Crime — event site

Static site for the CFAOC National Symposium series. One national hub page plus a
full page per city. No frameworks, no dependencies, no database — `events.json`
is the website, and `build.js` turns it into HTML.

```
events.json          ← ALL content lives here. This is the file you edit.
build.js             ← renders events.json + static/ into dist/
netlify.toml         ← Netlify build + headers
static/              ← copied verbatim into dist/
  styles.css
  main.js
  assets/
    favicon.svg
    hotel/victoria/  ← drop hotel photos here (see below)
dist/                ← generated. Never edit; never committed.
```

## Build it

```bash
node build.js            # writes ./dist
node build.js --serve    # builds, then serves ./dist at http://localhost:8080
```

Node 18 or newer. Nothing to install.

## Deploy to Netlify

Connect this repo in Netlify. The settings come from `netlify.toml` automatically:

| Setting | Value |
| --- | --- |
| Build command | `node build.js` |
| Publish directory | `dist` |

Push to the default branch and Netlify rebuilds.

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
  "utcOffset": "-04:00",          ← -08:00 Pacific, -07:00 Mountain,
                                  ←  -06:00 Central, -05:00 Eastern, -04:00 Atlantic
  "timezoneLabel": "AT",
  "registerUrl": "https://…",     ← that city's own registration page
  "venue": { … },
  "hotel": { … }                  ← or null if there's no room block
}
```

Run `node build.js` and the city gets its own page, its own calendar file, a card
on the hub, a sitemap entry and its own event listing for search engines. Nothing
else needs touching.

Watch `utcOffset`: it decides what time the calendar download lands in someone's
calendar. November dates are on standard time; March-onward dates may be on
daylight time (one hour less, e.g. `-03:00` Atlantic).

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
