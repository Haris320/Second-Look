// Pure policy logic: model output is evidence, never permission to skip a check.
export type ScreenshotCheck = {
  position: number;
  verdict: "profile" | "unrelated" | "explicit" | "uncertain";
  reason: string;
};
export type QualityEvidence = {
  is_dating_profile: boolean;
  explicit_content: boolean;
  appears_under_18: boolean;
  screenshot_checks: ScreenshotCheck[];
};
export type QualityDecision = {
  status: "paid" | "needs_reupload" | "held";
  reason: string;
};
export function decideProfileQuality(
  read: QualityEvidence,
  expectedPositions: number[],
): QualityDecision {
  const checks = read?.screenshot_checks;
  if (
    !read ||
    typeof read.is_dating_profile !== "boolean" ||
    typeof read.explicit_content !== "boolean" ||
    typeof read.appears_under_18 !== "boolean" ||
    !Array.isArray(checks) ||
    checks.some((c) => !c || typeof c !== "object") ||
    !expectedPositions.length ||
    checks.length !== expectedPositions.length ||
    new Set(checks.map((c) => c.position)).size !== expectedPositions.length ||
    checks.some(
      (c) =>
        !expectedPositions.includes(c.position) ||
        !["profile", "unrelated", "explicit", "uncertain"].includes(
          c.verdict,
        ) ||
        typeof c.reason !== "string",
    )
  ) {
    return {
      status: "held",
      reason:
        "The quality check did not verify every screenshot. No files were released to reviewers.",
    };
  }
  const explicit = checks.filter((c) => c.verdict === "explicit");
  if (read.explicit_content || explicit.length) {
    return {
      status: "held",
      reason: `Nudity or explicit sexual content flagged${explicit.length ? ` in screenshot(s) ${explicit.map((c) => c.position).join(", ")}` : ""}. No files were released to reviewers.`,
    };
  }
  if (read.appears_under_18)
    return {
      status: "held",
      reason:
        "Possible under-18 profile flagged. No files were released to reviewers.",
    };
  const rejected = checks.filter((c) => c.verdict !== "profile");
  if (!read.is_dating_profile || rejected.length) {
    return {
      status: "needs_reupload",
      reason: rejected.length
        ? `Please replace screenshot(s) ${rejected.map((c) => c.position).join(", ")}: they are unrelated to a dating profile or could not be confidently checked.`
        : "Please upload screenshots that clearly show your dating profile, including its photos, bio, or prompts.",
    };
  }
  return {
    status: "paid",
    reason: `Quality check passed for all ${checks.length} screenshots: dating-profile content, no nudity or explicit sexual content flagged.`,
  };
}
