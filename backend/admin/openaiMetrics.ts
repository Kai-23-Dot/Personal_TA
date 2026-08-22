import type {
  AdminPeriodDays,
  OpenAIAdminMetrics,
  OpenAICostLineItem,
  OpenAIModelMetric,
} from "./types";

type JsonRecord = Record<string, unknown>;

interface OpenAIPage {
  data?: Array<{ start_time?: number; results?: JsonRecord[] }>;
  has_more?: boolean;
  next_page?: string | null;
}

const EMPTY: OpenAIAdminMetrics = {
  configured: false,
  error: null,
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  requests: null,
  embeddingTokens: null,
  imageRequests: null,
  audioSeconds: null,
  costUsd: null,
  models: [],
  costLineItems: [],
  daily: [],
};

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function dateKey(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString().slice(0, 10);
}

async function fetchAdminPages(
  path: string,
  params: URLSearchParams,
  adminKey: string
): Promise<OpenAIPage["data"]> {
  const rows: NonNullable<OpenAIPage["data"]> = [];
  let page: string | null = null;

  for (let requestCount = 0; requestCount < 20; requestCount += 1) {
    const url = new URL(`https://api.openai.com/v1/organization/${path}`);
    for (const [key, value] of params) url.searchParams.append(key, value);
    if (page) url.searchParams.set("page", page);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${path} request failed (${response.status})`);
    }
    const payload = (await response.json()) as OpenAIPage;
    rows.push(...(payload.data ?? []));
    if (!payload.has_more || !payload.next_page) break;
    page = payload.next_page;
  }
  return rows;
}

function usageParams(startTime: number, endTime: number, days: AdminPeriodDays) {
  const params = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
    bucket_width: "1d",
    limit: String(Math.min(days + 1, 31)),
  });
  params.append("group_by", "model");
  return params;
}

function resultModel(result: JsonRecord): string {
  return typeof result.model === "string" && result.model ? result.model : "Unattributed";
}

function amountUsd(result: JsonRecord): number {
  const amount = result.amount;
  if (typeof amount === "object" && amount !== null) {
    const record = amount as JsonRecord;
    const currency = typeof record.currency === "string" ? record.currency.toLowerCase() : "usd";
    return currency === "usd" ? numberValue(record.value) : 0;
  }
  return numberValue(amount);
}

/** Load organization-wide provider usage. This key is distinct from a project API key. */
export async function getOpenAIAdminMetrics({
  startTime,
  endTime,
  days,
}: {
  startTime: number;
  endTime: number;
  days: AdminPeriodDays;
}): Promise<OpenAIAdminMetrics> {
  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  if (!adminKey) return EMPTY;

  try {
    const costsParams = new URLSearchParams({
      start_time: String(startTime),
      end_time: String(endTime),
      bucket_width: "1d",
      limit: String(Math.min(days + 1, 31)),
    });
    costsParams.append("group_by", "line_item");

    const [completionBuckets, embeddingBuckets, transcriptionBuckets, imageBuckets, costBuckets] =
      await Promise.all([
        fetchAdminPages("usage/completions", usageParams(startTime, endTime, days), adminKey),
        fetchAdminPages("usage/embeddings", usageParams(startTime, endTime, days), adminKey),
        fetchAdminPages("usage/audio_transcriptions", usageParams(startTime, endTime, days), adminKey),
        fetchAdminPages("usage/images", usageParams(startTime, endTime, days), adminKey),
        fetchAdminPages("costs", costsParams, adminKey),
      ]);

    const models = new Map<string, OpenAIModelMetric>();
    const daily = new Map<string, OpenAIAdminMetrics["daily"][number]>();
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let requests = 0;
    let embeddingTokens = 0;
    let audioSeconds = 0;
    let imageRequests = 0;

    for (const bucket of completionBuckets ?? []) {
      const key = dateKey(numberValue(bucket.start_time));
      const day = daily.get(key) ?? {
        date: key,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        requests: 0,
        providerCostUsd: 0,
      };
      for (const result of bucket.results ?? []) {
        const input = numberValue(result.input_tokens);
        const output = numberValue(result.output_tokens);
        const cached = numberValue(result.input_cached_tokens);
        const modelRequests = numberValue(result.num_model_requests);
        inputTokens += input;
        outputTokens += output;
        cachedTokens += cached;
        requests += modelRequests;
        day.inputTokens += input;
        day.outputTokens += output;
        day.cachedTokens += cached;
        day.requests += modelRequests;

        const model = resultModel(result);
        const current = models.get(model) ?? {
          model,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          requests: 0,
        };
        current.inputTokens += input;
        current.outputTokens += output;
        current.cachedTokens += cached;
        current.requests += modelRequests;
        models.set(model, current);
      }
      daily.set(key, day);
    }

    for (const bucket of embeddingBuckets ?? []) {
      for (const result of bucket.results ?? []) {
        embeddingTokens += numberValue(result.input_tokens);
        requests += numberValue(result.num_model_requests);
      }
    }
    for (const bucket of transcriptionBuckets ?? []) {
      for (const result of bucket.results ?? []) {
        audioSeconds += numberValue(result.seconds);
        requests += numberValue(result.num_model_requests);
      }
    }
    for (const bucket of imageBuckets ?? []) {
      for (const result of bucket.results ?? []) {
        const count = numberValue(result.images) || numberValue(result.num_model_requests);
        imageRequests += count;
        requests += numberValue(result.num_model_requests);
      }
    }

    const lineItems = new Map<string, number>();
    let costUsd = 0;
    for (const bucket of costBuckets ?? []) {
      const key = dateKey(numberValue(bucket.start_time));
      const day = daily.get(key) ?? {
        date: key,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        requests: 0,
        providerCostUsd: 0,
      };
      for (const result of bucket.results ?? []) {
        const amount = amountUsd(result);
        const label = typeof result.line_item === "string" && result.line_item
          ? result.line_item
          : "Other";
        costUsd += amount;
        day.providerCostUsd += amount;
        lineItems.set(label, (lineItems.get(label) ?? 0) + amount);
      }
      daily.set(key, day);
    }

    const modelRows = [...models.values()].sort(
      (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
    );
    const costLineItems: OpenAICostLineItem[] = [...lineItems.entries()]
      .map(([lineItem, amount]) => ({ lineItem, amountUsd: amount }))
      .sort((a, b) => b.amountUsd - a.amountUsd);

    return {
      configured: true,
      error: null,
      inputTokens,
      outputTokens,
      cachedTokens,
      requests,
      embeddingTokens,
      imageRequests,
      audioSeconds,
      costUsd,
      models: modelRows,
      costLineItems,
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  } catch (error) {
    console.error("[admin] OpenAI usage load failed:", error);
    return {
      ...EMPTY,
      configured: true,
      error: "OpenAI organization analytics could not be loaded right now.",
    };
  }
}
