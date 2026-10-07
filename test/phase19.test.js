const test = require('node:test');
const assert = require('node:assert');
const { knex, resetDb, makeStaff, staffAgent, agent } = require('./helpers');
const config = require('../src/config');

const form = async (a, url, body = {}) => { const t = await a.token(); return a.post(url).type('form').send({ _csrf: t, ...body }); };
let superAdmin;
test.before(async () => { await resetDb(); superAdmin = await makeStaff({ role: 'super_admin' }); });
test.after(() => knex.destroy());

test('System → Demo data: load from the workspace, edit like any record, remove everything marked Demo', async () => {
  const a = await staffAgent(superAdmin);
  assert.match((await a.get('/staff/system/demo?lang=en')).text, /No demo data/);
  const wasProd = config.isProd;
  config.isProd = true; // as on the live site
  try { await form(a, '/staff/system/demo/load'); } finally { config.isProd = wasProd; }
  const page = await a.get('/staff/system/demo?lang=en');
  assert.match(page.text, /demo records/);
  assert.ok(Number((await knex('universities').where({ is_demo: true }).count({ n: '*' }))[0].n) > 0);
  assert.ok(Number((await knex('programs').where({ is_demo: true }).count({ n: '*' }))[0].n) > 0);
  assert.ok(Number((await knex('leads').where({ is_demo: true }).count({ n: '*' }))[0].n) > 0);
  // Demo staff created on a live site cannot sign in with the published demo password.
  const v = await agent();
  const t = await v.csrf();
  const login = await v.post('/staff/login').type('form').send({ _csrf: t, email: 'sarah.demo@gec.test', password: 'Password123' });
  assert.notEqual(login.headers.location, '/staff');
  // The public site shows the demo catalogue.
  assert.match((await v.get('/universities?lang=en')).text, /University of Manchester/);
  // Own records survive removal.
  await knex('universities').insert({ slug: 'my-own-uni', name_en: 'My Own University', is_active: true });
  await form(a, '/staff/system/demo/remove');
  for (const t2 of ['universities', 'programs', 'leads', 'students', 'articles']) assert.equal(Number((await knex(t2).where({ is_demo: true }).count({ n: '*' }))[0].n), 0, t2);
  assert.ok(await knex('universities').where({ slug: 'my-own-uni' }).first());
  assert.equal(await knex('users').where({ email: 'sarah.demo@gec.test' }).first(), undefined);
  assert.ok(await knex('audit_logs').where({ action: 'demo.removed' }).first());
  const o = await staffAgent(await makeStaff({ role: 'admin' }));
  assert.equal((await o.get('/staff/system/demo')).status, 403);
  assert.equal((await form(o, '/staff/system/demo/load')).status, 403);
});

test('slider: the built-in slides can be added as editable slides; demo data includes them; logos fall back to crests', async () => {
  const { staffAgent: sa, makeStaff: ms } = require('./helpers');
  const m = await sa(await ms({ role: 'marketing' }));
  const list = await m.get('/staff/slides?lang=en');
  assert.match(list.text, /Add the built-in slides to edit/);
  await form(m, '/staff/slides/defaults');
  const rows = await knex('hero_slides').orderBy('position');
  assert.equal(rows.length, 4);
  assert.ok(rows[0].title_ar && rows[0].cta_href === '/programs');
  await form(m, '/staff/slides/defaults');
  assert.equal(Number((await knex('hero_slides').count({ n: '*' }))[0].n), 4, 'not added twice');
  assert.doesNotMatch((await m.get('/staff/slides?lang=en')).text, /Add the built-in slides to edit/);
  await knex('hero_slides').where({ position: 1 }).update({ title_en: 'My own headline' });
  assert.match((await (await agent()).get('/?lang=en')).text, /My own headline/);
  // Logos: a university logo that fails to load shows the generated crest underneath.
  await knex('universities').insert({ slug: 'logo-test', name_en: 'Logo Test University', is_active: true, logo: 'https://images.example.com/missing.png' });
  const s = await (await agent()).get('/search?q=Logo%20Test&lang=en');
  assert.match(s.text, /url\(&#39;https:\/\/images\.example\.com\/missing\.png&#39;\),url\(&#39;\/art\/crest\/logo-test\.svg&#39;\)/);
});
