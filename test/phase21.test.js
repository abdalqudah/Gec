const test = require('node:test');
const assert = require('node:assert');
const { knex, resetDb, agent } = require('./helpers');

test.before(async () => { await resetDb(); await require('../src/db/seeds/demo-catalog').run(); });
test.after(() => knex.destroy());

test('simple home page: only the main sections by default; older saved layouts get the new defaults once', async () => {
  const layout = require('../src/modules/cms/home.layout');
  const shown = (await layout.load()).filter((s) => s.visible).map((s) => s.key);
  assert.deepEqual(shown, ['search', 'destinations', 'featured', 'services', 'testimonials', 'cta']);
  // A layout saved before the change (no version) is simplified; a layout saved now is kept as the editor left it.
  await knex('settings').where({ key: 'home_layout' }).del();
  await require('../src/modules/settings/settings.service').set({}, 'home_layout', { sections: [{ key: 'events', visible: true }] });
  assert.equal((await layout.load()).find((s) => s.key === 'events').visible, false);
  await layout.save({}, [{ key: 'events', visible: true }]);
  assert.equal((await layout.load()).find((s) => s.key === 'events').visible, true);
  await knex('settings').where({ key: 'home_layout' }).del();
});

test('start-here wizard sends the answers to the program search', async () => {
  const v = await agent();
  const page = await v.get('/start?lang=en');
  assert.equal(page.status, 200);
  assert.match(page.text, /data-wizard/);
  assert.match(page.text, /name="degree" value="master"/);
  assert.match(page.text, /name="max_tuition" value="20000"/);
  const r = await v.get('/programs?degree=master&field=&destination=&max_tuition=20000&lang=en');
  assert.equal(r.status, 200);
  assert.match((await v.get('/?lang=en')).text, /href="\/start"/);
});

test('clear buttons: compare and favourites have words, the phone bar is there, the menu is short', async () => {
  const v = await agent();
  const html = (await v.get('/programs?lang=ar')).text;
  assert.match(html, /i-git-compare-arrows/);
  assert.doesNotMatch(html, /i-scale"/);
  assert.match(html, /<span data-short>قارن<\/span>/);
  assert.match(html, /class="mobile-bar"/);
  assert.match(html, /فلاتر إضافية/);
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.match(header, /class="nav-secondary"><a href="\/universities"/);
});
