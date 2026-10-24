import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { REVIEW_OFFER } from "@/lib/tiers";

export default function Home() {
  return (
    <main id="main" className="editorial-home">
      <section className="wrap editorial-hero">
        <div>
          <h1>
            Improve your dating life.
            <br />
            <span>Get your profile reviewed.</span>
          </h1>
          <p className="editorial-intro">
            Upload up to 10 screenshots and get honest feedback on your photos
            and prompts from real people.
          </p>
          <div className="hero-actions">
            <Link href="/order" className="button button-dark">
              Get my profile reviewed <ArrowRight size={17} />
            </Link>
          </div>
          <p className="editorial-small">$15 · 3 reviewers · No subscription</p>
        </div>
        <aside className="review-note">
          <div className="note-heading">
            <span>A SECOND SET OF EYES</span>
            <span>01</span>
          </div>
          <h2>
            The sort of thing
            <br />
            you might hear.
          </h2>
          <div className="note-entry">
            <span>01</span>
            <p>
              “The hiking photo gives me more to ask about than the mirror
              selfie.”
            </p>
          </div>
          <div className="note-entry">
            <span>02</span>
            <p>“I like the joke in your bio. I’d keep that.”</p>
          </div>
          <div className="note-entry">
            <span>03</span>
            <p>“Which person are you in the first photo?”</p>
          </div>
          <p className="note-disclosure">
            Made-up examples to show the kind of feedback.
            <br />
            Your review will come from real people.
          </p>
          <Link href="/example" className="text-link">
            See an example report <ArrowRight size={15} />
          </Link>
        </aside>
      </section>
      <div className="wrap app-note">
        Works with screenshots from Hinge, Bumble, Tinder, or whatever you’re
        using.
      </div>
      <section className="wrap editorial-section" id="how-it-works">
        <div className="editorial-section-heading">
          <span className="section-number">01 / THE PROCESS</span>
          <h2>Here’s how it works.</h2>
        </div>
        <div className="plain-steps">
          {[
            [
              "Send your profile",
              "Upload up to 10 screenshots, including your photos and prompt answers. Put them in the same order as your profile.",
            ],
            [
              "Choose who takes a look",
              "Pick your reviewer audience and pay through Whop. Each person gives their own feedback independently.",
            ],
            [
              "Decide what to change",
              "Read their feedback and the suggested changes. Keep the advice that feels useful. It’s still your profile.",
            ],
          ].map(([title, text], i) => (
            <article key={title}>
              <span className="step-index">{i + 1}.</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="wrap editorial-section" id="pricing">
        <div className="editorial-section-heading">
          <span className="section-number">02 / PICK A REVIEW</span>
          <h2>One review. One price.</h2>
          <p>One payment. No subscription or ongoing commitment.</p>
        </div>
        <div className="single-price">
          <div className="single-price-amount">
            ${REVIEW_OFFER.priceUsd}
            <span>one time</span>
          </div>
          <div>
            <h3>{REVIEW_OFFER.reviews} people review your profile.</h3>
            <ul>
              {[
                "Up to 10 screenshots",
                "Feedback on your photos and prompts",
                "A short list of suggested changes",
              ].map((item) => (
                <li key={item}>
                  <Check size={15} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Link className="button button-dark" href="/order">
            Get my profile reviewed <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="wrap editorial-section editorial-faq">
        <div className="editorial-section-heading">
          <span className="section-number">03 / BEFORE YOU SEND IT</span>
          <h2>
            A few things
            <br />
            worth knowing.
          </h2>
        </div>
        <div className="faq-list">
          {[
            [
              "Who’s looking at my profile?",
              "Human reviewers recruited through Terac. You can choose male or female reviewers in the United States and set their age range. The default is within 7 years of your age, with an 18+ minimum. You’ll get several individual opinions, not one person speaking for everyone.",
            ],
            [
              "What should I upload?",
              "Between 1 and 10 screenshots of your own profile. Include your bio and prompts as well as your photos. JPG, PNG, or WebP, up to 10 MB each.",
            ],
            [
              "Can other people see my screenshots?",
              "Your screenshots aren’t public. Access is limited to your private order and authorized reviewers. Please leave out private messages or other people’s personal information.",
            ],
            [
              "Where does AI come in?",
              "People do the reviewing. AI may help summarize their feedback and suggest prompt rewrites. Those suggestions are labeled separately.",
            ],
            [
              "Will this get me more matches?",
              "We can’t promise that. What we can give you is a few outside perspectives and specific things to try.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="wrap editorial-end">
        <h2>
          Let someone else
          <br />
          take a look.
        </h2>
        <Link href="/order" className="button button-dark">
          Upload my profile <ArrowRight size={17} />
        </Link>
      </section>
    </main>
  );
}
