import type Stripe from "stripe";
import { getStripe } from "@/backend/billing/stripe";
import type { StripeAdminMetrics, StripeTransactionMetric } from "./types";

const REVENUE_CATEGORIES = new Set([
  "charge",
  "payment",
  "refund",
  "payment_refund",
  "dispute",
  "dispute_reversal",
]);
const PAYMENT_CATEGORIES = new Set(["charge", "payment"]);
const REFUND_CATEGORIES = new Set(["refund", "payment_refund"]);

function category(transaction: Stripe.BalanceTransaction): string {
  return transaction.reporting_category || transaction.type;
}

export function monthlyRecurringAmount(subscription: Stripe.Subscription): number {
  return subscription.items.data.reduce((total, item) => {
    const recurring = item.price.recurring;
    const amount = item.price.unit_amount ?? 0;
    if (!recurring || amount <= 0) return total;
    const quantity = item.quantity ?? 1;
    const intervalCount = Math.max(1, recurring.interval_count);
    const monthlyFactor = recurring.interval === "year"
      ? 1 / (12 * intervalCount)
      : recurring.interval === "week"
      ? 52 / (12 * intervalCount)
      : recurring.interval === "day"
      ? 365 / (12 * intervalCount)
      : 1 / intervalCount;
    return total + amount * quantity * monthlyFactor;
  }, 0);
}

export function aggregateBalanceTransactions(
  transactions: Stripe.BalanceTransaction[],
  currency = "usd"
) {
  let grossVolumeCents = 0;
  let refundsCents = 0;
  let disputesCents = 0;
  let feesCents = 0;
  let netVolumeCents = 0;
  const additionalCurrencies = new Set<string>();

  for (const transaction of transactions) {
    const transactionCurrency = transaction.currency.toLowerCase();
    if (transactionCurrency !== currency) {
      additionalCurrencies.add(transactionCurrency.toUpperCase());
      continue;
    }
    const reportingCategory = category(transaction);
    if (!REVENUE_CATEGORIES.has(reportingCategory)) continue;

    if (PAYMENT_CATEGORIES.has(reportingCategory) && transaction.amount > 0) {
      grossVolumeCents += transaction.amount;
    }
    if (REFUND_CATEGORIES.has(reportingCategory) || transaction.type === "refund") {
      refundsCents += Math.abs(transaction.amount);
    }
    if (reportingCategory === "dispute") disputesCents += Math.abs(transaction.amount);
    feesCents += transaction.fee;
    netVolumeCents += transaction.net;
  }

  return {
    grossVolumeCents,
    refundsCents,
    disputesCents,
    feesCents,
    netVolumeCents,
    additionalCurrencies: [...additionalCurrencies].sort(),
  };
}

async function listBalanceTransactions(startTime: number, endTime: number) {
  const stripe = getStripe();
  const transactions: Stripe.BalanceTransaction[] = [];
  let startingAfter: string | undefined;

  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const page = await stripe.balanceTransactions.list({
      created: { gte: startTime, lt: endTime },
      limit: 100,
      starting_after: startingAfter,
    });
    transactions.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data.at(-1)?.id;
  }
  return transactions;
}

async function listSubscriptions() {
  const stripe = getStripe();
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;

  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const page = await stripe.subscriptions.list({
      status: "all",
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.items.data.price"],
    });
    subscriptions.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data.at(-1)?.id;
  }
  return subscriptions;
}

function balanceForCurrency(
  balances: Array<{ amount: number; currency: string }>,
  currency: string
) {
  return balances
    .filter((balance) => balance.currency.toLowerCase() === currency)
    .reduce((total, balance) => total + balance.amount, 0);
}

const EMPTY: StripeAdminMetrics = {
  configured: false,
  error: null,
  currency: null,
  grossVolumeCents: null,
  refundsCents: null,
  disputesCents: null,
  feesCents: null,
  netVolumeCents: null,
  mrrCents: null,
  availableBalanceCents: null,
  pendingBalanceCents: null,
  activeSubscriptions: null,
  trialingSubscriptions: null,
  pastDueSubscriptions: null,
  canceledSubscriptions: null,
  recentTransactions: [],
  additionalCurrencies: [],
};

export async function getStripeAdminMetrics({
  startTime,
  endTime,
}: {
  startTime: number;
  endTime: number;
}): Promise<StripeAdminMetrics> {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return EMPTY;

  try {
    const stripe = getStripe();
    const [transactions, subscriptions, balance] = await Promise.all([
      listBalanceTransactions(startTime, endTime),
      listSubscriptions(),
      stripe.balance.retrieve(),
    ]);
    const revenue = aggregateBalanceTransactions(transactions);
    const active = subscriptions.filter((subscription) => subscription.status === "active");
    const trialing = subscriptions.filter((subscription) => subscription.status === "trialing");
    const recurring = [...active, ...trialing];

    const recentTransactions: StripeTransactionMetric[] = transactions
      .filter((transaction) => REVENUE_CATEGORIES.has(category(transaction)))
      .slice(0, 12)
      .map((transaction) => ({
        id: transaction.id,
        createdAt: new Date(transaction.created * 1_000).toISOString(),
        description: transaction.description || category(transaction).replaceAll("_", " "),
        type: category(transaction),
        amountCents: transaction.amount,
        feeCents: transaction.fee,
        netCents: transaction.net,
        currency: transaction.currency.toUpperCase(),
      }));

    return {
      configured: true,
      error: null,
      currency: "USD",
      ...revenue,
      mrrCents: Math.round(recurring.reduce((total, subscription) => total + monthlyRecurringAmount(subscription), 0)),
      availableBalanceCents: balanceForCurrency(balance.available, "usd"),
      pendingBalanceCents: balanceForCurrency(balance.pending, "usd"),
      activeSubscriptions: active.length,
      trialingSubscriptions: trialing.length,
      pastDueSubscriptions: subscriptions.filter((subscription) => subscription.status === "past_due").length,
      canceledSubscriptions: subscriptions.filter((subscription) => subscription.status === "canceled").length,
      recentTransactions,
    };
  } catch (error) {
    console.error("[admin] Stripe analytics load failed:", error);
    return {
      ...EMPTY,
      configured: true,
      error: "Stripe analytics could not be loaded right now.",
    };
  }
}
