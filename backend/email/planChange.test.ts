import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  appUrl: vi.fn(() => "https://smartlearn.example"),
}));

vi.mock("@/backend/supabase/server", () => ({
  createServiceClient: () => ({ from: mocks.from }),
}));

vi.mock("@/backend/billing/stripe", () => ({
  appUrl: mocks.appUrl,
}));

import {
  renderPlanChangeEmail,
  sendPlanChangeNotification,
} from "./planChange";

function notificationQuery(data: Record<string, unknown> | null) {
  const query = {
    error: null,
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe("plan-change emails", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.from.mockReset();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Smartlearn <billing@smartlearn.example>";
    delete process.env.RESEND_REPLY_TO;
  });

  it("renders a branded upgrade email with the new allowance", () => {
    const email = renderPlanChangeEmail({
      recipientName: "<Ava> Student",
      previousPlan: "free",
      newPlan: "plus",
      settingsUrl: "https://smartlearn.example/settings",
    });

    expect(email.subject).toContain("welcome to Smartlearn Plus");
    expect(email.html).toContain("Upgrade confirmed");
    expect(email.html).toContain("&lt;Ava&gt;");
    expect(email.html).toContain("600");
    expect(email.html).toContain("$4.99 / month");
    expect(email.text).toContain("Previous plan: Free");
    expect(email.text).toContain("New plan: Plus");
  });

  it("renders a clear downgrade confirmation", () => {
    const email = renderPlanChangeEmail({
      recipientName: null,
      previousPlan: "max",
      newPlan: "pro",
      settingsUrl: "https://smartlearn.example/settings",
    });

    expect(email.subject).toBe(
      "Downgrade confirmed — you’re now on Smartlearn Pro"
    );
    expect(email.html).toContain("Downgrade confirmed");
    expect(email.html).toContain("Your downgrade to Pro is confirmed");
    expect(email.text).toContain("Hi there,");
  });

  it("sends through Resend with a retry-safe Stripe event key", async () => {
    const query = notificationQuery({
      event_id: "evt_123",
      recipient_email: "student@example.com",
      recipient_name: "Ava Student",
      previous_plan: "plus",
      new_plan: "pro",
      attempt_count: 0,
      sent_at: null,
    });
    mocks.from.mockReturnValue(query);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(sendPlanChangeNotification("evt_123")).resolves.toBe("sent");

    const [, request] = fetchMock.mock.calls[0];
    expect(request?.headers).toMatchObject({
      "Idempotency-Key": "smartlearn-plan-change/evt_123",
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: "Smartlearn <billing@smartlearn.example>",
      to: ["student@example.com"],
      subject: "Upgrade confirmed — welcome to Smartlearn Pro",
    });
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ provider_message_id: "email_123" })
    );
  });

  it("does nothing when an event has no plan transition", async () => {
    const query = notificationQuery(null);
    mocks.from.mockReturnValue(query);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(sendPlanChangeNotification("evt_same_plan")).resolves.toBe(
      "not_pending"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
