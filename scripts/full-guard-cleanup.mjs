// Cleanup: delete the FULL-GUARD smoke users (fg<stamp>-*@t.test)
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const stamp = process.argv[2];
if (!stamp) { console.error('usage: node full-guard-cleanup.mjs <stamp>'); process.exit(1); }
const env = fs.readFileSync('/home/z/my-project/uuu-smm-fresh/.env', 'utf-8');
const url = env.match(/DATABASE_URL="([^"]+)"/)?.[1] || env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const db = new PrismaClient({ datasources: { db: { url } } });

const users = await db.user.findMany({ where: { email: { contains: `${stamp}-` } }, select: { id: true, email: true } });
console.log('smoke users:', users.map(u => u.email));
for (const u of users) {
  const evs = await db.smmEvent.findMany({ where: { customerId: u.id }, select: { id: true } });
  for (const e of evs) {
    await db.smmInvitation.deleteMany({ where: { eventId: e.id } });
    await db.smmApplication.deleteMany({ where: { eventId: e.id } });
  }
  await db.smmEvent.deleteMany({ where: { customerId: u.id } });
  await db.smmInvitation.deleteMany({ where: { OR: [{ customerId: u.id }, { specialistId: u.id }] } });
  await db.smmApplication.deleteMany({ where: { specialistId: u.id } });
  await db.smmPost.deleteMany({ where: { specialistId: u.id } });
  await db.smmRole.updateMany({ where: { ownerId: u.id }, data: { ownerId: null } });
  await db.smmBookmark.deleteMany({ where: { userId: u.id } });
  await db.smmChatMessage.deleteMany({ where: { userId: u.id } });
  await db.session.deleteMany({ where: { userId: u.id } });
  try { await db.user.delete({ where: { id: u.id } }); console.log('deleted', u.email); }
  catch (e) { console.log('skip', u.email, e.message?.slice(0, 120)); }
}
const left = await db.user.findMany({ where: { email: { contains: `${stamp}-` } }, select: { id: true } });
console.log('remaining:', left.length);
await db.$disconnect();
