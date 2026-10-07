// Website editor: change any text on the site (overrides of the language files) and any fixed image (section
// backgrounds, page banners, default pictures) from the workspace. Both are stored in settings and kept in memory,
// so pages render without extra queries.
const crypto = require('crypto');
const settings = require('../settings/settings.service');
const audit = require('../../core/audit');
const i18n = require('../../core/i18n');

// Text groups shown in the editor (top-level keys of the language files), the public site first.
const TEXT_GROUPS = ['home', 'site', 'finder', 'program', 'unis', 'schol', 'dest', 'calc', 'book', 'contact', 'events', 'courses', 'booking',
  'newsletter', 'partnerp', 'compare', 'shortlist', 'search', 'match', 'advisor', 'journey', 'privacy', 'unsub', 'auth', 'portal', 'cms', 'common', 'ref', 'errors'];

// Fixed image slots: key → { group, fallback (illustration used when empty) }.
const IMAGE_SLOTS = {
  home_scholarships: { group: 'home', fallback: 'scholarship' },
  home_cta: { group: 'home', fallback: 'campus' },
  home_portal: { group: 'home', fallback: 'uk' },
  banner_programs: { group: 'banners', fallback: 'hero' },
  banner_universities: { group: 'banners', fallback: 'campus' },
  banner_destinations: { group: 'banners', fallback: 'hero' },
  banner_scholarships: { group: 'banners', fallback: 'scholarship' },
  banner_services: { group: 'banners', fallback: 'campus' },
  banner_resources: { group: 'banners', fallback: 'hero' },
  banner_events: { group: 'banners', fallback: 'campus' },
  banner_courses: { group: 'banners', fallback: 'uk' },
  banner_faq: { group: 'banners', fallback: 'campus' },
  banner_contact: { group: 'banners', fallback: 'hero' },
  banner_book: { group: 'banners', fallback: 'campus' },
  for_universities: { group: 'other', fallback: 'campus' },
  default_event: { group: 'defaults', fallback: 'campus' },
  default_course: { group: 'defaults', fallback: 'campus' },
  default_article: { group: 'defaults', fallback: 'hero' },
  default_scholarship: { group: 'defaults', fallback: 'scholarship' },
  cta_block: { group: 'defaults', fallback: 'campus' },
};
let images = {};
const imageOf = (key) => images[key] || null;
const isImg = (v) => /^(https:\/\/[^\s"'()]+|\/media\/\d+|\/(img|art)\/[a-z0-9/._-]+)$/.test(v);

async function load() {
  i18n.setOverrides((await settings.get('text_overrides')) || {});
  images = (await settings.get('site_images')) || {};
}

/** Saves the texts of one editor page: { 'en:key': value, 'ar:key': value } — empty values go back to the default. */
async function saveTexts(ctx, entries) {
  const cur = { en: { ...(i18n.getOverrides().en) }, ar: { ...(i18n.getOverrides().ar) } };
  const known = new Set(i18n.keys('en'));
  let changed = 0;
  for (const [field, raw] of Object.entries(entries)) {
    const m = /^(en|ar):([A-Za-z0-9_.-]{1,120})$/.exec(field);
    if (!m || !known.has(m[2])) continue; // eslint-disable-line no-continue
    const [, locale, key] = m;
    const value = String(raw || '').replace(/\r\n/g, '\n').trim().slice(0, 2000);
    const fileValue = i18n.fileText(locale, key);
    if (!value || value === fileValue) { if (cur[locale][key] !== undefined) { delete cur[locale][key]; changed += 1; } } else if (cur[locale][key] !== value) { cur[locale][key] = value; changed += 1; }
  }
  if (changed) {
    await settings.set(null, 'text_overrides', cur);
    i18n.setOverrides(cur);
    await audit.record(ctx, 'website.texts_saved', { entityType: 'settings', entityId: 'text_overrides', newValues: { changed } });
  }
  return changed;
}

async function saveImages(ctx, entries) {
  const next = { ...images };
  const errors = {};
  for (const key of Object.keys(IMAGE_SLOTS)) {
    if (!(key in entries)) continue; // eslint-disable-line no-continue
    const v = String(entries[key] || '').trim();
    if (!v) delete next[key];
    else if (isImg(v)) next[key] = v.slice(0, 500);
    else errors[key] = 'Use an https:// image address or choose from the library.';
  }
  if (Object.keys(errors).length) return { errors };
  await settings.set(ctx, 'site_images', next);
  images = next;
  return { errors: {} };
}

// "Texts on this page": the keys a page used, kept briefly under a random token for the editor link.
const pageKeys = new Map();
function rememberKeys(set, path) {
  const id = crypto.randomBytes(9).toString('base64url');
  pageKeys.set(id, { keys: [...set].filter((k) => TEXT_GROUPS.includes(k.split('.')[0])).slice(0, 400), path });
  if (pageKeys.size > 300) pageKeys.delete(pageKeys.keys().next().value);
  return id;
}
const keysFor = (id) => pageKeys.get(String(id || '')) || null;

module.exports = { TEXT_GROUPS, IMAGE_SLOTS, load, imageOf, saveTexts, saveImages, rememberKeys, keysFor, isImg };
