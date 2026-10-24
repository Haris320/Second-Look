import type { Metadata } from "next";
import Link from "next/link";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = { title: "Get reviewed · Second Look" };

export default function OrderPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-neutral-500">← Second Look</Link>
      <h1 className="mt-4 text-3xl font-semibold">Get your profile reviewed</h1>
      <p className="mt-2 text-neutral-600">Upload your screenshots, choose your reviewers, and pay securely on Whop.</p>
      <div className="mt-10">
        <OrderForm />
      </div>
    </main>
  );
}
