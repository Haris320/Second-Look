import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="wrap">
      <div className="general-error">
        <p className="eyebrow">A WRONG TURN</p>
        <h1>
          Let’s take
          <br />
          <em>another look.</em>
        </h1>
        <p>We couldn’t find that page.</p>
        <Link className="button button-dark" href="/">
          Back to home
        </Link>
      </div>
    </main>
  );
}
