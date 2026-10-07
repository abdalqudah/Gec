// Staff: Website → Texts (any text on the site, Arabic and English) and Website → Images (fixed pictures).
const express = require('express');
const i18n = require('../../core/i18n');
const { can } = require('../../middleware/auth');
const { flash } = require('../../middleware/web');
const { ah, page: pageNo } = require('../../core/http');
const nav = require('../staff/nav');
const svc = require('./siteedit');

nav.add('website', { key: 'site_texts', href: '/staff/website/texts', icon: 'type', perms: ['cms.manage'] }, { before: 'slides' });
nav.add('website', { key: 'site_images', href: '/staff/website/images', icon: 'image', perms: ['cms.manage'] }, { before: 'slides' });

const router = express.Router();
const PER = 40;

function textRows(req) {
  const ov = i18n.getOverrides();
  const fromPage = req.query.on ? svc.keysFor(req.query.on) : null; // "on" = the page the editor came from ("page" is the page number)
  const group = svc.TEXT_GROUPS.includes(req.query.group) ? req.query.group : (fromPage || req.query.q || req.query.edited ? null : 'home');
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
  let keys = fromPage ? fromPage.keys : i18n.keys('en').filter((k) => svc.TEXT_GROUPS.includes(k.split('.')[0]));
  if (group && !fromPage) keys = keys.filter((k) => k.split('.')[0] === group);
  const rows = keys.map((key) => ({ key, en: i18n.fileText('en', key), ar: i18n.fileText('ar', key), oen: ov.en[key], oar: ov.ar[key] }))
    .filter((r) => r.en || r.ar)
    .filter((r) => !q || [r.key, r.en, r.ar, r.oen, r.oar].some((v) => String(v || '').toLowerCase().includes(q)))
    .filter((r) => !req.query.edited || r.oen || r.oar);
  return { rows, group, q, fromPage };
}

router.get('/website/texts', can('cms.manage'), ah(async (req, res) => {
  const { rows, group, q, fromPage } = textRows(req);
  const p = pageNo(req);
  const ov = i18n.getOverrides();
  res.page('pages/staff/cms/texts', {
    layout: 'staff', title: req.t('nav.site_texts'), rows: rows.slice((p - 1) * PER, p * PER), meta: { page: p, pages: Math.max(1, Math.ceil(rows.length / PER)), total: rows.length },
    groups: svc.TEXT_GROUPS, group, q, fromPage, edited: Object.keys(ov.en).length + Object.keys(ov.ar).length,
  });
}));
router.post('/website/texts', can('cms.manage'), ah(async (req, res) => {
  const entries = Object.fromEntries(Object.entries(req.body).filter(([k]) => /^(en|ar):/.test(k)));
  const n = await svc.saveTexts(req.ctx, entries);
  flash(req, 'ok', req.t('siteedit.texts_saved', { n }));
  res.redirect(`/staff/website/texts${String(req.body.back || '').startsWith('?') ? req.body.back.slice(0, 500) : ''}`);
}));

router.get('/website/images', can('cms.manage'), ah(async (req, res) => {
  res.page('pages/staff/cms/images', { layout: 'staff', narrow: true, title: req.t('nav.site_images'), slots: svc.IMAGE_SLOTS, current: Object.fromEntries(Object.keys(svc.IMAGE_SLOTS).map((k) => [k, svc.imageOf(k) || ''])), errors: {} });
}));
router.post('/website/images', can('cms.manage'), ah(async (req, res) => {
  const { errors } = await svc.saveImages(req.ctx, req.body);
  if (Object.keys(errors).length) {
    res.status(422);
    return res.page('pages/staff/cms/images', { layout: 'staff', narrow: true, title: req.t('nav.site_images'), slots: svc.IMAGE_SLOTS, current: Object.fromEntries(Object.keys(svc.IMAGE_SLOTS).map((k) => [k, req.body[k] || ''])), errors });
  }
  flash(req, 'ok', req.t('common.saved'));
  return res.redirect('/staff/website/images');
}));

module.exports = router;
