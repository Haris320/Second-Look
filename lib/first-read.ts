import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { db } from "./supabase";
import { logDecision } from "./log";
import { notifyOrderPaid } from "./orders";

// The AI first read: right after payment, Claude checks the screenshots are a safe dating profile and gives
// instant feedback. It is never a human review: the order page labels it as AI and the report never uses it.

const FIRST_READ_SCHEMA = {
  type: "object",
  properties: {
    is_dating_profile: { type: "boolean" },
    explicit_content: { type: "boolean" },
    appears_under_18: { type: "boolean" },
    hold_reason: { type: "string" },
    first_impression: { type: "string" },
    lead_photo: { type: "integer" },
    working: { type: "array", items: { type: "string" } },
    tips: { type: "array", items: { type: "string" } },
  },
  required: [
    "is_dating_profile",
    "explicit_content",
    "appears_under_18",
    "hold_reason",
    "first_impression",
    "lead_photo",
    "working",
    "tips",
  ],
  additionalProperties: false,
} as const;

export type FirstRead = {
  is_dating_profile: boolean;
  explicit_content: boolean;
  appears_under_18: boolean;
  hold_reason: string;
  first_impression: string;
  lead_photo: number;
  working: string[];
  tips: string[];
};

const SYSTEM = `You give the first read on a customer's dating profile for Second Look, a service where real people review dating profiles. The customer uploaded screenshots of their own profile and paid. Human reviewers will see these screenshots next, so you also decide whether they are safe to send.

Safety check (be precise; a wrong hold delays a paying customer):
- is_dating_profile: true if the screenshots show a dating-app profile (photos, prompts, bio) from any app, or the photos and text someone plans to use on one. False for unrelated images such as memes, documents, chats, or screenshots of someone else's profile being mocked.
- explicit_content: true only for nudity or sexual content. Swimwear, gym photos and normal flirting are fine.
- appears_under_18: true only if the main person clearly looks like a minor.
- hold_reason: one short sentence for our team if any check fails, otherwise an empty string.

Feedback (only if the checks pass; otherwise leave first_impression empty and the arrays empty):
- first_impression: two or three sentences on how the profile comes across at a glance.
- lead_photo: the screenshot number to lead with, or 0 if no screenshot shows a usable photo.
- working: two short points on what already works, each pointing at something specific.
- tips: three specific, actionable changes, most important first.
Speak to the customer as "you". Be kind but honest. Comment on choices they control (photo selection, framing, variety, prompt answers), never on their body, looks, race, or other traits they can't change. Don't promise matches.`;

const anthropic = new Anthropic();

// Reads the order's screenshots with Claude. No database writes, so it is safe to try on any order.
export async function readProfile(
  orderId: string,
): Promise<{ read: FirstRead } | { failure: string }> {
  const { data: shots } = await db
    .from("screenshots")
    .select("storage_path,position")
    .eq("order_id", orderId)
    .order("position");
  if (!shots?.length) return { failure: "No screenshots found for this order" };
  const { data: signed, error } = await db.storage
    .from("screenshots")
    .createSignedUrls(
      shots.map((s) => s.storage_path),
      600,
    );
  const urls = signed?.map((s) => s.signedUrl);
  if (error || !urls || urls.some((url) => !url)) return { failure: "Could not sign the screenshot URLs" };
  const content: Anthropic.ContentBlockParam[] = shots.flatMap((s, i) => [
    { type: "text" as const, text: `Screenshot ${s.position}` },
    { type: "image" as const, source: { type: "url" as const, url: urls[i]! } },
  ]);
  content.push({ type: "text", text: "Run the safety check, then give the first read." });
  try {
    const response = await anthropic.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: jsonSchemaOutputFormat(FIRST_READ_SCHEMA) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return { failure: "Claude declined to read these screenshots" };
    if (!response.parsed_output) return { failure: `No usable answer (stop reason ${response.stop_reason})` };
    return { read: response.parsed_output };
  } catch (err) {
    if (err instanceof Anthropic.APIError) return { failure: `Claude API error ${err.status}: ${err.message}` };
    return { failure: `First read failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Runs on every newly paid order (status 'screening'). A safe profile moves to 'paid' and goes to the reviewers;
// anything else, including a failed check, is held so no reviewer sees it. Haris refunds held orders in Whop.
export async function runFirstRead(orderId: string) {
  const result = await readProfile(orderId);
  const read = "read" in result ? result.read : null;
  const passed = !!read && read.is_dating_profile && !read.explicit_content && !read.appears_under_18;
  const reason = passed
    ? "Screenshots are a dating profile with nothing explicit; sent to reviewers"
    : "failure" in result
      ? `${result.failure}; held so no reviewer sees unchecked screenshots`
      : `Held: ${read!.hold_reason || "failed the safety check"}`;
  const { data, error } = await db
    .from("orders")
    .update(
      passed
        ? { status: "paid", first_read_json: read }
        : { status: "held", first_read_json: read, hold_reason: reason },
    )
    .eq("id", orderId)
    .eq("status", "screening")
    .select("id");
  if (error) console.error("first read update failed", orderId, error);
  if (!data?.length) return;
  await logDecision(orderId, "first_read", passed ? "passed" : "held", reason);
  if (passed) await notifyOrderPaid(orderId);
}
