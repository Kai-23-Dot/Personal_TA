import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getOrCreateCustomer: vi.fn(),
  listSubscriptions: vi.fn(),
  createCheckout: vi.fn(),
  createPortal: vi.fn(),
}));

vi.mock("@/backend/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/backend/billing/stripe", () => ({
  stripe: {
    subscriptions: { list: mocks.listSubscriptions },
    checkout: { sessions: { create: mocks.createCheckout } },
    billingPortal: { sessions: { create: mocks.createPortal } },
  },
  getConfiguredPlanPrices: () => ({
    plus: "price_plus",
    pro: "price_pro",
    max: "price_max",
  }),
  getPriceIdForPlan: (plan: "plus" | "pro" | "max") => `price_${plan}`,
  TERMINAL_SUBSCRIPTION_STATUSES: new Set([
    "canceled",
    "incomplete_expired",
  ]),
  appUrl: () => "https://smartlearn.example",
  getPortalConfigurationId: () => undefined,
  getOrCreateCustomer: mocks.getOrCreateCustomer,
  stripeIdempotencyKey: (
    operation: string,
    userId: string,
    priceId?: string
  ) => ["smartlearn", operation, userId, priceId].filter(Boolean).join(":"),
}));

import { POST } from "@/app/api/billing/checkout/route";

function checkoutRequest(plan = "pro") {
  return new Request("https://smartlearn.example/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

describe("billing Checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "student@example.com" } },
    });
    mocks.getOrCreateCustomer.mockResolvedValue("cus_1");
    mocks.listSubscriptions.mockResolvedValue({ data: [] });
    mocks.createCheckout.mockResolvedValue({
      url: "https://checkout.stripe.test/session",
    });
    mocks.createPortal.mockResolvedValue({
      url: "https://billing.stripe.test/session",
    });
  });

  it("requires an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(401);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("creates one metadata-linked, idempotent Pro Checkout session", async () => {
    const response = await POST(checkoutRequest("plus"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      url: "https://checkout.stripe.test/session",
      destination: "checkout",
    });
    expect(mocks.createCheckout).toHaveBeenCalledTimes(1);
    const [params, options] = mocks.createCheckout.mock.calls[0];
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      client_reference_id: "user-1",
      line_items: [{ price: "price_plus", quantity: 1 }],
      metadata: { supabase_user_id: "user-1", plan: "plus" },
      subscription_data: {
        metadata: { supabase_user_id: "user-1", plan: "plus" },
      },
    });
    expect(options).toEqual({
      idempotencyKey: "smartlearn:checkout:user-1:price_plus",
    });
  });

  it("opens the portal instead of creating a duplicate subscription", async () => {
    mocks.listSubscriptions.mockResolvedValue({
      data: [
        {
          id: "sub_1",
          status: "past_due",
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      ],
    });

    const response = await POST(checkoutRequest());
    const body = await response.json();

    expect(body.destination).toBe("portal");
    expect(body.url).toContain("billing.stripe.test");
    expect(mocks.createPortal).toHaveBeenCalledTimes(1);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("allows a fresh Checkout after a terminal subscription", async () => {
    mocks.listSubscriptions.mockResolvedValue({
      data: [
        {
          id: "sub_old",
          status: "canceled",
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      ],
    });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });
});
