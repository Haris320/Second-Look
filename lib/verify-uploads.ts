import "server-only";
import sharp from "sharp";
import { db } from "./supabase";
import { MAX_FILE_BYTES, MAX_SCREENSHOTS } from "./uploads";

export async function verifyUploads(orderId: string) {
  const { data: rows, error } = await db
    .from("screenshots")
    .select("storage_path")
    .eq("order_id", orderId);
  if (error || !rows?.length || rows.length > MAX_SCREENSHOTS) return false;
  for (const row of rows) {
    const { data: info, error: infoError } = await db.storage
      .from("screenshots")
      .info(row.storage_path);
    if (
      infoError ||
      !info ||
      typeof info.size !== "number" ||
      info.size > MAX_FILE_BYTES ||
      info.size === 0
    )
      return false;
    const { data: file, error: fileError } = await db.storage
      .from("screenshots")
      .download(row.storage_path);
    if (fileError || !file || file.size > MAX_FILE_BYTES) return false;
    try {
      const meta = await sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 40_000_000,
      }).metadata();
      if (
        !meta.format ||
        !["png", "jpeg", "webp"].includes(meta.format) ||
        !meta.width ||
        !meta.height ||
        (meta.pages ?? 1) > 1
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
}
