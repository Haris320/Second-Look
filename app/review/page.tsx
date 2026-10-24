import { ReviewerTask } from "@/components/reviewer-task";
export const metadata = {
  title: "Reviewer workspace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return <main id="main" className="wrap"><ReviewerTask /></main>;
}
