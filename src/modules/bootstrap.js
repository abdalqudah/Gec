// Start-up tasks: built-in roles, the first administrator (from ADMIN_EMAIL / ADMIN_PASSWORD) and a first branch.
const knex = require('../db/knex');
const config = require('../config');
const { syncSystemRoles } = require('./rbac/rbac.service');
const { hashPassword } = require('./auth/auth.service');

async function ensureAdmin() {
  const { email, password, name, reset } = config.bootstrapAdmin;
  if (!email) { console.warn('[bootstrap] ADMIN_EMAIL is not set; no admin created'); return; } // eslint-disable-line no-console
  if (password.length < 10) { console.warn('[bootstrap] ADMIN_PASSWORD must be at least 10 characters; no admin created or reset'); return; } // eslint-disable-line no-console
  const existing = await knex('users').where({ kind: 'staff', email }).first();
  const role = await knex('roles').where({ key: 'super_admin' }).first();
  if (existing) {
    if (!reset) return; // never overwrite an existing account's password unless ADMIN_RESET=true
    // Recovery from the hosting panel: new password, unlocked, active, Super Admin.
    await knex('users').where({ id: existing.id }).update({ password_hash: await hashPassword(password), status: 'active', failed_logins: 0, locked_until: null, must_change_password: false, password_changed_at: new Date() });
    const emp = await knex('employees').where({ user_id: existing.id }).first('id');
    if (emp) await knex('employees').where({ id: emp.id }).update({ role_id: role.id });
    else await knex('employees').insert({ user_id: existing.id, role_id: role.id, job_title: 'Administrator', is_counsellor: false });
    await require('../core/audit').record({ userId: null }, 'auth.admin_reset_at_startup', { entityType: 'user', entityId: existing.id }); // eslint-disable-line global-require
    console.warn(`[bootstrap] ADMIN_RESET: password reset for ${email}. Remove ADMIN_RESET from the environment now.`); // eslint-disable-line no-console
    return;
  }
  await knex.transaction(async (trx) => {
    const [userId] = await trx('users').insert({ kind: 'staff', email, name, password_hash: await hashPassword(password), status: 'active', must_change_password: false });
    const branch = await trx('branches').orderBy('id').first();
    await trx('employees').insert({ user_id: userId, role_id: role.id, branch_id: branch ? branch.id : null, job_title: 'Administrator', is_counsellor: false });
  });
  console.log(`[bootstrap] super admin ${email} created`); // eslint-disable-line no-console
}

async function ensureBranch() {
  const any = await knex('branches').first('id');
  if (!any) await knex('branches').insert({ name: 'Headquarters', name_ar: 'المقر الرئيسي', country: 'United States', city: 'Chicago', timezone: 'America/Chicago' });
}

async function run() {
  await syncSystemRoles();
  await ensureBranch();
  await ensureAdmin();
  await require('./cms/siteedit').load(); // eslint-disable-line global-require
  await require('./system/github').markLive().catch(() => {}); // eslint-disable-line global-require
  for (const mod of ['./crm/stages', './admissions/stages']) { // configurable pipelines get their defaults
    try { await require(mod).ensureDefaults(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; } // eslint-disable-line global-require
  }
}

module.exports = { run };
