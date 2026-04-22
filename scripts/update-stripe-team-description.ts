import { getUncachableStripeClient } from '../server/stripeClient';

const NEW_DESCRIPTION =
  'Team plan for Allotly — AI Spend Control Plane. $20 per Admin Seat per month. Each Admin Seat includes up to 20 team members and 5 active vouchers, where each voucher can be redeemed by up to 50 different users. Scale up to 10 Admin Seats. Includes 4 AI Provider connections, 90-day retention, full audit log, and budget controls.';

async function main() {
  const stripe = await getUncachableStripeClient();

  // List all active products and pick the Team plan by name or metadata
  const all = await stripe.products.list({ limit: 100, active: true });
  console.log(`Scanning ${all.data.length} active products...`);

  const candidates = all.data.filter(
    (p) =>
      p.metadata?.plan === 'TEAM' ||
      /Allotly Team/i.test(p.name) ||
      /Team Plan/i.test(p.name)
  );

  if (!candidates.length) {
    console.error('No Team-plan product found. All product names:');
    for (const p of all.data) console.error(`  - ${p.id}  ${p.name}  metadata=${JSON.stringify(p.metadata)}`);
    process.exit(1);
  }

  for (const p of candidates) {
    const prevDesc = p.description || '(none)';
    console.log(`\nProduct: ${p.id}  ${p.name}`);
    console.log(`  metadata: ${JSON.stringify(p.metadata)}`);
    if (prevDesc === NEW_DESCRIPTION) {
      console.log('  Already up-to-date — skipping.');
      continue;
    }
    const updated = await stripe.products.update(p.id, { description: NEW_DESCRIPTION });
    console.log(`  Before: ${prevDesc}`);
    console.log(`  After:  ${updated.description}`);
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Update failed:', e);
  process.exit(1);
});
