// Demo data from the workspace (System → Demo data): load the sample catalogue, website content, CRM records and
// events with one button, and remove every demo row with another. Demo rows carry is_demo and a "Demo" chip, so
// they can also be edited or deleted one by one like any other record. After loading, the sample photos are copied
// into the media library in the background, so they can be replaced or deleted there too.
const knex = require('../../db/knex');
const audit = require('../../core/audit');
const settings = require('../settings/settings.service');

const SEEDS = ['demo-crm', 'demo-catalog', 'demo-engagement', 'demo-cms'];
const TABLES = ['universities', 'programs', 'scholarships', 'destinations', 'leads', 'students', 'applications', 'tasks', 'appointments', 'events', 'courses', 'articles', 'services', 'faqs', 'testimonials', 'pages', 'hero_slides', 'invoices', 'partners'];
const seed = (name) => require(`../../db/seeds/${name}`); // eslint-disable-line global-require, import/no-dynamic-require
let running = null;

async function counts() {
  const out = {};
  for (const t of TABLES) {
    try { out[t] = Number((await knex(t).where({ is_demo: true }).count({ n: '*' }))[0].n); } catch { out[t] = 0; } // eslint-disable-line no-await-in-loop
  }
  return out;
}

async function status() {
  const c = await counts();
  return { counts: c, total: Object.values(c).reduce((a, b) => a + b, 0), images: (await settings.get('demo_images')) || null, running: running ? running.kind : null };
}

/** Copies the demo photos (external addresses) into the media library. Runs after the request has answered. */
async function importImages(ctx) {
  await settings.set(null, 'demo_images', { state: 'running', started_at: new Date().toISOString() });
  try {
    const media = require('../cms/media.service'); // eslint-disable-line global-require
    const r = await media.importExternal(ctx);
    await settings.set(null, 'demo_images', { state: 'done', imported: r.imported, rows: r.rows, failed: r.failed.length, finished_at: new Date().toISOString() });
  } catch (e) {
    await settings.set(null, 'demo_images', { state: 'failed', error: String(e.message).slice(0, 200), finished_at: new Date().toISOString() });
  }
}

async function load(ctx, { images = true } = {}) {
  if (running) throw Object.assign(new Error('busy'), { code: 'DEMO_BUSY' });
  running = { kind: 'load' };
  try {
    const result = {};
    for (const name of SEEDS) result[name] = await seed(name).run(); // eslint-disable-line no-await-in-loop
    await audit.record(ctx, 'demo.loaded', { entityType: 'system', newValues: { seeds: SEEDS } });
    if (images) setImmediate(() => { importImages(ctx).catch(() => {}); });
    return result;
  } finally { running = null; }
}

async function remove(ctx) {
  if (running) throw Object.assign(new Error('busy'), { code: 'DEMO_BUSY' });
  running = { kind: 'remove' };
  try {
    for (const name of [...SEEDS].reverse()) await seed(name).remove(); // eslint-disable-line no-await-in-loop
    await audit.record(ctx, 'demo.removed', { entityType: 'system' });
  } finally { running = null; }
}

module.exports = { status, load, remove, importImages, TABLES };
