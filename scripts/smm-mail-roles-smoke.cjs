// SMM MAIL + ROLES smoke — exercises every NEW endpoint of this change
// against the local standalone server (Neon uuu_smm):
//   my-roles · shared-roles CRUD+use · invitation/application edit+withdraw
//   shared-role chat · ownership guards · isolation · full cleanup.
// Usage: node scripts/smm-mail-roles-smoke.cjs <port>
const BASE = `http://localhost:${process.argv[2] || '3210'}`;
const EMAIL_TAG = Date.now();
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

async function req(method, path, { body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

async function register(name, role) {
  const email = `smoke-mr-${role}-${EMAIL_TAG}@test.local`;
  const r = await req('POST', '/api/auth/register', { body: { name, email, password: 'smoke-pass-123', smmRole: role } });
  if (r.status !== 201) throw new Error(`register ${role} failed: ${r.status} ${JSON.stringify(r.data)}`);
  const login = await req('POST', '/api/auth/login', { body: { email, password: 'smoke-pass-123' } });
  const cookie = (login.setCookie || '').split(';')[0];
  return { email, cookie, id: r.data.id, name };
}

async function main() {
  console.log('— setup: two accounts —');
  const customer = await register('Smoke MR Customer', 'customer');
  const specialist = await register('Smoke MR Specialist', 'specialist');
  ok(customer.cookie && specialist.cookie, 'registered customer + specialist');

  console.log('— customer: event with role —');
  const ev = await req('POST', '/api/smm/events', { cookie: customer.cookie, body: { title: `MR Event ${EMAIL_TAG}`, summary: 'smoke', kind: 'business', isPublic: true, roles: [{ name: 'Smoke Role A', brief: 'ТЗ A', payment: '100$', deadline: 'декабрь' }] } });
  ok(ev.status === 201 && ev.data?.roles?.length === 1, 'event created with role');
  const eventId = ev.data.id;
  const roleId = ev.data.roles[0].id;
  const ev2 = await req('POST', '/api/smm/events', { cookie: customer.cookie, body: { title: `MR Event 2 ${EMAIL_TAG}`, summary: 'smoke2', kind: 'business', isPublic: true } });
  const eventId2 = ev2.data.id;

  console.log('— GET /api/smm/my-roles —');
  const my = await req('GET', '/api/smm/my-roles', { cookie: customer.cookie });
  ok(my.status === 200 && Array.isArray(my.data) && my.data.some(r => r.id === roleId), 'my-roles lists the role');
  const myRole = my.data.find(r => r.id === roleId);
  ok(myRole?.event?.id === eventId && myRole?.sharedRoleId === null, 'my-roles carries event context + sharedRoleId null');
  const myForeign = await req('GET', '/api/smm/my-roles', { cookie: specialist.cookie });
  ok(myForeign.status === 200 && myForeign.data.length === 0, 'specialist sees no customer roles');

  console.log('— publish role → shared-roles (upsert) —');
  const pub = await req('POST', '/api/smm/shared-roles', { cookie: customer.cookie, body: { sourceRoleId: roleId } });
  ok(pub.status === 201 && pub.data?.sourceRoleId === roleId, 'published from event role');
  const pubAgain = await req('POST', '/api/smm/shared-roles', { cookie: customer.cookie, body: { sourceRoleId: roleId } });
  ok(pubAgain.status === 201 && pubAgain.data?.id === pub.data.id, 'republish updates the SAME template (no dup)');
  const myAfterPub = await req('GET', '/api/smm/my-roles', { cookie: customer.cookie });
  ok(myAfterPub.data.find(r => r.id === roleId)?.sharedRoleId === pub.data.id, 'my-roles now links sharedRoleId');

  const foreignPub = await req('POST', '/api/smm/shared-roles', { cookie: specialist.cookie, body: { sourceRoleId: roleId } });
  ok(foreignPub.status === 403, 'foreigner cannot publish someone else\'s role');

  console.log('— shared-roles list / ownership —');
  const listC = await req('GET', '/api/smm/shared-roles', { cookie: customer.cookie });
  ok(listC.status === 200 && listC.data.some(x => x.id === pub.data.id && x.isOwn), 'owner sees isOwn=true');
  const listS = await req('GET', '/api/smm/shared-roles', { cookie: specialist.cookie });
  ok(listS.data.find(x => x.id === pub.data.id)?.isOwn === false, 'specialist sees isOwn=false');

  const updForeign = await req('PUT', `/api/smm/shared-roles/${pub.data.id}`, { cookie: specialist.cookie, body: { name: 'hacked' } });
  ok(updForeign.status === 403, 'foreign PUT template → 403');
  const updOwn = await req('PUT', `/api/smm/shared-roles/${pub.data.id}`, { cookie: customer.cookie, body: { brief: 'ТЗ A (обновлено)' } });
  ok(updOwn.status === 200 && updOwn.data?.brief === 'ТЗ A (обновлено)', 'owner PUT template ok');

  console.log('— use template into MY event —');
  const useForeign = await req('POST', `/api/smm/shared-roles/${pub.data.id}/use`, { cookie: specialist.cookie, body: { eventId } });
  ok(useForeign.status === 403, 'specialist (no events) use → 403');
  const useOwn = await req('POST', `/api/smm/shared-roles/${pub.data.id}/use`, { cookie: customer.cookie, body: { eventId: eventId2 } });
  ok(useOwn.status === 201 && useOwn.data?.name === 'Smoke Role A' && useOwn.data?.eventId === eventId2, 'customer copies template into own event');

  console.log('— standalone template CRUD —');
  const standalone = await req('POST', '/api/smm/shared-roles', { cookie: specialist.cookie, body: { name: 'Standalone ТЗ', brief: 'шаблон', payment: '50$' } });
  ok(standalone.status === 201 && standalone.data?.author?.name === 'Smoke MR Specialist', 'specialist creates standalone template');
  const noName = await req('POST', '/api/smm/shared-roles', { cookie: specialist.cookie, body: { brief: 'no name' } });
  ok(noName.status === 400 || noName.status === 422, 'create without name/sourceRoleId → rejected');

  console.log('— mail: invitation edit + withdraw —');
  const inv = await req('POST', '/api/smm/invitations', { cookie: customer.cookie, body: { eventId, roleId, specialistId: specialist.id, message: 'первый текст' } });
  ok(inv.status === 201, 'invitation created');
  const invEditForeign = await req('PUT', `/api/smm/invitations/${inv.data.id}`, { cookie: specialist.cookie, body: { message: 'x' } });
  ok(invEditForeign.status === 403, 'not-your-invitation PUT → 403');
  const invEdit = await req('PUT', `/api/smm/invitations/${inv.data.id}`, { cookie: customer.cookie, body: { message: 'изменённый текст' } });
  ok(invEdit.status === 200 && invEdit.data?.message === 'изменённый текст', 'owner edits pending invitation message');
  const invListS = await req('GET', '/api/smm/invitations?box=inbox', { cookie: specialist.cookie });
  ok(invListS.data.some(i => i.id === inv.data.id && i.message === 'изменённый текст'), 'specialist inbox sees the edit');
  const invWithdraw = await req('DELETE', `/api/smm/invitations/${inv.data.id}`, { cookie: customer.cookie });
  ok(invWithdraw.status === 200, 'owner withdraws pending invitation');
  const invGone = await req('GET', '/api/smm/invitations?box=inbox', { cookie: specialist.cookie });
  ok(!invGone.data.some(i => i.id === inv.data.id), 'withdrawn invitation gone from inbox');

  console.log('— mail: application edit + withdraw —');
  const app = await req('POST', '/api/smm/applications', { cookie: specialist.cookie, body: { eventId, roleId, message: 'заявка v1' } });
  ok(app.status === 201, 'application created');
  const appEdit = await req('PUT', `/api/smm/applications/${app.data.id}`, { cookie: specialist.cookie, body: { message: 'заявка v2' } });
  ok(appEdit.status === 200 && appEdit.data?.message === 'заявка v2', 'specialist edits own pending application');
  const appInbox = await req('GET', '/api/smm/applications?box=inbox', { cookie: customer.cookie });
  ok(appInbox.data.some(a => a.id === app.data.id && a.message === 'заявка v2'), 'customer inbox sees the edit');
  const appWithdraw = await req('DELETE', `/api/smm/applications/${app.data.id}`, { cookie: specialist.cookie });
  ok(appWithdraw.status === 200, 'specialist withdraws pending application');
  const appGone = await req('GET', '/api/smm/applications?box=inbox', { cookie: customer.cookie });
  ok(!appGone.data.some(a => a.id === app.data.id), 'withdrawn application gone from customer inbox');

  console.log('— shared-role chat —');
  const chatGet = await req('GET', `/api/smm/chat?scopeType=shared-role&scopeId=${pub.data.id}`, { cookie: customer.cookie });
  ok(chatGet.status === 200 && Array.isArray(chatGet.data), 'GET shared-role chat ok');
  const chatPost = await req('POST', '/api/smm/chat', { cookie: specialist.cookie, body: { scopeType: 'shared-role', scopeId: pub.data.id, text: 'вопрос по шаблону' } });
  ok(chatPost.status === 201 && chatPost.data?.scopeType === 'shared-role', 'POST into shared-role chat ok');

  console.log('— unpublish + cleanup —');
  const unpub = await req('DELETE', `/api/smm/shared-roles/${pub.data.id}`, { cookie: customer.cookie });
  ok(unpub.status === 200, 'unpublish own template');
  const myAfterUnpub = await req('GET', '/api/smm/my-roles', { cookie: customer.cookie });
  ok(myAfterUnpub.data.find(r => r.id === roleId)?.sharedRoleId === null, 'my-roles sharedRoleId cleared');
  const unpubForeign = await req('DELETE', `/api/smm/shared-roles/${standalone.data.id}`, { cookie: customer.cookie });
  ok(unpubForeign.status === 403, 'foreign DELETE template → 403');
  const delStandalone = await req('DELETE', `/api/smm/shared-roles/${standalone.data.id}`, { cookie: specialist.cookie });
  ok(delStandalone.status === 200, 'author deletes standalone template');

  // cascade: delete events (kills roles), then both accounts
  await req('DELETE', `/api/smm/events/${eventId}`, { cookie: customer.cookie });
  await req('DELETE', `/api/smm/events/${eventId2}`, { cookie: customer.cookie });
  const myEmpty = await req('GET', '/api/smm/my-roles', { cookie: customer.cookie });
  ok(myEmpty.status === 200 && myEmpty.data.length === 0, 'my-roles empty after event cascade');
  await req('DELETE', '/api/me', { cookie: customer.cookie });
  await req('DELETE', '/api/me', { cookie: specialist.cookie });
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
