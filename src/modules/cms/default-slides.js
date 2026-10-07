// The four slides the home page shows while Website → Home slider is empty. "Add the built-in slides" (and the demo
// data) copies them into the slider as ordinary records, so their texts, photos and buttons can be edited or deleted.
const knex = require('../../db/knex');
const settings = require('../settings/settings.service');
const { translator } = require('../../core/i18n');

async function rows({ demo = false } = {}) {
  const en = translator('en'); const ar = translator('ar');
  const hero = (await settings.get('site_home')) || {};
  const img = async (slug) => { const d = await knex('destinations').where({ slug }).first('hero_image').catch(() => null); return (d && d.hero_image) || null; };
  const s = (n, cover, image, href, second) => ({
    eyebrow_en: en(`home.s${n}_eyebrow`), eyebrow_ar: ar(`home.s${n}_eyebrow`),
    title_en: (n === 1 && hero.hero_title_en) || en(`home.s${n}_title`), title_ar: (n === 1 && hero.hero_title_ar) || ar(`home.s${n}_title`),
    text_en: (n === 1 && hero.hero_lead_en) || en(`home.s${n}_text`), text_ar: (n === 1 && hero.hero_lead_ar) || ar(`home.s${n}_text`),
    image, cover, cta_label_en: en(`home.s${n}_cta`), cta_label_ar: ar(`home.s${n}_cta`), cta_href: href,
    cta2_label_en: en(second[0]), cta2_label_ar: ar(second[0]), cta2_href: second[1], position: n, is_active: true, ...(demo ? { is_demo: true } : {}),
  });
  return [
    s(1, 'uk', await img('uk'), '/programs', ['site.book_consultation', '/book']),
    s(2, 'scholarship', null, '/scholarships', ['site.nav.calculator', '/cost-calculator']),
    s(3, 'usa', await img('usa'), '/study/usa', ['site.book_consultation', '/book']),
    s(4, 'campus', null, '/register', ['site.nav.advisor', '/advisor']),
  ];
}

/** Adds the built-in slides when the slider is empty; returns how many were added. */
async function insert({ demo = false } = {}) {
  if (await knex('hero_slides').first('id')) return 0;
  const list = await rows({ demo });
  await knex('hero_slides').insert(list);
  return list.length;
}

module.exports = { rows, insert };
