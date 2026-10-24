import Link from "next/link";
import { LockKeyhole, ArrowRight } from "lucide-react";
export const metadata = { title: "Welcome to Second Look" };
export default function Page() {
  return (
    <main id="main" className="wrap">
      <section className="auth-panel">
        <div className="status-icon">
          <LockKeyhole size={25} />
        </div>
        <h1>
          Already got
          <br />
          <em>your second look?</em>
        </h1>
        <p>
          If you paid on Whop, keep your receipt. Secure purchase linking is
          still being connected; entering an email alone won’t unlock a paid
          order.
        </p>
        <p>
          If you uploaded through this website, return to your order page in the
          same browser. Don’t create a second purchase.
        </p>
        <Link className="text-link" href="/">
          Back to Second Look <ArrowRight size={15} />
        </Link>
      </section>
    </main>
  );
}
