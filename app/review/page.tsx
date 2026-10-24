import { ReviewerPreview } from "@/components/reviewer-preview";
export const metadata = {
  title: "Reviewer workspace",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="wrap">
      <ReviewerPreview />
    </main>
  );
}
