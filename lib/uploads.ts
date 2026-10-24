export const MAX_SCREENSHOTS = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AUDIENCES = {
  women_21_35_us: "Women, 21–35 · United States",
  men_21_35_us: "Men, 21–35 · United States",
} as const;
export type Audience = keyof typeof AUDIENCES;
export type UploadManifest = { name: string; type: string; size: number };
export function validateFiles(files: UploadManifest[]): string | null {
  if (
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > MAX_SCREENSHOTS
  )
    return "Choose between 1 and 10 screenshots.";
  for (const file of files) {
    if (
      !file ||
      typeof file.name !== "string" ||
      !IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])
    )
      return "Use JPG, PNG, or WebP screenshots. Videos and HEIC files are not supported.";
    if (
      !Number.isInteger(file.size) ||
      file.size <= 0 ||
      file.size > MAX_FILE_BYTES
    )
      return "Each screenshot must be smaller than 10 MB.";
  }
  return null;
}
