import { UploadForm } from "@/components/upload-form";
export const metadata = { title: "Upload your profile" };
export default function OrderPage() {
  return (
    <main id="main" className="wrap order-wrap">
      <UploadForm />
    </main>
  );
}
