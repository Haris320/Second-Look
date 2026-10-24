import Link from "next/link";
import { ArrowUpRight, ScanEye } from "lucide-react";
export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Second Look home">
        <span className="brand-mark">
          <ScanEye size={24} strokeWidth={1.8} />
        </span>
        second look<span className="brand-dot">.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/example">Example review</Link>
        <Link href="/#pricing">Pricing</Link>
        <Link href="/refer">Refer & earn $3</Link>
      </nav>
      <Link className="button button-dark header-cta" href="/order">
        Get reviewed <ArrowUpRight size={16} />
      </Link>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <Link href="/" className="brand small">
          second look<span className="brand-dot">.</span>
        </Link>
        <p>Honest feedback on your dating profile.</p>
      </div>
      <div className="footer-right">
        <span>Reviewed by people.</span>
        <span>Independent of Hinge, Bumble, and Tinder.</span>
        <div>
          <Link href="/refer">Refer & earn $3</Link>
          <Link href="/review">Reviewer portal</Link>
          <Link href="/dashboard">Team dashboard</Link>
        </div>
      </div>
    </footer>
  );
}
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="eyebrow">
      <span />
      {children}
    </p>
  );
}
