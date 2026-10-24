import { Suspense } from "react";
import { OrderStatus } from "@/components/order-status";
export const metadata = {
  title: "Your review",
  robots: { index: false, follow: false },
};
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderStatus id={id} />;
}
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main id="main" className="wrap">
      <Suspense
        fallback={<div className="loading-panel">Loading your review…</div>}
      >
        <Content params={params} />
      </Suspense>
    </main>
  );
}
