/* Checks that the build reads the ONGIA desk's files (desk/<page>.json) the way the desk expects:
 *   node scripts/test-desk.js
 * It builds a throwaway copy of the site with two made-up desk files: one over Victoria, one for a city the site
 * has never had. Nothing in this folder is changed. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfaoc-desk-'));
for (const f of ['build.js', 'events.json']) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
fs.cpSync(path.join(ROOT, 'static'), path.join(tmp, 'static'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'desk'));
const write = (name, o) => fs.writeFileSync(path.join(tmp, 'desk', name), JSON.stringify(o, null, 2));
write('victoria.json', { event: { slug: 'victoria', status: 'open', startTime: '08:15',
  hotel: { groupCode: 'TESTCODE', bookBy: '2026-10-30' },
  speakers: [{ name: 'Test Speaker', title: 'Analyst', org: 'Test Agency', bio: ['English bio.'] }, { name: 'Second Speaker', org: 'Other Agency', bio: ['Only English.'] }] },
  fr: { speakers: [{ name: 'Test Speaker', title: 'Analyste', org: 'Agence test', bio: ['Bio française.'] }, { name: 'Second Speaker', org: 'Other Agency', bio: ['Only English.'] }] } });
write('test-city.json', { event: { slug: 'test-city', status: 'open', city: 'Testville', province: 'NS', provinceName: 'Nova Scotia', timezone: 'America/Halifax', timezoneLabel: 'AT',
  regionLabel: 'Test Region', date: '2027-05-12', startTime: '08:30', endTime: '16:00', registerUrl: 'https://www.ongia.org/event-details/test', venue: { name: 'Test Hall', city: 'Testville', region: 'NS', country: 'Canada' },
  hotel: { name: 'Test Hotel', rate: '$199', bookingUrl: 'https://example.com/book' }, speakers: [{ name: 'Third Speaker', org: 'Third Agency' }], agenda: [{ time: '08:30', end: '09:00', title: 'Welcome' }] },
  fr: { speakers: [{ name: 'Third Speaker', org: 'Third Agency' }] } });
execFileSync(process.execPath, ['build.js'], { cwd: tmp, stdio: 'ignore' });

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n); } };
const read = (p) => (fs.existsSync(path.join(tmp, 'dist', p)) ? fs.readFileSync(path.join(tmp, 'dist', p), 'utf8') : '');
const vic = read('victoria/index.html'), vicFr = read('fr/victoria/index.html'), hub = read('index.html');
const names = [...vic.matchAll(/bio__name">([^<]*)/g)].map((m) => m[1]).join();
ok('the desk replaces Victoria\'s speakers', names === 'Test Speaker,Second Speaker');
ok('the desk\'s fields win and the rest stays (hotel photos and intro)', vic.includes('8:15') && vic.includes('TESTCODE') && vic.includes('gallery'));
ok('French: the French where there is some', vicFr.includes('Bio française.') && vicFr.includes('Agence test'));
ok('French: the English where there is none yet', vicFr.includes('Only English.'));
ok('a city the site never had gets its own page, in both languages', read('test-city/index.html').includes('Testville') && read('fr/test-city/index.html').includes('Testville'));
ok('and its own card on the home page', hub.includes('Testville'));
ok('the hand-written cities are still there', hub.includes('Toronto') && hub.includes('Moncton'));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
