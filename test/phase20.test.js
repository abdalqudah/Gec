const test = require('node:test');
const assert = require('node:assert');
const { knex, resetDb, makeStaff, staffAgent, agent } = require('./helpers');

const form = async (a, url, body = {}) => { const t = await a.token(); return a.post(url).type('form').send({ _csrf: t, ...body }); };
let marketing;
test.before(async () => { await resetDb(); await require('../src/db/seeds/demo-catalog').run(); marketing = await makeStaff({ role: 'marketing' }); });
test.after(() => knex.destroy());

test('website texts: any text can be changed in both languages and reset; only website editors', async () => {
  const m = await staffAgent(marketing);
  const page = await m.get('/staff/website/texts?group=schol&lang=en');
  assert.equal(page.status, 200);
  assert.match(page.text, /name="en:schol\.title"/);
  await form(m, '/staff/website/texts', { 'en:schol.title': 'Funding & grants', 'ar:schol.title': 'التمويل والمنح', 'en:not.a.key': 'x' });
  const v = await agent();
  assert.match((await v.get('/scholarships?lang=en')).text, /<h1>Funding &amp; grants<\/h1>/);
  assert.match((await v.get('/scholarships?lang=ar')).text, /التمويل والمنح/);
  assert.match((await m.get('/staff/website/texts?edited=1&lang=en')).text, /schol\.title/);
  // Clearing a field goes back to the default text.
  await form(m, '/staff/website/texts', { 'en:schol.title': '', 'ar:schol.title': '' });
  assert.doesNotMatch((await v.get('/scholarships?lang=en')).text, /Funding &amp; grants/);
  const c = await staffAgent(await makeStaff({ role: 'counsellor' }));
  assert.equal((await c.get('/staff/website/texts')).status, 403);
  assert.equal((await form(c, '/staff/website/texts', { 'en:schol.title': 'Hacked' })).status, 403);
});

test('website images: section backgrounds, page banners and defaults; scholarship photo; unsafe values refused', async () => {
  const m = await staffAgent(marketing);
  assert.equal((await m.get('/staff/website/images?lang=en')).status, 200);
  const layout = require('../src/modules/cms/home.layout');
  await layout.save({}, (await layout.load()).map((x) => ({ ...x, visible: true }))); // the scholarships section is off by default
  await form(m, '/staff/website/images', { home_scholarships: '/media/7', banner_scholarships: 'https://cdn.example.com/s.jpg', default_event: '' });
  const v = await agent();
  assert.match((await v.get('/?lang=en')).text, /url\(&#39;\/media\/7&#39;\),url\(&#39;\/img\/covers\/scholarship\.svg&#39;\)/);
  const list = await v.get('/scholarships?lang=en');
  assert.match(list.text, /class="page-banner"/);
  assert.equal((list.text.match(/<h1/g) || []).length, 1, 'one h1 with a banner');
  const bad = await form(m, '/staff/website/images', { home_cta: 'javascript:alert(1)' });
  assert.equal(bad.status, 422);
  assert.doesNotMatch((await v.get('/?lang=en')).text, /javascript:alert/);
  // A photo on one scholarship.
  const s = await knex('scholarships').where({ is_active: true }).first();
  await knex('scholarships').where({ id: s.id }).update({ image: 'https://cdn.example.com/schol.jpg' });
  assert.match((await v.get(`/scholarships/${s.slug}?lang=en`)).text, /cdn\.example\.com\/schol\.jpg/);
});

test('edit bar: website editors see links to edit this page; visitors and other staff do not', async () => {
  const m = await staffAgent(marketing);
  const u = await knex('universities').where({ is_active: true }).first();
  const page = await m.get(`/universities/${u.slug}?lang=en`);
  assert.match(page.text, /class="edit-bar"/);
  assert.match(page.text, new RegExp(`href="/staff/universities/${u.id}"`));
  const token = /\/staff\/website\/texts\?on=([A-Za-z0-9_-]+)/.exec(page.text)[1];
  const texts = await m.get(`/staff/website/texts?on=${token}&lang=en`);
  // The page token never collides with page numbering (a token starting with a digit used to show an empty list).
  const { rememberKeys } = require('../src/modules/cms/siteedit');
  const digitToken = rememberKeys(new Set(['unis.title']), '/universities');
  assert.match((await m.get(`/staff/website/texts?on=${digitToken}&page=1&lang=en`)).text, /name="en:unis\.title"/);
  assert.match(texts.text, /Texts used on/);
  assert.match(texts.text, /name="en:/);
  assert.doesNotMatch((await (await agent()).get(`/universities/${u.slug}`)).text, /edit-bar/);
  const c = await staffAgent(await makeStaff({ role: 'counsellor' }));
  assert.doesNotMatch((await c.get(`/universities/${u.slug}`)).text, /class="edit-bar"/);
});

test('image picker: available on every editing page; upload from the picker answers with the new address', async () => {
  const m = await staffAgent(marketing);
  for (const url of ['/staff/website/images', '/staff/website/home', '/staff/settings/seo']) assert.match((await m.get(url)).text, /id="media-picker"/, url);
  const t = await m.token();
  const png = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'brand', 'mark-64.png'));
  const r = await m.post('/staff/media/picker-upload').set('Accept', 'application/json').field('_csrf', t).field('alt_en', 'Logo').attach('file', png, 'mark.png');
  assert.equal(r.status, 200);
  assert.match(r.body.url, /^\/media\/\d+$/);
  const bad = await m.post('/staff/media/picker-upload').set('Accept', 'application/json').field('_csrf', t).attach('file', Buffer.from('not an image'), 'x.png');
  assert.notEqual(bad.status, 200);
  const noToken = await m.post('/staff/media/picker-upload').set('Accept', 'application/json').attach('file', png, 'mark.png');
  assert.notEqual(noToken.status, 200);
  const c = await staffAgent(await makeStaff({ role: 'counsellor' }));
  assert.doesNotMatch((await c.get('/staff')).text, /id="media-picker"/);
});
