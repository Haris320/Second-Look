// Calls the production reconcile route on a loop. Vercel Hobby crons only run daily, so run this on a
// laptop next to the deployed site during the event:
//   node --env-file=.env.local scripts/reconcile-loop.mjs [minutes]
// Needs PUBLIC_BASE_URL and CRON_SECRET. Prints one line per run; never prints the secret.
const minutes = Number(process.argv[2] ?? 3);
const base = process.env.PUBLIC_BASE_URL;
const secret = process.env.CRON_SECRET;
if (!base || !secret) {
  console.error("PUBLIC_BASE_URL and CRON_SECRET are required (use --env-file=.env.local)");
  process.exit(1);
}
async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(new URL("/api/agent/reconcile", base), {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(290_000),
    });
    const body = await res.json().catch(() => ({}));
    const brief = {
      recruited: body.recruited?.length ?? 0, feedback: body.feedback?.length ?? 0, events: body.events?.length ?? 0,
      reports: body.reports?.length ?? 0, freed: body.freed?.length ?? 0, attention: body.attention?.length ?? 0,
      errors: body.errors?.length ?? 0, balance: body.balanceDollars,
    };
    console.log(new Date().toISOString(), res.status, JSON.stringify(brief), `${Date.now() - started}ms`);
    for (const line of [...(body.errors ?? []), ...(body.attention ?? []).map((a) => `${a.step}/${a.choice}: ${a.reason}`)]) console.log("   ", line);
    for (const f of body.feedback ?? []) console.log("    feedback", JSON.stringify(f));
    for (const r of body.reports ?? []) console.log("    report", JSON.stringify(r));
  } catch (e) {
    console.log(new Date().toISOString(), "request failed:", e instanceof Error ? e.message : String(e));
  }
}
await tick();
setInterval(tick, minutes * 60_000);
