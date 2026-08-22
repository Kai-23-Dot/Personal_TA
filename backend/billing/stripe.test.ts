import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  resolveSubscriptionEntitlement,
  stripeIdempotencyKey,
  subscriptionHasPrice,
  subscriptionPeriodEnd,
} from "./stripe";

function subscription({
  id,
  status,
  created,
  priceId = "price_pro",
  periodEnd,
}: {
  id: string;
  status: Stripe.Subscription.Status;
  created: number;
  priceId?: string;
  periodEnd: number;
}): Stripe.Subscription {
  return {
    id,
    status,
    created,
    items: {
      data: [
        {
          price: { id: priceId },
          current_period_end: periodEnd,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe("Stripe billing helpers", () => {
  const prices = {
    plus: "price_plus",
    pro: "price_pro",
    max: "price_max",
  } as const;

  it("uses stable, operation-scoped idempotency keys", () => {
    expect(stripeIdempotencyKey("customer", "user-1")).toBe(
      "smartlearn:customer:user-1"
    );
    expect(stripeIdempotencyKey("checkout", "user-1", "price_pro")).toBe(
      "smartlearn:checkout:user-1:price_pro"
    );
  });

  it("matches the configured price and reads item-level period dates", () => {
    const sub = {
      ...subscription({
        id: "sub_1",
        status: "active",
        created: 10,
        periodEnd: 100,
      }),
      items: {
        data: [
          { price: { id: "price_pro" }, current_period_end: 100 },
          { price: { id: "price_pro" }, current_period_end: 200 },
        ],
      },
    } as Stripe.Subscription;

    expect(subscriptionHasPrice(sub, "price_pro")).toBe(true);
    expect(subscriptionPeriodEnd(sub, "price_pro")).toBe(200);
    expect(subscriptionPeriodEnd(sub, "price_other")).toBeNull();
  });

  it("never grants Pro for an unrelated Stripe price", () => {
    const entitlement = resolveSubscriptionEntitlement(
      [
        subscription({
          id: "sub_other",
          status: "active",
          created: 10,
          priceId: "price_other",
          periodEnd: 200,
        }),
      ],
      prices
    );

    expect(entitlement).toEqual({
      plan: "free",
      subscriptionId: null,
      status: null,
      currentPeriodEnd: null,
    });
  });

  it("keeps Pro when an older duplicate is canceled but another is active", () => {
    const entitlement = resolveSubscriptionEntitlement(
      [
        subscription({
          id: "sub_canceled",
          status: "canceled",
          created: 30,
          periodEnd: 300,
        }),
        subscription({
          id: "sub_active",
          status: "active",
          created: 20,
          periodEnd: 400,
        }),
      ],
      prices
    );

    expect(entitlement).toEqual({
      plan: "pro",
      subscriptionId: "sub_active",
      status: "active",
      currentPeriodEnd: 400,
    });
  });

  it("grants trials and revokes access for terminal subscriptions", () => {
    const trial = subscription({
      id: "sub_trial",
      status: "trialing",
      created: 20,
      periodEnd: 500,
    });
    expect(resolveSubscriptionEntitlement([trial], prices).plan).toBe(
      "pro"
    );

    const canceled = subscription({
      id: "sub_canceled",
      status: "canceled",
      created: 30,
      periodEnd: 600,
    });
    expect(
      resolveSubscriptionEntitlement([canceled], prices)
    ).toMatchObject({
      plan: "free",
      subscriptionId: "sub_canceled",
      status: "canceled",
    });
  });

  it("selects the highest active configured tier", () => {
    const entitlement = resolveSubscriptionEntitlement(
      [
        subscription({
          id: "sub_plus",
          status: "active",
          created: 30,
          priceId: "price_plus",
          periodEnd: 500,
        }),
        subscription({
          id: "sub_max",
          status: "active",
          created: 10,
          priceId: "price_max",
          periodEnd: 400,
        }),
      ],
      prices
    );

    expect(entitlement).toMatchObject({
      plan: "max",
      subscriptionId: "sub_max",
      status: "active",
    });
  });
});
