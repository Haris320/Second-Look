import { AUDIENCES, isAudience } from "./tiers";

export function audienceLabel(audience: string) {
  return isAudience(audience) ? AUDIENCES[audience] : audience;
}
