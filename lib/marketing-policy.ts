export const MARKETING_ACCOUNT = "secondlook_date";
export function validateMarketingText(text: unknown, history: string[]) {
  // Conservative ASCII-only copy keeps character counting unambiguous. Link is appended separately.
  if (typeof text !== "string" || !text.trim() || text.length > 250 || /[^\x20-\x7E\n]/.test(text)) throw new Error("invalid_marketing_text");
  if (/@|https?:|www\.|\.com\b|\.app\b|\.io\b/i.test(text)) throw new Error("unexpected_marketing_link_or_mention");
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
  const current = words(text);
  for (const previous of history) {
    const old = words(previous);
    const common = [...current].filter(w => old.has(w)).length;
    if (common / new Set([...current, ...old]).size > 0.7) throw new Error("repeated_marketing_text");
  }
  return text.trim();
}
