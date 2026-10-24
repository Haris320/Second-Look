import { Suspense } from "react";
import { OrderStatus } from "./OrderStatus";

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl px-4 py-12 text-neutral-500">Loading…</main>}>
      <OrderStatus />
    </Suspense>
  );
}
