import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./supabase";
import { grantAccess, validId } from "./order-access";
import { logDecision } from "./log";

// Private order links: /order/[id]?key=… opens the order from any browser. A key is an HMAC of the order ID
// under ORDER_LINK_SECRET, so the server can rebuild any order's link (to message the buyer). Orders from before
// that keep their random key, checked against the stored SHA-256. Keys don't depend on ORDER_SESSION_SECRET.
const AGE = 60 * 60 * 24 * 30;
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const keyCookie = (id: string) => `sl_key_${id}`;
const linkFor = (id: string, key: string) => `${process.env.PUBLIC_BASE_URL}/order/${id}?key=${key}`;

function orderKey(id: string) {
  const secret = process.env.ORDER_LINK_SECRET;
  if (!secret) throw new Error("ORDER_LINK_SECRET is not set");
  return createHmac("sha256", secret).update(id).digest("base64url");
}

// Any order's private link, e.g. for a message to the buyer.
export const orderLink = (id: string) => linkFor(id, orderKey(id));

function sameKey(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const keyMatches = (key: string, storedHash: string) => sameKey(hash(key), storedHash);

async function rememberKey(id: string, key: string) {
  (await cookies()).set(keyCookie(id), key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AGE,
  });
}

// Store the order's key hash, replacing any earlier random key. No cookie, so scripts can use it too.
export async function createOrderKey(id: string) {
  const key = orderKey(id);
  const { error } = await db.from("orders").update({ access_key_hash: hash(key) }).eq("id", id);
  if (error) throw error;
  return { key, link: linkFor(id, key) };
}

// For a new order, in a route handler: create its key and remember it in this browser.
export async function issueOrderLink(id: string) {
  const { key, link } = await createOrderKey(id);
  await rememberKey(id, key);
  return link;
}

// The link to show a browser that already has access. A browser holding an older random key keeps seeing it.
export async function currentOrderLink(id: string, storedHash: string | null) {
  const key = (await cookies()).get(keyCookie(id))?.value;
  if (key && storedHash && keyMatches(key, storedHash)) return linkFor(id, key);
  if (!storedHash)
    await db.from("orders").update({ access_key_hash: hash(orderKey(id)) }).eq("id", id).is("access_key_hash", null);
  return orderLink(id);
}

// Opening a private link: check the key, then give this browser the access cookie and remember the key.
export async function openWithKey(id: string, key: unknown) {
  if (!validId(id) || typeof key !== "string" || key.length > 100) return false;
  const { data } = await db.from("orders").select("access_key_hash").eq("id", id).single();
  if (!data) return false;
  if (!sameKey(key, orderKey(id)) && !(data.access_key_hash && keyMatches(key, data.access_key_hash))) return false;
  await grantAccess(id);
  await rememberKey(id, key);
  return true;
}

// Wrong keys or forged access cookies: each one is logged, and 10 from one address in 15 minutes gets a 429.
// Addresses are stored only as a salted hash. (The 256-bit keys can't be guessed anyway; this keeps it obvious.)
const WRONG_KEY_LIMIT = 10;
function clientTag(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return createHmac("sha256", process.env.ORDER_LINK_SECRET ?? "").update(ip).digest("hex").slice(0, 12);
}

export async function tooManyWrongKeys(request: Request) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await db
    .from("decisions")
    .select("id", { count: "exact", head: true })
    .eq("step", "access")
    .eq("choice", "wrong_key")
    .like("reason", `%client ${clientTag(request)}%`)
    .gt("created_at", since);
  return (count ?? 0) >= WRONG_KEY_LIMIT;
}

export async function recordWrongKey(request: Request, id: string, what: string) {
  await logDecision(null, "access", "wrong_key", `${what} refused for order ${id.slice(0, 8)} from client ${clientTag(request)}`);
}

export const tooManyResponse = () =>
  Response.json(
    { error: "Too many attempts. Please wait 15 minutes and try again." },
    { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": "900" } },
  );
