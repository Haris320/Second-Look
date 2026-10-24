import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const AGE = 60 * 60 * 24 * 7;
export const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function signature(value: string) {
  const key =
    process.env.ORDER_SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Order access is not configured");
  return createHmac("sha256", key).update(value).digest("hex");
}
export async function grantAccess(id: string) {
  const expiry = Math.floor(Date.now() / 1000) + AGE;
  const value = `${id}.${expiry}`;
  (await cookies()).set(`sl_order_${id}`, `${expiry}.${signature(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AGE,
  });
}
export async function hasAccess(id: string) {
  if (!validId(id)) return false;
  const token = (await cookies()).get(`sl_order_${id}`)?.value;
  if (!token) return false;
  // Reject malformed cookies before comparing MAC bytes (including non-ASCII input).
  const match = /^(\d{1,12})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const [, expiry, mac] = match;
  if (Number(expiry) <= Date.now() / 1000) return false;
  const expected = signature(`${id}.${expiry}`);
  return (
    mac.length === expected.length &&
    timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    const host = request.headers.get("host");
    return (
      origin === target.origin ||
      (source.host === host && source.protocol === target.protocol) ||
      (!!process.env.PUBLIC_BASE_URL &&
        origin === new URL(process.env.PUBLIC_BASE_URL).origin)
    );
  } catch {
    return false;
  }
}
export const privateHeaders = { "Cache-Control": "private, no-store" };
