"use client";

import { useState } from "react";
import Link from "next/link";
import { OrderForm } from "../order/OrderForm";
import type { Tier } from "@/lib/tiers";

// Flow B: bought on the Whop marketplace. Find the payment by email, then upload.
export default function StartPage() {
  const [email, setEmail] = useState("");
  const [claimed, setClaimed] = useState<{ orderId: string; tier: Tier } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function findOrder(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/orders/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setClaimed(data);
    else setError(data.error ?? "Something went wrong. Try again.");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-neutral-500">← Second Look</Link>
      <h1 className="mt-4 text-3xl font-semibold">Thanks for your purchase</h1>
      {claimed ? (
        <>
          <p className="mt-2 text-neutral-600">Payment found. Now add your screenshots and choose your reviewers.</p>
          <div className="mt-10">
            <OrderForm claimed={claimed} />
          </div>
        </>
      ) : (
        <form onSubmit={findOrder} className="mt-10 space-y-4">
          <label className="block">
            <span className="font-medium">The email you paid with on Whop</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-60">
            {busy ? "Looking up your payment…" : "Continue"}
          </button>
        </form>
      )}
    </main>
  );
}
