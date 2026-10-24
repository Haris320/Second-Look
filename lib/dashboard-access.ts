import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
const name = "sl_dashboard";
function sign(expiry: string) {
  return createHmac("sha256", process.env.DASHBOARD_PASSWORD!)
    .update(`dashboard:${expiry}`)
    .digest("hex");
}
export function matchesPassword(value: string) {
  const actual = process.env.DASHBOARD_PASSWORD;
  return (
    !!actual &&
    Buffer.byteLength(value) === Buffer.byteLength(actual) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(actual))
  );
}
export async function grantDashboard() {
  const expiry = String(Math.floor(Date.now() / 1000) + 3600);
  (await cookies()).set(name, `${expiry}.${sign(expiry)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 3600,
  });
}
export async function dashboardAccess() {
  if (!process.env.DASHBOARD_PASSWORD) return false;
  const token = (await cookies()).get(name)?.value;
  if (!token) return false;
  // Reject malformed cookies before comparing MAC bytes (including non-ASCII input).
  const match = /^(\d{1,12})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const [, expiry, mac] = match;
  if (Number(expiry) <= Date.now() / 1000) return false;
  const expected = sign(expiry);
  return (
    mac.length === expected.length &&
    timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );
}
