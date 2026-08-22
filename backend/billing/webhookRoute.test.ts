import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  return {
    constructEvent: vi.fn(),
    listSubscriptions: vi.fn(),
    resolveEntitlement: vi.fn(),
    sendPlanChangeNotification: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    ledgerProcessed: false,
  };
});

vi.mock("@/backend/billing/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: mocks.constructEvent },
    subscriptions: { list: mocks.listSubscriptions },
  },
  getConfiguredPlanPrices: () => ({
    plus: "price_plus",
    pro: "price_pro",
    max: "price_max",
  }),
  resolveSubscriptionEntitlement: mocks.resolveEntitlement,
}));

vi.mock("@/backend/email/planChange", () => ({
  sendPlanChangeNotification: mocks.sendPlanChangeNotification,
}));

vi.mock("@/backend/supabase/server", () => ({
  createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { POST } from "@/app/api/billing/webhook/route";

function chain(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

function webhookRequest() {
  return new Request("https://smartlearn.example/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "signature" },
    body: "signed-body",
  });
}

function checkoutEvent(id: string) {
  return {
    id,
    type: "checkout.session.completed",
    created: 1_750_000_000,
    data: { object: { customer: "cus_123" } },
  };
}

describe("billing webhook plan-change email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ledgerProcessed = false;
    mocks.constructEvent.mockImplementation(() => checkoutEvent("evt_123"));
    mocks.from.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") {
        return chain(mocks.ledgerProcessed ? { event_id: "evt_123" } : null);
      }
      if (table === "profiles") return chain({ id: "user_123" });
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.listSubscriptions.mockResolvedValue({ data: [], has_more: false });
    mocks.resolveEntitlement.mockReturnValue({
      plan: "plus",
      subscriptionId: "sub_123",
      status: "active",
      currentPeriodEnd: 1_752_592_000,
    });
    mocks.rpc.mockResolvedValue({ data: "processed", error: null });
    mocks.sendPlanChangeNotification.mockResolvedValue("sent");
  });

  it("delivers the queued message after reconciling a plan change", async () => {
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      received: true,
      result: "processed",
      email: "sent",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription",
      expect.objectContaining({
        p_event_id: "evt_123",
        p_customer_id: "cus_123",
        p_plan: "plus",
      })
    );
    expect(mocks.sendPlanChangeNotification).toHaveBeenCalledWith("evt_123");
  });

  it("retries an unsent message when Stripe repeats a processed event", async () => {
    mocks.ledgerProcessed = true;
    mocks.sendPlanChangeNotification.mockResolvedValue("already_sent");

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      received: true,
      duplicate: true,
      email: "already_sent",
    });
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sendPlanChangeNotification).toHaveBeenCalledWith("evt_123");
  });
});
