// Shared, fixed messages only: never reflect provider responses, tokens, or callback URLs.
export const REFERRAL_LOGIN_MESSAGES = {
  canceled: "Whop sign-in was canceled. You can try again whenever you’re ready.",
  expired: "Your sign-in session expired or was opened in a different browser. Start again from this page and finish in the same browser.",
  authorization: "Whop could not authorize sign-in for Second Look. The app’s OAuth configuration needs to be checked.",
  token_client: "Whop did not accept Second Look’s sign-in credentials. We need to check the app’s client ID and secret.",
  token_permission: "Whop blocked Second Look’s sign-in request. The app’s token-exchange permission needs to be checked.",
  token_expired: "Whop’s sign-in code expired or was already used. Please start again from this page.",
  token_exchange: "We could not finish the sign-in exchange with Whop. Please try again.",
  token_response: "Whop returned an unexpected sign-in response. Please try again or share the error code with us.",
  discovery: "We could not load Whop’s sign-in verification settings. Please try again.",
  token_validation: "We could not verify Whop’s sign-in response. Please try again or share the error code with us.",
  nonce: "The sign-in response did not match this session. Please start again in the same browser.",
  userinfo: "Whop sign-in completed, but we could not verify the receiving account. Please try again.",
  identity: "Whop returned mismatched account details. Please start sign-in again.",
  profile_save: "Whop sign-in worked, but we could not save your referral account. Please try again.",
  profile_load: "Whop sign-in worked, but we could not load your referral account. Please try again.",
  session_save: "We could not save your sign-in session. Please try again in the same browser.",
  failed: "We couldn’t complete Whop sign-in. Please try again.",
} as const;
export type ReferralLoginCode = keyof typeof REFERRAL_LOGIN_MESSAGES;
export function referralLoginMessage(code: string) {
  return Object.hasOwn(REFERRAL_LOGIN_MESSAGES,code)
    ? REFERRAL_LOGIN_MESSAGES[code as ReferralLoginCode]
    : REFERRAL_LOGIN_MESSAGES.failed;
}
export class ReferralLoginError extends Error {
  constructor(public readonly code: ReferralLoginCode, public readonly detail = "") {
    super(REFERRAL_LOGIN_MESSAGES[code]);
  }
}
const PROVIDER_CODES = new Set(["invalid_client","unauthorized_client","invalid_grant","invalid_request","invalid_scope","access_denied","insufficient_scope","missing_permission","permission_denied","server_error","temporarily_unavailable"]);
export function safeProviderCode(value:unknown):string {
  return typeof value === "string" && PROVIDER_CODES.has(value) ? value : "unknown";
}
export function safeValidationDetail(value:unknown):string {
  if (!value || typeof value !== "object") return "verification_failed";
  const error=value as {code?:unknown;claim?:unknown};
  const code=typeof error.code === "string" && /^ERR_(JWT|JWS|JWKS|JOSE)_[A-Z_]{1,60}$/.test(error.code) ? error.code : "verification_failed";
  const claim=typeof error.claim === "string" && ["exp","iat","aud","iss","sub","nonce","nbf"].includes(error.claim) ? ` claim=${error.claim}` : "";
  return code+claim;
}
