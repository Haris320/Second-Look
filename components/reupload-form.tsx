"use client";
import { useState } from "react";
import { ImagePlus, LoaderCircle, AlertCircle } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { IMAGE_TYPES, validateFiles } from "@/lib/uploads";

// Shown on /order/[id] when the AI first read found no dating profile. New screenshots replace the old ones,
// then the first read runs again.
export function ReuploadForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const manifest = files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
      const invalid = validateFiles(manifest);
      if (invalid) throw new Error(invalid);
      const start = await fetch(`/api/orders/${id}/reupload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: manifest }),
      });
      const prepared = await start.json();
      if (!start.ok) throw new Error(prepared.error || "Could not start your upload.");
      // The signed upload token authorizes only this exact object path. No secret key reaches the browser.
      const storage = createClient(prepared.storageUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }).storage.from("screenshots");
      for (let i = 0; i < files.length; i++) {
        const { error: uploadError } = await storage.uploadToSignedUrl(
          prepared.uploads[i].path,
          prepared.uploads[i].token,
          files[i],
          { contentType: files[i].type, upsert: false },
        );
        if (uploadError) throw new Error(`Screenshot ${i + 1} could not upload. Please retry.`);
      }
      const finish = await fetch(`/api/orders/${id}/reupload`, { method: "PUT" });
      const result = await finish.json();
      if (!finish.ok) throw new Error(result.error || "Could not check your uploads.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 20 }}>
      {error && (
        <div className="error-message" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      <input
        type="file"
        multiple
        accept={IMAGE_TYPES.join(",")}
        disabled={busy}
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      <button
        className="button button-coral"
        style={{ marginTop: 12 }}
        disabled={busy || !files.length}
        onClick={() => void submit()}
      >
        {busy ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={15} />} Upload new screenshots
      </button>
    </div>
  );
}
