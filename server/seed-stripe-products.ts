import { getUncachableStripeClient } from './stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.search({ query: "name:'Allotly'" });
  if (existingProducts.data.length > 0) {
    console.log('Products already exist, skipping seed');
    for (const p of existingProducts.data) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      console.log(`  ${p.name} (${p.id})`);
      for (const pr of prices.data) {
        console.log(`    Price: ${pr.id} - $${(pr.unit_amount || 0) / 100} ${pr.recurring ? pr.recurring.interval : 'one-time'}`);
      }
    }
    return;
  }

  console.log('Creating Allotly Team Plan product...');
  const teamProduct = await stripe.products.create({
    name: 'Allotly Team Plan',
    description: 'Team plan for Allotly - AI Spend Control Plane. Includes up to 10 Team Admins, 20 members per team, 3 AI Provider connections, 15-minute usage polling, 90-day retention, and more.',
    metadata: {
      type: 'subscription',
      plan: 'TEAM',
    },
  });

  const teamPrice = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 2000,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { plan: 'TEAM' },
  });

  console.log(`  Team Plan: ${teamProduct.id}, Price: ${teamPrice.id} ($20/mo)`);

  console.log('Creating Allotly Voucher Bundle product...');
  const bundleProduct = await stripe.products.create({
    name: 'Allotly Voucher Bundle',
    description: '$10 Voucher Bundle - 50 voucher redemptions pooled across up to 10 codes, 25,000 proxy requests, $50 max budget per recipient, 30-day validity.',
    metadata: {
      type: 'bundle',
      redemptions: '50',
      proxyRequests: '25000',
      maxBudgetPerRecipientCents: '5000',
      maxCodesPerBundle: '10',
      validityDays: '30',
    },
  });

  const bundlePrice = await stripe.prices.create({
    product: bundleProduct.id,
    unit_amount: 1000,
    currency: 'usd',
    metadata: { type: 'bundle' },
  });

  console.log(`  Voucher Bundle: ${bundleProduct.id}, Price: ${bundlePrice.id} ($10)`);
  console.log('Stripe products seeded successfully!');
}

seedProducts().catch(console.error);
