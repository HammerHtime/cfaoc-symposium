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

### French

The site builds in English at `/` and French at `/fr/`, with an EN | FR toggle in
the nav and `hreflang` tags so search engines pair the two.

English is the source of truth. `i18n.fr` in `events.json` holds only the
strings that differ; anything it does not define falls back to English, so a
missing translation shows readable English rather than a blank. To change French
wording, edit `i18n.fr` — the structure mirrors the English `content` and `site`
blocks, plus a `ui` block for interface labels (nav, buttons, field names) and an
`events` block keyed by slug, or by the slugified region for a city not yet
announced.

Dates and times follow the language: "Tuesday, November 24, 2026 · 8:30 a.m."
in English, "mardi 24 novembre 2026 · 8 h 30" in French.

Note "program" is the Canadian spelling in English; French correctly uses
"programme".

**The French was written by an AI and needs a francophone review before it is
promoted.** It is accurate and idiomatic as far as that goes, but a public page
aimed at police services in Quebec and New Brunswick deserves a human check.

### Link preview images

Each city has its own 1200x630 preview — the image people see when the link is
shared in Teams, WhatsApp, LinkedIn or email. They live in
`static/assets/og/` and are generated, not hand-made:

```bash
node build.js              # the generator reads the whorl from the built output
node build.js --serve &    # it screenshots through the local server
node scripts/make-og.js
```

Then commit the PNGs. It needs Chrome or Chromium (set `CHROME=/path/to/chrome`
if it is not found automatically). Re-run it whenever you add a city, change a
date or add a skyline photo.

Deliberately not part of `node build.js`: it needs a real browser, and making
every deploy depend on one is a good way to break deploys.

To ghost a city's skyline into its card, add a `skylineImage` to that event
pointing at an image in `static/assets/`, as Victoria does. Without one the card
falls back to the plain maroon version, which still looks finished.

### Promotional graphic

`static/assets/promo/<slug>-promo.png` — the image to paste into an email or post
to LinkedIn. It carries the whole pitch (when, where, cost, who, topics, register
URL), because plenty of recipients never click through. Regenerate the same way
as the link previews:

```bash
node build.js && node build.js --serve &
node scripts/make-promo.js
```

### Ordering

Events are sorted chronologically at build time, so the order they sit in
`events.json` does not matter. An event with a real `date` sorts on that; one
still to be scheduled sorts on `sortDate`, a `YYYY-MM` hint (e.g. `"2027-04"`
for a spring Forum). Anything with neither goes last. Set `sortDate` alongside
`dateNote` and the card lands in the right place on its own.

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
