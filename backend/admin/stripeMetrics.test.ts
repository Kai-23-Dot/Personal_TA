import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { aggregateBalanceTransactions, monthlyRecurringAmount } from "./stripeMetrics";

function transaction(overrides: Partial<Stripe.BalanceTransaction>): Stripe.BalanceTransaction {
  return {
    id: "txn_test",
    object: "balance_transaction",
    amount: 0,
    available_on: 0,
    created: 0,
    currency: "usd",
    description: null,
    exchange_rate: null,
    fee: 0,
    fee_details: [],
    net: 0,
    reporting_category: "charge",
    source: null,
    status: "available",
    type: "charge",
    ...overrides,
  } as Stripe.BalanceTransaction;
}

describe("admin Stripe aggregation", () => {
  it("separates gross volume, refunds, fees, and net receipts", () => {
    const result = aggregateBalanceTransactions([
      transaction({ amount: 2_000, fee: 88, net: 1_912, reporting_category: "charge" }),
      transaction({ amount: -500, fee: 0, net: -500, reporting_category: "refund", type: "refund" }),
      transaction({ amount: -250, fee: 15, net: -265, reporting_category: "dispute", type: "adjustment" }),
      transaction({ amount: -1_000, fee: 0, net: -1_000, reporting_category: "payout", type: "payout" }),
    ]);

    expect(result).toMatchObject({
      grossVolumeCents: 2_000,
      refundsCents: 500,
      disputesCents: 250,
      feesCents: 103,
      netVolumeCents: 1_147,
    });
  });

  it("normalizes annual recurring prices into monthly revenue", () => {
    const subscription = {
      items: {
        data: [{ quantity: 2, price: { unit_amount: 12_000, recurring: { interval: "year", interval_count: 1 } } }],
      },
    } as unknown as Stripe.Subscription;
    expect(monthlyRecurringAmount(subscription)).toBe(2_000);
  });
});
