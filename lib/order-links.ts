import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./supabase";
import { grantAccess, validId } from "./order-access";

// Private order links: /order/[id]?key=… opens the order from any browser. Only a SHA-256 of the key is stored.
// The key itself lives in the link and in an httpOnly cookie on browsers that opened the order, so the page can
// show the link again. Keys don't depend on ORDER_SESSION_SECRET, so links survive a change of that secret.
const AGE = 60 * 60 * 24 * 30;
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const keyCookie = (id: string) => `sl_key_${id}`;
const linkFor = (id: string, key: string) => `${process.env.PUBLIC_BASE_URL}/order/${id}?key=${key}`;

function keyMatches(key: string, storedHash: string) {
  const a = Buffer.from(hash(key));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function rememberKey(id: string, key: string) {
  (await cookies()).set(keyCookie(id), key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AGE,
  });
}

// A new key for the order, replacing any earlier one. No cookie, so scripts can use it too.
export async function createOrderKey(id: string) {
  const key = randomBytes(32).toString("base64url");
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

// The link to show a browser that already has access. Orders made before private links get their first key here.
export async function currentOrderLink(id: string, storedHash: string | null) {
  const key = (await cookies()).get(keyCookie(id))?.value;
  if (key && storedHash && keyMatches(key, storedHash)) return linkFor(id, key);
  if (storedHash) return null;
  const newKey = randomBytes(32).toString("base64url");
  const { data } = await db
    .from("orders")
    .update({ access_key_hash: hash(newKey) })
    .eq("id", id)
    .is("access_key_hash", null)
    .select("id");
  if (!data?.length) return null;
  await rememberKey(id, newKey);
  return linkFor(id, newKey);
}

// Opening a private link: check the key, then give this browser the access cookie and remember the key.
export async function openWithKey(id: string, key: unknown) {
  if (!validId(id) || typeof key !== "string" || key.length > 100) return false;
  const { data } = await db.from("orders").select("access_key_hash").eq("id", id).single();
  if (!data?.access_key_hash || !keyMatches(key, data.access_key_hash)) return false;
  await grantAccess(id);
  await rememberKey(id, key);
  return true;
}
