// Phase 20 — website editor: a photo per scholarship (texts and fixed images live in settings).
exports.up = async (knex) => {
  await knex.schema.alterTable('scholarships', (t) => { t.string('image', 500); });
};
exports.down = async (knex) => {
  await knex.schema.alterTable('scholarships', (t) => { t.dropColumn('image'); });
};
