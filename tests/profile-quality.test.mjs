import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const js = ts.transpileModule(
  fs.readFileSync(
    new URL("../lib/profile-quality.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const { decideProfileQuality } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const safe = () => ({
  is_dating_profile: true,
  explicit_content: false,
  appears_under_18: false,
  screenshot_checks: [
    { position: 1, verdict: "profile", reason: "Profile UI" },
    { position: 2, verdict: "profile", reason: "Prompt screenshot" },
  ],
});
test("all screenshots must pass", () =>
  assert.equal(decideProfileQuality(safe(), [1, 2]).status, "paid"));
for (const verdict of ["unrelated", "uncertain", "explicit"])
  test(`one ${verdict} image blocks a mixed upload`, () => {
    const r = safe();
    r.screenshot_checks[1].verdict = verdict;
    const d = decideProfileQuality(r, [1, 2]);
    assert.equal(d.status, verdict === "explicit" ? "held" : "needs_reupload");
    assert.match(d.reason, /2/);
  });
test("explicit flag cannot be overridden by per-image passes", () =>
  assert.equal(
    decideProfileQuality({ ...safe(), explicit_content: true }, [1, 2]).status,
    "held",
  ));
test("possible minor is held", () =>
  assert.equal(
    decideProfileQuality({ ...safe(), appears_under_18: true }, [1, 2]).status,
    "held",
  ));
test("no profile context requires new screenshots", () =>
  assert.equal(
    decideProfileQuality({ ...safe(), is_dating_profile: false }, [1, 2])
      .status,
    "needs_reupload",
  ));
test("missing, duplicated, invented, and unknown verdicts fail closed", () => {
  for (const checks of [
    [],
    [safe().screenshot_checks[0]],
    [safe().screenshot_checks[0], safe().screenshot_checks[0]],
    [
      ...safe().screenshot_checks.slice(0, 1),
      { position: 9, verdict: "profile", reason: "" },
    ],
    [
      ...safe().screenshot_checks.slice(0, 1),
      { position: 2, verdict: "approved", reason: "" },
    ],
  ])
    assert.equal(
      decideProfileQuality({ ...safe(), screenshot_checks: checks }, [1, 2])
        .status,
      "held",
    );
});

test("malformed evidence fails closed", () => {
  for (const read of [
    null,
    { ...safe(), explicit_content: undefined },
    { ...safe(), screenshot_checks: [null, safe().screenshot_checks[1]] },
  ]) {
    assert.equal(decideProfileQuality(read, [1, 2]).status, "held");
  }
});
