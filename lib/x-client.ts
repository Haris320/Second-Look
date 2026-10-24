import "server-only";
import { createHmac, randomBytes } from "node:crypto";

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function xAuthorization(method: string, url: string, credentials: { key: string; secret: string; token: string; tokenSecret: string }, nonce = randomBytes(16).toString("hex"), timestamp = String(Math.floor(Date.now() / 1000))) {
  const oauth: Record<string, string> = { oauth_consumer_key: credentials.key, oauth_token: credentials.token, oauth_nonce: nonce, oauth_timestamp: timestamp, oauth_signature_method: "HMAC-SHA1", oauth_version: "1.0" };
  const parsed = new URL(url);
  const parameters = [...Object.entries(oauth), ...parsed.searchParams.entries()].map(([k,v]) => [encode(k), encode(v)]).sort(([ak,av],[bk,bv]) => ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0).map(([k,v]) => `${k}=${v}`).join("&");
  const base = [method.toUpperCase(), `${parsed.origin}${parsed.pathname}`, parameters].map(encode).join("&");
  oauth.oauth_signature = createHmac("sha1", `${encode(credentials.secret)}&${encode(credentials.tokenSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.entries(oauth).sort().map(([k,v]) => `${encode(k)}="${encode(v)}"`).join(", ");
}

export async function xRequest(method: "GET" | "POST", path: string, body?: object) {
  const credentials = { key: process.env.X_API_KEY!, secret: process.env.X_API_SECRET!, token: process.env.X_ACCESS_TOKEN!, tokenSecret: process.env.X_ACCESS_TOKEN_SECRET! };
  if (Object.values(credentials).some(v => !v)) throw new Error("x_credentials_missing");
  const url = `https://api.x.com/2/${path}`;
  // Never retry a create: X does not offer a client idempotency key here.
  const response = await fetch(url, { method, headers: { Authorization: xAuthorization(method, url, credentials), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error(`x_http_${response.status}`);
  return response.json();
}
