import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import { ReportContent } from "@/components/report-content";
export const metadata = { title: "Example review" };
export default function Example() {
  return (
    <main id="main" className="wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">A PEEK INSIDE</p>
          <h1>
            This is what a<br />
            <em>second look looks like.</em>
          </h1>
          <p>Specific feedback. A few fresh ideas. A clear place to start.</p>
        </div>
        <Link href="/order" className="button button-coral">
          Get your own review <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="notice">
        <Info size={17} /> Illustrative example only. These sample responses and
        numbers are not real reviewer submissions or customer results.
      </div>
      <ReportContent
        report={{
          summary:
            "Your profile feels warm and approachable. The biggest opportunity is making your interests more specific, so someone has a natural reason to start a conversation.",
          like_count: 2,
          review_count: 3,
          top_fixes: [
            {
              title: "Lead with your clearest photo",
              description:
                "Put the well-lit, solo photo first. Save group shots for later so people immediately know who they’re looking at.",
            },
            {
              title: "Let an interest get specific",
              description:
                "“I love food” is a start. Your favorite neighborhood dumpling spot tells a story and gives someone a question to ask.",
            },
            {
              title: "Show another side of you",
              description:
                "If several photos feel similar, swap one for a hobby or activity you enjoy. Give your profile a little more range.",
            },
          ],
          prompt_feedback:
            "A playful, specific answer gives people something to respond to. Keep the humor, and replace a broad list of interests with one memorable detail.",
          reviews: [
            {
              like: "yes",
              works: "The hiking photo is the strongest one: good light, you're clearly the person in it, and it gives me something to ask about.",
              changes: "I'd move the group photo out of the first slot. It took me a second to work out which person you are.",
              prompts: "The bio joke landed. The 'I love food' line is the one I'd make more specific.",
            },
          ],
        }}
      />
    </main>
  );
}
