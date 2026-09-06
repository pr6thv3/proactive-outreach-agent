import { db } from '../lib/db';

async function main() {
  const org = await db.organization.create({
    data: { name: 'FK Test Org' }
  });
  console.log('Org created:', org.id);

  const event = await db.emailEvent.create({
    data: {
      organizationId: org.id,
      recipient: 'test@example.com',
      eventType: 'delivered',
    }
  });
  console.log('EmailEvent created:', event.id);

  await db.emailEvent.delete({ where: { id: event.id } });
  await db.organization.delete({ where: { id: org.id } });
  console.log('Cleaned up');
}

main().catch(console.error);
