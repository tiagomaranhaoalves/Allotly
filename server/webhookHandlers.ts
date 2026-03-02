import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { sendEmail, emailTemplates } from './lib/email';
import { redisSet, REDIS_KEYS } from './lib/redis';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    const stripe = await getUncachableStripeClient();
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: any;
    try {
      if (endpointSecret) {
        event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
      } else {
        event = JSON.parse(payload.toString());
      }
    } catch (e: any) {
      console.log('[webhook] Could not parse event for custom handling, sync-only:', e.message);
      return;
    }

    try {
      await WebhookHandlers.handleEvent(event);
    } catch (e: any) {
      console.error(`[webhook] Error handling ${event.type}:`, e.message);
    }
  }

  static async handleEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await WebhookHandlers.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await WebhookHandlers.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await WebhookHandlers.handlePaymentFailed(event.data.object);
        break;
    }
  }

  static async handleCheckoutCompleted(session: any): Promise<void> {
    const orgId = session.metadata?.orgId;
    if (!orgId) return;

    const org = await storage.getOrganization(orgId);
    if (!org) return;

    if (session.mode === 'subscription') {
      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: session.customer,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const sub = subscriptions.data[0];
        const quantity = sub.items?.data?.[0]?.quantity || 1;

        await storage.updateOrganization(orgId, {
          plan: "TEAM",
          stripeSubId: sub.id,
          maxTeamAdmins: Math.max(quantity, 1),
          graceEndsAt: null,
        });

        await storage.createAuditLog({
          orgId,
          actorId: session.metadata?.userId || "system",
          action: "plan.upgraded",
          targetType: "organization",
          targetId: orgId,
          metadata: { plan: "TEAM", seats: quantity },
        });

        console.log(`[webhook] Org ${orgId} upgraded to TEAM with ${quantity} seats`);
      }
    } else if (session.mode === 'payment' && session.metadata?.type === 'voucher_bundle') {
      const piId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

      if (!piId) return;

      const existingBundles = await storage.getVoucherBundlesByOrg(orgId);
      if (existingBundles.some(b => b.stripePaymentIntentId === piId)) return;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const BUNDLE_LIMITS = {
        pooledRedemptions: 50,
        totalProxyRequests: 25000,
        maxBudgetPerVoucherCents: 10000,
        maxBudgetPerRecipientCents: 5000,
      };

      const bundle = await storage.createVoucherBundle({
        orgId,
        purchasedById: session.metadata?.userId || "system",
        stripePaymentIntentId: piId,
        totalRedemptions: BUNDLE_LIMITS.pooledRedemptions,
        usedRedemptions: 0,
        totalProxyRequests: BUNDLE_LIMITS.totalProxyRequests,
        usedProxyRequests: 0,
        maxBudgetPerVoucherCents: BUNDLE_LIMITS.maxBudgetPerVoucherCents,
        maxBudgetPerRecipientCents: BUNDLE_LIMITS.maxBudgetPerRecipientCents,
        expiresAt,
        status: "ACTIVE",
      });

      await redisSet(REDIS_KEYS.bundleRequests(bundle.id), String(BUNDLE_LIMITS.totalProxyRequests));
      await redisSet(REDIS_KEYS.bundleRedemptions(bundle.id), String(BUNDLE_LIMITS.pooledRedemptions));

      await storage.createAuditLog({
        orgId,
        actorId: session.metadata?.userId || "system",
        action: "bundle.purchased",
        targetType: "voucher_bundle",
        targetId: bundle.id,
        metadata: { redemptions: BUNDLE_LIMITS.pooledRedemptions },
      });

      if (session.metadata?.userId) {
        const buyer = await storage.getUser(session.metadata.userId);
        if (buyer) {
          const tmpl = emailTemplates.bundlePurchased(
            buyer.name || buyer.email,
            BUNDLE_LIMITS.pooledRedemptions,
            expiresAt.toLocaleDateString(),
            "/dashboard/bundles"
          );
          await sendEmail(buyer.email, tmpl.subject, tmpl.html);
        }
      }

      console.log(`[webhook] Bundle created for org ${orgId}: ${bundle.id}`);
    }
  }

  static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const org = await WebhookHandlers.findOrgByCustomer(subscription.customer);
    if (!org) return;

    const quantity = subscription.items?.data?.[0]?.quantity || 1;
    const previousMaxAdmins = org.maxTeamAdmins;

    await storage.updateOrganization(org.id, {
      maxTeamAdmins: quantity,
      stripeSubId: subscription.id,
    });

    if (quantity < previousMaxAdmins) {
      const allUsers = await storage.getUsersByOrg(org.id);
      const activeAdmins = allUsers
        .filter(u => u.orgRole === "TEAM_ADMIN" && u.status === "ACTIVE")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const excess = activeAdmins.length - quantity;
      if (excess > 0) {
        for (let i = 0; i < excess; i++) {
          await storage.updateUser(activeAdmins[i].id, { status: "SUSPENDED" });
        }
        console.log(`[webhook] Suspended ${excess} excess team admins for org ${org.id}`);
      }
    }

    await storage.createAuditLog({
      orgId: org.id,
      actorId: "system",
      action: "plan.seats_updated",
      targetType: "organization",
      targetId: org.id,
      metadata: { previousSeats: previousMaxAdmins, newSeats: quantity },
    });

    console.log(`[webhook] Org ${org.id} subscription updated: ${quantity} seats`);
  }

  static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const org = await WebhookHandlers.findOrgByCustomer(subscription.customer);
    if (!org) return;

    const graceEndsAt = new Date();
    graceEndsAt.setDate(graceEndsAt.getDate() + 30);

    await storage.updateOrganization(org.id, {
      stripeSubId: null,
      graceEndsAt,
    });

    await storage.createAuditLog({
      orgId: org.id,
      actorId: "system",
      action: "plan.downgraded",
      targetType: "organization",
      targetId: org.id,
      metadata: { note: "30-day grace period started, plan will downgrade to FREE after grace", graceEndsAt: graceEndsAt.toISOString() },
    });

    console.log(`[webhook] Org ${org.id} downgraded to FREE, grace ends ${graceEndsAt.toISOString()}`);
  }

  static async handlePaymentFailed(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const org = await WebhookHandlers.findOrgByCustomer(customerId);
    if (!org) return;

    const graceEndsAt = new Date();
    graceEndsAt.setDate(graceEndsAt.getDate() + 7);

    await storage.updateOrganization(org.id, { graceEndsAt });

    await storage.createAuditLog({
      orgId: org.id,
      actorId: "system",
      action: "billing.payment_failed",
      targetType: "organization",
      targetId: org.id,
      metadata: { invoiceId: invoice.id, graceEndsAt: graceEndsAt.toISOString() },
    });

    const rootAdmins = (await storage.getUsersByOrg(org.id)).filter(
      u => u.orgRole === "ROOT_ADMIN" && u.status === "ACTIVE"
    );
    for (const admin of rootAdmins) {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 20px">
<div style="text-align:center;margin-bottom:32px">
<div style="display:inline-block;background:#6366F1;color:#fff;font-weight:700;font-size:20px;padding:8px 18px;border-radius:8px">allotly</div>
</div>
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
<h2 style="margin:0 0 16px;color:#1e293b;font-size:18px">Payment Failed</h2>
<p style="color:#475569;font-size:14px;line-height:1.6">Hi ${admin.name || admin.email},</p>
<div style="background:#dc262610;border:1px solid #dc262630;border-radius:8px;padding:12px 16px;margin:16px 0">
<p style="margin:0;color:#dc2626;font-size:14px;font-weight:500">Your latest payment could not be processed. Please update your payment method within 7 days to avoid losing Team features.</p>
</div>
<p style="color:#475569;font-size:14px;line-height:1.6">Grace period ends: ${graceEndsAt.toLocaleDateString()}</p>
</div>
</div></body></html>`;
      await sendEmail(admin.email, "⚠️ Payment failed — update your payment method", html);
    }

    console.log(`[webhook] Payment failed for org ${org.id}, 7-day grace set`);
  }

  static async findOrgByCustomer(customerId: string): Promise<any> {
    const allOrgs = await storage.getAllOrganizations();
    return allOrgs.find(o => o.stripeCustomerId === customerId) || null;
  }
}
