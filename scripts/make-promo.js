#!/usr/bin/env node
/**
 * Renders a promotional graphic per event into static/assets/promo/ — the image
 * you paste into an email or post to LinkedIn. Unlike the link previews, this
 * one carries the whole pitch, because plenty of recipients never click through.
 *
 *   node build.js && node build.js --serve &
 *   node scripts/make-promo.js
 *
 * Needs Chrome or Chromium (set CHROME=/path/to/chrome to choose one).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'static', 'assets', 'promo');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'events.json'), 'utf8'));

const CHROME = [
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].filter(Boolean).find((p) => { try { return fs.existsSync(p); } catch { return false; } });
if (!CHROME) { console.error('No Chrome/Chromium found. Set CHROME=/path/to/chrome.'); process.exit(1); }

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const name = (ev) => ev.slug || slugify(ev.regionLabel) + (ev.sortDate ? '-' + ev.sortDate.slice(0, 4) : '');

const fmtDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
};

const HERO = fs.readdirSync(path.join(ROOT, 'static', 'assets'))
  .find((f) => /^hero-artwork\./i.test(f));

function page(ev) {
  const topics = data.content.themes.slice(0, 6).map((t) => t.title);
  const net = ev.networkingStart && ev.networkingEnd
    ? `<br><span style="color:#b6a9a7">Networking ${fmtTime(ev.networkingStart)} – ${fmtTime(ev.networkingEnd)}</span>`
    : '';
  const when = ev.date
    ? `${fmtDate(ev.date)}<br>${fmtTime(ev.startTime)} – ${fmtTime(ev.endTime)} ${ev.timezoneLabel || ''}${net}`
    : (ev.dateNote || 'Date to be announced');
  const where = ev.venue && ev.venue.name
    ? `${ev.venue.name}<br>${[ev.venue.street, ev.venue.city, ev.venue.region].filter(Boolean).join(', ')}`
    : 'Venue to be announced';
  const sky = ev.skylineImage
    ? `background:url('${ev.skylineImage}') center 40% / cover no-repeat;` +
      `filter:grayscale(1) contrast(1.15) brightness(1.05);mix-blend-mode:screen;opacity:.18;`
    : 'display:none;';
  const url = data.site.baseUrl.replace(/^https?:\/\//, '') + (ev.slug ? `/${ev.slug}/` : '');

  return `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/styles.css">
<style>
html,body{margin:0;background:#120406}
.p{width:1200px;height:1680px;position:relative;overflow:hidden;box-sizing:border-box;
   background:radial-gradient(120% 70% at 74% 12%,#3d1218 0%,#1e080b 46%,#120406 78%),#120406;
   display:flex;flex-direction:column}
.p__sky{position:absolute;left:0;right:0;bottom:0;height:34%;${sky}
   -webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.8) 40%,transparent 100%);
   mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.8) 40%,transparent 100%)}
.p__art{width:100%;display:block}
.p__body{position:relative;padding:40px 72px 0;flex:1;display:flex;flex-direction:column}
.p__city{font-family:var(--display);font-weight:700;font-size:96px;line-height:.92;
   text-transform:uppercase;color:#fff;margin:0}
.p__rule{height:4px;border:0;background:linear-gradient(90deg,#c8191f 0%,#c8191f 60%,rgba(200,25,31,.1) 100%);
   margin:20px 0 24px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:26px 40px}
.lbl{font-family:var(--display);font-weight:600;font-size:19px;letter-spacing:.2em;
   text-transform:uppercase;color:#ff4d54;margin:0 0 8px}
.val{font-family:var(--body);font-size:26px;line-height:1.35;color:#fff;margin:0;font-weight:500}
.p__topics{margin:30px 0 0}
.p__topics ul{list-style:none;margin:12px 0 0;padding:0;display:grid;
   grid-template-columns:1fr 1fr;gap:10px 34px}
.p__topics li{position:relative;padding-left:26px;font-family:var(--body);font-size:23px;color:#e4dcda}
.p__topics li::before{content:'';position:absolute;left:0;top:.55em;width:10px;height:10px;
   background:#c8191f;transform:rotate(45deg)}
.p__foot{margin-top:auto;padding:30px 0 26px;display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.p__free{padding:18px 30px;background:#c8191f;color:#fff;font-family:var(--display);font-weight:700;
   font-size:30px;letter-spacing:.09em;text-transform:uppercase;line-height:1}
.p__url{font-family:var(--display);font-weight:600;font-size:31px;letter-spacing:.02em;color:#fff}
.p__org{font-family:var(--body);font-size:19px;color:#b6a9a7;margin:0;padding:0 72px 40px;position:relative}
</style>
<div class="p">
  <div class="p__sky"></div>
  ${HERO ? `<img class="p__art" src="/assets/${HERO}" alt="">` : ''}
  <div class="p__body">
    <h1 class="p__city">${esc(ev.city ? `${ev.city}, ${ev.province}` : ev.regionLabel)}</h1>
    <hr class="p__rule">
    <div class="grid">
      <div><p class="lbl">When</p><p class="val">${when}</p></div>
      <div><p class="lbl">Where</p><p class="val">${where}</p></div>
      <div><p class="lbl">Cost</p><p class="val">Free to attend — lunch included</p></div>
      <div><p class="lbl">Who</p><p class="val">Police, border and transport partners,<br>prosecutors, corrections, analysts</p></div>
    </div>
    <div class="p__topics">
      <p class="lbl">Topics include</p>
      <ul>${topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
    <div class="p__foot">
      <span class="p__free">Register free</span>
      <span class="p__url">${esc(url)}</span>
    </div>
  </div>
  <p class="p__org">Hosted by ${esc(data.site.organizerName)}</p>
</div>`;
}

fs.mkdirSync(OUT, { recursive: true });
const DIST = path.join(ROOT, 'dist');
let n = 0;
for (const ev of data.events.filter((e) => e.slug)) {
  const key = name(ev);
  const tmp = path.join(DIST, `_promo_${key}.html`);
  fs.writeFileSync(tmp, page(ev));
  const dest = path.join(OUT, `${key}-promo.png`);
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1200,1680', '--virtual-time-budget=9000',
    `--screenshot=${dest}`, `http://localhost:8080/_promo_${key}.html`], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  console.log('  ·', path.relative(ROOT, dest), `(${(fs.statSync(dest).size / 1024).toFixed(0)} kB)`);
  n++;
}
console.log(`\n${n} promo graphic(s).`);
