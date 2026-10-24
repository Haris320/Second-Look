import { InsightsPostView } from "@/components/insights-post";
export const metadata = {
  title: "What real reviewers say about dating profiles | Second Look",
  description: "Recurring patterns from real people reviewing real dating profiles, written and updated by our agent.",
};
export default function InsightsPage() {
  return (
    <main id="main" className="wrap" style={{ maxWidth: 960, paddingTop: 64, paddingBottom: 80 }}>
      <InsightsPostView />
    </main>
  );
}
