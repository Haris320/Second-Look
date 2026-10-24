import Link from "next/link";
import { TIERS, type Tier } from "@/lib/tiers";

const STEPS = [
  ["Upload", "Add 3–8 screenshots of your profile and pick who should review it."],
  ["Real people review it", "Strangers who match your audience rate your photos and prompts and suggest one change each."],
  ["Get your report", "Like rate, photo ranking, what's working, what isn't, and your top three fixes."],
];

const FAQ = [
  ["Who reviews my profile?", "Real adults recruited through Terac who match the audience you choose, for example women 21–35 in the US. Every review in your report comes from a real person; we check each one for quality before it counts."],
  ["How fast is it?", "Reviews start as soon as reviewers arrive, and most reports are ready in about an hour."],
  ["What happens to my screenshots?", "They're stored privately, shown only to your reviewers on our review page, and deleted as soon as your report is delivered."],
  ["Which apps does it work with?", "Hinge, Bumble, and Tinder profiles, or any other app. Second Look is an independent service and isn't affiliated with any dating app."],
  ["Is the feedback harsh?", "Reviewers are asked to be kind but honest. Rude or abusive comments are filtered out before anything reaches you."],
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">Second Look</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
        Find out what real people think of your dating profile
      </h1>
      <p className="mt-4 text-lg text-neutral-600">
        Friends are too nice and the apps never tell you why. Get honest ratings of your photos and prompts from real strangers in your target audience.
      </p>
      <Link href="/order" className="mt-8 inline-block rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white">
        Get reviewed
      </Link>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {STEPS.map(([title, text], i) => (
          <div key={title}>
            <p className="text-sm text-neutral-500">{i + 1}</p>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-neutral-600">{text}</p>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">Pricing</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {(Object.keys(TIERS) as Tier[]).map((key) => (
            <div key={key} className="rounded-xl border border-neutral-200 p-6">
              <h3 className="font-semibold">{TIERS[key].name}</h3>
              <p className="mt-2 text-3xl font-semibold">${TIERS[key].priceUsd}</p>
              <p className="mt-1 text-neutral-600">{TIERS[key].reviews} real reviews</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">Questions</h2>
        <dl className="mt-6 space-y-6">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1 text-neutral-600">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-16 rounded-xl bg-neutral-50 p-8 text-center">
        <p className="text-lg font-medium">Ready for an honest second look?</p>
        <Link href="/order" className="mt-4 inline-block rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white">
          Get reviewed
        </Link>
      </div>
    </main>
  );
}
