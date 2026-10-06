const test = require('node:test');
const assert = require('node:assert');
const { knex, resetDb, agent } = require('./helpers');
const config = require('../src/config');
const bootstrap = require('../src/modules/bootstrap');

test.after(() => knex.destroy());

const signIn = async (email, password) => {
  const a = await agent();
  const t = await a.csrf();
  return a.post('/staff/login').type('form').send({ _csrf: t, email, password });
};

test('admin from the environment: created once, never overwritten, ADMIN_RESET recovers access', async () => {
  await resetDb();
  Object.assign(config.bootstrapAdmin, { email: 'owner@gec.test', password: 'short', name: 'Owner', reset: false });
  await bootstrap.run();
  assert.equal(await knex('users').where({ email: 'owner@gec.test' }).first(), undefined, 'too short: not created');
  config.bootstrapAdmin.password = 'FirstPass12345';
  await bootstrap.run();
  assert.equal((await signIn('owner@gec.test', 'FirstPass12345')).headers.location, '/staff');
  config.bootstrapAdmin.password = 'SecondPass12345';
  await bootstrap.run();
  assert.notEqual((await signIn('owner@gec.test', 'SecondPass12345')).headers.location, '/staff', 'not overwritten without ADMIN_RESET');
  await knex('users').where({ email: 'owner@gec.test' }).update({ locked_until: new Date(Date.now() + 3600_000), failed_logins: 4 });
  config.bootstrapAdmin.reset = true;
  await bootstrap.run();
  assert.equal((await signIn('owner@gec.test', 'SecondPass12345')).headers.location, '/staff', 'reset + unlocked');
  assert.ok(await knex('audit_logs').where({ action: 'auth.admin_reset_at_startup' }).first());
  Object.assign(config.bootstrapAdmin, { email: '', password: '', reset: false });
});
