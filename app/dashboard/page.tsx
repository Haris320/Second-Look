import { Dashboard } from "@/components/dashboard";
export const metadata = {
  title: "Team dashboard",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="wrap">
      <Dashboard />
    </main>
  );
}
