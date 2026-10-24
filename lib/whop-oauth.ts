import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ReferralLoginError, safeProviderCode, safeValidationDetail, type ReferralLoginCode } from "./referral-login-errors";

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
async function providerJson(url:string,stage:ReferralLoginCode,init:RequestInit={}) {
  let response:Response;
  try { response=await fetch(url,{...init,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)}); }
  catch { throw new ReferralLoginError(stage,"network_or_timeout"); }
  if (!response.ok) {
    const body=await response.json().catch(()=>null);
    const providerCode=safeProviderCode(typeof body?.error === "string" ? body.error : body?.error?.code ?? body?.code);
    let category=stage;
    if(stage==="token_exchange") {
      if(response.status===401 || providerCode==="invalid_client") category="token_client";
      else if(response.status===403 || ["unauthorized_client","missing_permission","permission_denied","insufficient_scope"].includes(providerCode)) category="token_permission";
      else if(providerCode==="invalid_grant") category="token_expired";
    }
    throw new ReferralLoginError(category,`http=${response.status} provider=${providerCode}`);
  }
  try { return await response.json(); }
  catch { throw new ReferralLoginError(stage,"invalid_json"); }
}
export async function exchangeReferralIdentity(code:string,pending:ReturnType<typeof newReferralLogin>) {
  const c=config();
  const tokens=await providerJson(`${c.base}/oauth/token`,"token_exchange",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    client_id:c.clientId,client_secret:c.secret,grant_type:"authorization_code",redirect_uri:c.callback,code,code_verifier:pending.verifier,
  })});
  if (typeof tokens.access_token !== "string" || typeof tokens.id_token !== "string" || (typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer")) throw new ReferralLoginError("token_response");
  const discovery=await providerJson(`${c.base}/.well-known/openid-configuration`,"discovery");
  // Only Whop-controlled issuer/key endpoints may validate an identity. Sandbox discovery may use the production issuer.
  const allowed=["https://api.whop.com","https://sandbox-api.whop.com"];
  if (!allowed.includes(discovery.issuer) || !allowed.some(base=>discovery.jwks_uri===`${base}/.well-known/jwks.json`)) throw new ReferralLoginError("discovery","unexpected_issuer");
  let keys=keySets.get(discovery.jwks_uri);
  if (!keys) { keys=createRemoteJWKSet(new URL(discovery.jwks_uri),{timeoutDuration:15000});keySets.set(discovery.jwks_uri,keys); }
  let payload;
  try {
    ({payload}=await jwtVerify(tokens.id_token,keys,{issuer:discovery.issuer,audience:c.clientId,requiredClaims:["exp","iat","sub","nonce"],maxTokenAge:"10m"}));
  } catch(error) { throw new ReferralLoginError("token_validation",safeValidationDetail(error)); }
  if (payload.nonce !== pending.nonce) throw new ReferralLoginError("nonce");
  const user=await providerJson(`${c.base}/oauth/userinfo`,"userinfo",{headers:{Authorization:`Bearer ${tokens.access_token}`}});
  if (typeof user.sub !== "string" || !/^user_[a-zA-Z0-9]+$/.test(user.sub) || user.sub!==payload.sub) throw new ReferralLoginError("identity");
  // Never persist provider access/refresh tokens or accept a payout recipient from the browser.
  return {userId:user.sub,email:typeof user.email === "string" ? user.email.slice(0,254) : "",
    label:typeof user.preferred_username === "string" ? user.preferred_username.slice(0,100) : "Your Whop account"};
}
