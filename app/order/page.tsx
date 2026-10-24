import { Suspense } from "react";
import { UploadForm } from "@/components/upload-form";
import { isAudience, isTier } from "@/lib/tiers";
export const metadata = { title: "Upload your profile" };
async function SelectedPackage({ searchParams }: { searchParams: Promise<{ tier?: string; audience?: string }> }) {
  const { tier, audience } = await searchParams;
  return <UploadForm initialTier={isTier(tier) ? tier : "quick"} initialAudience={isAudience(audience) ? audience : undefined} />;
}
export default function OrderPage({ searchParams }: { searchParams: Promise<{ tier?: string; audience?: string }> }) {
  return <main id="main" className="wrap order-wrap"><Suspense fallback={<p>Loading your review options…</p>}><SelectedPackage searchParams={searchParams} /></Suspense></main>;
}
