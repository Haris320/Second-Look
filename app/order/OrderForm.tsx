"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { AUDIENCES, TIERS, type Audience, type Tier } from "@/lib/tiers";

const storage = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
).storage.from("screenshots");

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

// New orders (Flow A) pick a tier and pay after upload. Claimed orders (Flow B) already paid on Whop.
export function OrderForm({ claimed }: { claimed?: { orderId: string; tier: Tier } }) {
  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState<Audience>("women_21_35_us");
  const [tier, setTier] = useState<Tier>(claimed?.tier ?? "quick");
  const [files, setFiles] = useState<File[]>([]);
  const [ownProfile, setOwnProfile] = useState(false);
  const [adult, setAdult] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const busy = status !== "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (files.length < 3 || files.length > 8) throw new Error("Choose 3 to 8 screenshots.");
      setStatus("Creating your order…");
      const orderId = claimed
        ? claimed.orderId
        : (await post("/api/orders", { email, audience, tier, ownProfile, adult })).orderId;

      setStatus("Preparing uploads…");
      const { uploads } = await post(`/api/orders/${orderId}/uploads`, {
        types: files.map((file) => file.type),
        audience,
      });
      for (const [index, upload] of uploads.entries()) {
        setStatus(`Uploading screenshot ${index + 1} of ${files.length}…`);
        const { error } = await storage.uploadToSignedUrl(upload.path, upload.token, files[index], {
          contentType: files[index].type,
        });
        if (error) throw new Error("An upload failed. Check your connection and try again.");
      }

      setStatus(claimed ? "Sending your profile to reviewers…" : "Opening secure checkout…");
      const { next } = await post(`/api/orders/${orderId}/finalize`);
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setStatus("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      {!claimed && (
        <label className="block">
          <span className="font-medium">Email</span>
          <span className="block text-sm text-neutral-500">We send your report link here.</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
      )}

      <fieldset>
        <legend className="font-medium">Who should review your profile?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.keys(AUDIENCES) as Audience[]).map((key) => (
            <label key={key} className={`cursor-pointer rounded-lg border px-4 py-3 ${audience === key ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"}`}>
              <input type="radio" name="audience" className="sr-only" checked={audience === key} onChange={() => setAudience(key)} />
              {AUDIENCES[key]}
            </label>
          ))}
        </div>
      </fieldset>

      {!claimed && (
        <fieldset>
          <legend className="font-medium">Package</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(Object.keys(TIERS) as Tier[]).map((key) => (
              <label key={key} className={`cursor-pointer rounded-lg border px-4 py-3 ${tier === key ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"}`}>
                <input type="radio" name="tier" className="sr-only" checked={tier === key} onChange={() => setTier(key)} />
                <span className="block font-medium">{TIERS[key].name}</span>
                <span className="block text-sm text-neutral-500">
                  {TIERS[key].reviews} reviews · ${TIERS[key].priceUsd}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block">
        <span className="font-medium">Profile screenshots (3–8)</span>
        <span className="block text-sm text-neutral-500">
          Photos and prompts from Hinge, Bumble, Tinder or any app, in the order they appear.
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mt-2 block w-full text-sm"
        />
        {files.length > 0 && <span className="mt-1 block text-sm text-neutral-500">{files.length} selected</span>}
      </label>

      <div className="space-y-2">
        <label className="flex gap-2">
          <input type="checkbox" required checked={ownProfile} onChange={(e) => setOwnProfile(e.target.checked)} />
          <span>This is my own profile.</span>
        </label>
        <label className="flex gap-2">
          <input type="checkbox" required checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>I am 18 or older.</span>
        </label>
      </div>

      <p className="text-sm text-neutral-500">
        Your screenshots are stored privately and shown only to your reviewers. They&apos;re deleted as soon as your report is delivered.
      </p>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {busy ? status : claimed ? "Send to reviewers" : `Continue to payment · $${TIERS[tier].priceUsd}`}
      </button>
    </form>
  );
}
