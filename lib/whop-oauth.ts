import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function referralLoginReady() {
  return Boolean(process.env.WHOP_CLIENT_ID && process.env.WHOP_CLIENT_SECRET &&
    process.env.PUBLIC_BASE_URL && (process.env.REFERRAL_SESSION_SECRET?.length ?? 0)>=32);
}
function config() {
  if (!referralLoginReady()) throw new Error("Whop sign-in is not configured");
  const origin = new URL(process.env.PUBLIC_BASE_URL!).origin;
  return {
    clientId:process.env.WHOP_CLIENT_ID!,secret:process.env.WHOP_CLIENT_SECRET!,
    base:process.env.WHOP_ENVIRONMENT === "sandbox" ? "https://sandbox-api.whop.com" : "https://api.whop.com",
    callback:`${origin}/api/referrals/callback`,
  };
}
export function newReferralLogin(scope:string) {
  return {state:randomBytes(32).toString("base64url"),verifier:randomBytes(32).toString("base64url"),nonce:randomBytes(32).toString("base64url"),createdAt:Date.now(),scope};
}
export function referralAuthorizeUrl(pending:ReturnType<typeof newReferralLogin>) {
  const c=config();
  const url=new URL(`${c.base}/oauth/authorize`);
  url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.callback,response_type:"code",scope:"openid profile email",
    state:pending.state,nonce:pending.nonce,code_challenge:createHash("sha256").update(pending.verifier).digest("base64url"),code_challenge_method:"S256"}).toString();
  return url.href;
}
async function providerJson(url:string,init:RequestInit={}) {
  const response=await fetch(url,{...init,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error("Whop sign-in request failed");
  return response.json();
}
export async function exchangeReferralIdentity(code:string,pending:ReturnType<typeof newReferralLogin>) {
  const c=config();
  const tokens=await providerJson(`${c.base}/oauth/token`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    client_id:c.clientId,client_secret:c.secret,grant_type:"authorization_code",redirect_uri:c.callback,code,code_verifier:pending.verifier,
  })});
  if (typeof tokens.access_token !== "string" || typeof tokens.id_token !== "string" || tokens.token_type?.toLowerCase() !== "bearer") throw new Error("Invalid Whop token response");
  const discovery=await providerJson(`${c.base}/.well-known/openid-configuration`);
  // Only Whop-controlled issuer/key endpoints may validate an identity. Sandbox discovery may use the production issuer.
  const allowed=["https://api.whop.com","https://sandbox-api.whop.com"];
  if (!allowed.includes(discovery.issuer) || !allowed.some(base=>discovery.jwks_uri===`${base}/.well-known/jwks.json`)) throw new Error("Unexpected Whop issuer");
  let keys=keySets.get(discovery.jwks_uri);
  if (!keys) { keys=createRemoteJWKSet(new URL(discovery.jwks_uri),{timeoutDuration:15000});keySets.set(discovery.jwks_uri,keys); }
  const {payload}=await jwtVerify(tokens.id_token,keys,{issuer:discovery.issuer,audience:c.clientId,requiredClaims:["exp","iat","sub","nonce"],maxTokenAge:"10m"});
  if (payload.nonce !== pending.nonce) throw new Error("Whop sign-in nonce mismatch");
  const user=await providerJson(`${c.base}/oauth/userinfo`,{headers:{Authorization:`Bearer ${tokens.access_token}`}});
  if (typeof user.sub !== "string" || !/^user_[a-zA-Z0-9]+$/.test(user.sub) || user.sub!==payload.sub) throw new Error("Whop identity mismatch");
  // Never persist provider access/refresh tokens or accept a payout recipient from the browser.
  return {userId:user.sub,email:typeof user.email === "string" ? user.email.slice(0,254) : "",
    label:typeof user.preferred_username === "string" ? user.preferred_username.slice(0,100) : "Your Whop account"};
}
