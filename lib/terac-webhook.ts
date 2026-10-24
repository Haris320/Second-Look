import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTeracSignature(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const timestamp = headers.get("x-terac-request-timestamp");
  const signature = headers.get("x-terac-request-signature");
  if (!timestamp || !/^\d+$/.test(timestamp) || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  // Terac uses the entire secret literally, including whsec_, not a decoded suffix.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + raw).digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export type TeracEvent = {
  event_type: string;
  event_id: string;
  resource_id?: string;
  occurred_at?: string;
  opportunity_id?: string;
  from?: string;
  to?: string;
};

export function parseTeracEvent(raw: string, headers: Headers): TeracEvent {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid event");
  const e = value as Record<string, unknown>;
  if (typeof e.event_type !== "string" || !e.event_type || e.event_type.length > 200) throw new Error("Invalid event type");
  // Confirmation pings may omit delivery metadata and are never stored.
  if (e.event_type === "webhook.ping") return { event_type: e.event_type, event_id: "ping" };
  if (typeof e.event_id !== "string" || !e.event_id || e.event_id.length > 200 || headers.get("x-event-id") !== e.event_id) throw new Error("Invalid event ID");
  if (e.event_type === "submission.status.change" || e.event_type === "submission.approved") {
    for (const key of ["resource_id", "opportunity_id", "from", "to", "occurred_at"]) {
      if (typeof e[key] !== "string" || !e[key] || (e[key] as string).length > 200) throw new Error("Invalid submission event");
    }
    if (!Number.isFinite(Date.parse(e.occurred_at as string))) throw new Error("Invalid event time");
    if (e.event_type === "submission.approved" && e.to !== "approved") throw new Error("Invalid approval event");
  }
  return e as TeracEvent;
}

// Dependency injection keeps HTTP behavior testable without real Supabase writes.
export async function receiveTeracWebhook(
  request: Request,
  secret: string | undefined,
  persist: (event: TeracEvent) => Promise<boolean>,
) {
  if (!secret) return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  const maxBytes = 256 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) return new Response(null, { status: 413 });
  // Bound streamed/chunked bodies too, before buffering the entire payload.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        chunks.push(value);
      }
    } catch {
      return Response.json({ error: "Unreadable request" }, { status: 400 });
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!verifyTeracSignature(raw, request.headers, secret)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  let event: TeracEvent;
  try {
    event = parseTeracEvent(raw, request.headers);
  } catch {
    return Response.json({ error: "Invalid event" }, { status: 400 });
  }
  if (event.event_type === "webhook.ping") return Response.json({ received: true });
  // Future event types are safely acknowledged, without triggering business actions.
  if (!["submission.status.change", "submission.approved"].includes(event.event_type)) return Response.json({ received: true, ignored: true });
  try {
    const inserted = await persist(event);
    return Response.json({ received: true, duplicate: !inserted });
  } catch {
    // No 2xx until the event is durably stored. Terac retries failed deliveries.
    console.error("Terac webhook persistence failed");
    return Response.json({ error: "Could not store event" }, { status: 503 });
  }
}
