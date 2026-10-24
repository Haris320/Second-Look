import "server-only";

export const MIN_SCREENSHOTS = 3;
export const MAX_SCREENSHOTS = 8;
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

// Hands a paid order to the agent (partner's app/api/agent/order-paid → onOrderPaid). Call it inside after().
// A 404 means the agent side isn't deployed yet, which is fine: its tick picks the order up.
export async function notifyOrderPaid(orderId: string) {
  const res = await fetch(`${process.env.PUBLIC_BASE_URL}/api/agent/order-paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ orderId }),
  }).catch((err) => {
    console.error("order-paid hook failed", err);
    return null;
  });
  if (res && !res.ok && res.status !== 404) console.error("order-paid hook returned", res.status);
}
