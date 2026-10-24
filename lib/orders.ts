import "server-only";

export const MIN_SCREENSHOTS = 1;
export const MAX_SCREENSHOTS = 10;
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Runs inside the payment/reupload after() callback, after screening passes.
// Direct invocation avoids an extra HTTP hop, missing CRON_SECRET, and Vercel
// deployment-protection failures. The protected route is for recovery/backlog.
export async function notifyOrderPaid(orderId: string) {
  try {
    const { recruitOrder } = await import("./recruitment");
    await recruitOrder(orderId);
  } catch {
    console.error("Recruitment needs retry for order", orderId);
  }
}
