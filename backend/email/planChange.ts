import {
  formatMonthlyPrice,
  isPlan,
  PLAN_CATALOG,
  PLAN_RANK,
  type Plan,
} from "@/backend/billing/plans";
import { appUrl } from "@/backend/billing/stripe";
import { createServiceClient } from "@/backend/supabase/server";

interface PlanChangeEmailInput {
  recipientName?: string | null;
  previousPlan: Plan;
  newPlan: Plan;
  settingsUrl: string;
}

interface PlanChangeEmailContent {
  subject: string;
  html: string;
  text: string;
}

interface PlanChangeNotificationRow {
  event_id: string;
  recipient_email: string;
  recipient_name: string | null;
  previous_plan: string;
  new_plan: string;
  attempt_count: number;
  sent_at: string | null;
}

type DeliveryResult = "not_pending" | "already_sent" | "sent";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escaped[character];
  });
}

function storageLabel(megabytes: number): string {
  return megabytes >= 1_024
    ? `${megabytes / 1_024} GB`
    : `${megabytes} MB`;
}

function firstName(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] || "there";
}

export function renderPlanChangeEmail({
  recipientName,
  previousPlan,
  newPlan,
  settingsUrl,
}: PlanChangeEmailInput): PlanChangeEmailContent {
  const previous = PLAN_CATALOG[previousPlan];
  const current = PLAN_CATALOG[newPlan];
  const upgraded = PLAN_RANK[newPlan] > PLAN_RANK[previousPlan];
  const action = upgraded ? "upgraded" : "downgraded";
  const eyebrow = upgraded ? "Upgrade confirmed" : "Downgrade confirmed";
  const title = upgraded
    ? `Welcome to Smartlearn ${current.name}`
    : `Your downgrade to ${current.name} is confirmed`;
  const summary = upgraded
    ? `Your upgrade from ${previous.name} to ${current.name} is complete. Your new study allowances are ready now.`
    : `Your downgrade from ${previous.name} to ${current.name} is complete. Your account now uses the ${current.name} allowances shown below.`;
  const price = current.monthlyPriceCents === 0
    ? "$0 forever"
    : `${formatMonthlyPrice(current.monthlyPriceCents)} / month`;
  const safeName = escapeHtml(firstName(recipientName));
  const safeSettingsUrl = escapeHtml(settingsUrl);
  const subject = upgraded
    ? `Upgrade confirmed — welcome to Smartlearn ${current.name}`
    : `Downgrade confirmed — you’re now on Smartlearn ${current.name}`;
  const allowances = [
    ["AI credits", current.limits.aiCreditsPerMonth.toLocaleString("en-US")],
    ["Practice tests", current.limits.practiceTestsPerMonth.toLocaleString("en-US")],
    ["AI-processed notes", current.limits.notesPerMonth.toLocaleString("en-US")],
    ["Audio transcription", `${current.limits.audioMinutesPerMonth.toLocaleString("en-US")} min`],
    ["File storage", storageLabel(current.limits.storageMegabytes)],
  ];
  const allowanceRows = allowances
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:13px 0;border-bottom:1px solid #243244;color:#94a3b8;font-size:14px;line-height:20px;">${escapeHtml(label)}</td>
          <td align="right" style="padding:13px 0;border-bottom:1px solid #243244;color:#f8fafc;font-size:14px;font-weight:700;line-height:20px;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#060a11;color:#e5e7eb;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your Smartlearn plan has been ${action} to ${escapeHtml(current.name)}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#060a11;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 4px 22px;color:#f8fafc;font-size:22px;font-weight:800;letter-spacing:-0.5px;">
                <span style="display:inline-block;width:12px;height:12px;margin-right:9px;border-radius:4px;background:#38bdf8;box-shadow:0 0 24px rgba(56,189,248,.7);"></span>Smartlearn
              </td>
            </tr>
            <tr>
              <td style="overflow:hidden;border:1px solid #1e3447;border-radius:24px;background:#0d131d;box-shadow:0 24px 70px rgba(0,0,0,.34);">
                <div style="height:5px;background:linear-gradient(90deg,#38bdf8,#818cf8,#a78bfa);"></div>
                <div style="padding:42px 44px 20px;">
                  <div style="display:inline-block;padding:7px 12px;border:1px solid #164e63;border-radius:999px;background:#082f49;color:#7dd3fc;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${eyebrow}</div>
                  <h1 style="margin:22px 0 12px;color:#f8fafc;font-size:32px;line-height:39px;letter-spacing:-1px;">${escapeHtml(title)}</h1>
                  <p style="margin:0 0 14px;color:#cbd5e1;font-size:16px;line-height:26px;">Hi ${safeName},</p>
                  <p style="margin:0;color:#94a3b8;font-size:16px;line-height:26px;">${escapeHtml(summary)}</p>
                </div>
                <div style="padding:20px 44px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #243244;border-radius:16px;background:#111a26;">
                    <tr>
                      <td width="50%" style="padding:20px;border-right:1px solid #243244;">
                        <div style="margin-bottom:7px;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Previous plan</div>
                        <div style="color:#cbd5e1;font-size:18px;font-weight:700;">${escapeHtml(previous.name)}</div>
                      </td>
                      <td width="50%" style="padding:20px;">
                        <div style="margin-bottom:7px;color:#38bdf8;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">New plan</div>
                        <div style="color:#f8fafc;font-size:18px;font-weight:800;">${escapeHtml(current.name)}</div>
                        <div style="margin-top:5px;color:#94a3b8;font-size:13px;">${escapeHtml(price)}</div>
                      </td>
                    </tr>
                  </table>
                </div>
                <div style="padding:22px 44px 12px;">
                  <h2 style="margin:0 0 5px;color:#f8fafc;font-size:17px;line-height:24px;">Your monthly allowance</h2>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${allowanceRows}</table>
                </div>
                <div style="padding:26px 44px 44px;">
                  <a href="${safeSettingsUrl}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#7dd3fc;color:#07111c;font-size:15px;font-weight:800;text-decoration:none;">Open Smartlearn</a>
                  <p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:19px;">Allowances reset on a rolling 30-day basis. You can review or manage your subscription from Smartlearn Settings.</p>
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 18px;color:#64748b;font-size:12px;line-height:18px;">This is a transactional email about your Smartlearn subscription.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    title,
    "",
    `Hi ${firstName(recipientName)},`,
    summary,
    "",
    `Previous plan: ${previous.name}`,
    `New plan: ${current.name} (${price})`,
    "",
    "Your monthly allowance:",
    ...allowances.map(([label, value]) => `- ${label}: ${value}`),
    "",
    `Manage your subscription: ${settingsUrl}`,
    "",
    "Allowances reset on a rolling 30-day basis.",
  ].join("\n");

  return { subject, html, text };
}

async function markDeliveryFailure(
  eventId: string,
  message: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("billing_plan_email_notifications")
    .update({
      last_error: message.slice(0, 1_000),
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
  if (error) {
    console.error("[billing/email] Could not record delivery failure:", error);
  }
}

export async function sendPlanChangeNotification(
  eventId: string
): Promise<DeliveryResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("billing_plan_email_notifications")
    .select(
      "event_id, recipient_email, recipient_name, previous_plan, new_plan, attempt_count, sent_at"
    )
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error("[billing/email] Could not load notification", { cause: error });
  if (!data) return "not_pending";

  const notification = data as PlanChangeNotificationRow;
  if (notification.sent_at) return "already_sent";
  if (!isPlan(notification.previous_plan) || !isPlan(notification.new_plan)) {
    throw new Error("[billing/email] Notification contains an invalid plan");
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error(
      "[billing/email] RESEND_API_KEY and RESEND_FROM_EMAIL must be configured"
    );
  }

  const { subject, html, text } = renderPlanChangeEmail({
    recipientName: notification.recipient_name,
    previousPlan: notification.previous_plan,
    newPlan: notification.new_plan,
    settingsUrl: new URL("/settings", appUrl()).toString(),
  });
  const attemptedAt = new Date().toISOString();
  const { error: attemptError } = await supabase
    .from("billing_plan_email_notifications")
    .update({
      attempt_count: notification.attempt_count + 1,
      last_error: null,
      updated_at: attemptedAt,
    })
    .eq("event_id", eventId);
  if (attemptError) {
    throw new Error("[billing/email] Could not record delivery attempt", {
      cause: attemptError,
    });
  }

  try {
    const replyTo = process.env.RESEND_REPLY_TO?.trim();
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `smartlearn-plan-change/${eventId}`,
      },
      body: JSON.stringify({
        from,
        to: [notification.recipient_email],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => null)) as
      | { id?: string; message?: string }
      | null;
    if (!response.ok || !payload?.id) {
      throw new Error(
        payload?.message || `Resend returned status ${response.status}`
      );
    }

    const { error: sentError } = await supabase
      .from("billing_plan_email_notifications")
      .update({
        provider_message_id: payload.id,
        sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .is("sent_at", null);
    if (sentError) {
      throw new Error("Could not record successful email delivery", {
        cause: sentError,
      });
    }
    return "sent";
  } catch (deliveryError) {
    const message = deliveryError instanceof Error
      ? deliveryError.message
      : "Unknown email delivery error";
    await markDeliveryFailure(eventId, message);
    throw new Error("[billing/email] Plan-change email delivery failed", {
      cause: deliveryError,
    });
  }
}
