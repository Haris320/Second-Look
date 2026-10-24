"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  ImagePlus,
  LockKeyhole,
  LoaderCircle,
  Plus,
  X,
  Users,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { IMAGE_TYPES, MAX_SCREENSHOTS, validateFiles } from "@/lib/uploads";
import {
  recommendedAges,
  validAge,
  reviewerPreferenceError,
  type ReviewerGender,
} from "@/lib/audience";
import { REVIEW_OFFER } from "@/lib/tiers";
type Shot = { id: string; file: File; url: string };
type Prepared = {
  orderId: string;
  uploads: { path: string; token: string }[];
  storageUrl: string;
};
export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const busyRef = useRef(false);
  const prepared = useRef<Prepared | null>(null);
  const uploaded = useRef(new Set<number>());
  const [shots, setShots] = useState<Shot[]>([]);
  const [step, setStep] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [email, setEmail] = useState("");
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [userAge, setUserAge] = useState("");
  const [reviewerGender, setReviewerGender] = useState<ReviewerGender>("women");
  const [reviewerMinAge, setReviewerMinAge] = useState("");
  const [reviewerMaxAge, setReviewerMaxAge] = useState("");
  function applyRecommendedAge(value: string) {
    if (validAge(Number(value))) {
      const range = recommendedAges(Number(value));
      setReviewerMinAge(String(range.min));
      setReviewerMaxAge(String(range.max));
    }
  }
  const [ownProfile, setOwn] = useState(false);
  const [adult, setAdult] = useState(false);
  const [zoom, setZoom] = useState<Shot | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const current = urls.current;
    return () => current.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  async function addFiles(list: FileList | File[]) {
    if (busyRef.current || prepared.current) return;
    const incoming = Array.from(list);
    if (shots.length + incoming.length > MAX_SCREENSHOTS) {
      setError(
        "You can upload up to 10 screenshots. Remove one before adding more.",
      );
      return;
    }
    const validation = validateFiles(incoming);
    if (validation) {
      setError(validation);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const additions: Shot[] = [];
    try {
      for (const file of incoming) {
        const bitmap = await createImageBitmap(file);
        const pixels = bitmap.width * bitmap.height;
        bitmap.close();
        if (pixels > 40_000_000)
          throw new Error("Please use screenshots smaller than 40 megapixels.");
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        additions.push({ id: crypto.randomUUID(), file, url });
      }
      setShots((prev) => [...prev, ...additions]);
    } catch (e) {
      additions.forEach((s) => {
        URL.revokeObjectURL(s.url);
        urls.current.delete(s.url);
      });
      setError(
        e instanceof Error && e.message.includes("megapixels")
          ? e.message
          : "One of those files could not be opened as an image. Try a JPG, PNG, or WebP screenshot.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function remove(id: string) {
    const shot = shots.find((s) => s.id === id);
    if (shot) {
      URL.revokeObjectURL(shot.url);
      urls.current.delete(shot.url);
    }
    setShots((prev) => prev.filter((s) => s.id !== id));
    setError("");
  }
  function move(index: number, direction: number) {
    setShots((prev) => {
      const next = [...prev];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const preferenceError = reviewerPreferenceError({
      userAge: Number(userAge),
      reviewerGender,
      reviewerMinAge: Number(reviewerMinAge),
      reviewerMaxAge: Number(reviewerMaxAge),
    });
    if (preferenceError) {
      setError(preferenceError);
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (!prepared.current) {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            userAge: Number(userAge),
            reviewerGender,
            reviewerMinAge: Number(reviewerMinAge),
            reviewerMaxAge: Number(reviewerMaxAge),
            ownProfile,
            adult,
            files: shots.map((s) => ({
              name: s.file.name,
              type: s.file.type,
              size: s.file.size,
            })),
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not create your order.");
        prepared.current = result;
        setSavedOrderId(result.orderId);
      }
      const order = prepared.current!;
      // The signed upload token authorizes only this exact object path. No secret key reaches the browser.
      const storage = createClient(
        order.storageUrl,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      ).storage.from("screenshots");
      for (let i = 0; i < shots.length; i++) {
        if (!uploaded.current.has(i)) {
          const { error: uploadError } = await storage.uploadToSignedUrl(
            order.uploads[i].path,
            order.uploads[i].token,
            shots[i].file,
            { contentType: shots[i].file.type, upsert: false },
          );
          if (uploadError)
            throw new Error(
              `Screenshot ${i + 1} could not upload. Check your connection and retry; completed uploads will be kept.`,
            );
          uploaded.current.add(i);
        }
        setProgress(Math.round(((i + 1) / shots.length) * 100));
      }
      const response = await fetch(`/api/orders/${order.orderId}/complete`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not verify your uploads.");
      router.push(`/order/${order.orderId}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="order-layout">
      <div className="upload-main">
        <div className="stepper">
          <span className={step === 1 ? "active" : "complete"}>
            <b>{step > 1 ? <Check size={14} /> : 1}</b> Your profile
          </span>
          <i />
          <span className={step === 2 ? "active" : ""}>
            <b>2</b> Review details
          </span>
          <i />
          <span>
            <b>3</b> Checkout
          </span>
        </div>
        <div className="upload-title">
          <p className="eyebrow">YOUR PROFILE</p>
          <h1>
            {step === 1 ? (
              <>
                Your profile.
                <br />
                <em>Let’s take a look.</em>
              </>
            ) : (
              <>
                Who should take
                <br />
                <em>a second look?</em>
              </>
            )}
          </h1>
          <p>
            {step === 1
              ? "Add your photos and prompts in the order they appear on your dating profile."
              : "Choose your reviewers and tell us where to send your results."}
          </p>
        </div>
        {step === 1 ? (
          <>
            <div
              className={`drop-zone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void addFiles(e.dataTransfer.files);
              }}
            >
              <span className="upload-icon">
                <ImagePlus size={30} strokeWidth={1.4} />
              </span>
              <h2>Drop your screenshots here</h2>
              <p>or choose them from your device</p>
              <button
                className="button button-dark"
                disabled={busy || shots.length === 10}
                onClick={() => input.current?.click()}
              >
                <Plus size={17} /> Choose screenshots
              </button>
              <span className="file-hint">
                JPG, PNG or WebP · Up to 10 MB each · 10 max
              </span>
              <input
                ref={input}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                multiple
                className="visually-hidden"
                aria-label="Choose screenshots"
                onChange={(e) => {
                  if (e.target.files?.length) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="shots-heading">
              <strong>
                Your screenshots <span>{shots.length}/10</span>
              </strong>
              {shots.length > 0 && (
                <span>Use the arrows to match your profile order</span>
              )}
            </div>
            {shots.length > 0 ? (
              <div className="screenshot-grid">
                {shots.map((shot, i) => (
                  <div className="screenshot-item" key={shot.id}>
                    <button
                      className="screenshot-preview"
                      aria-label={`Preview screenshot ${i + 1}`}
                      onClick={() => {
                        setZoom(shot);
                        dialog.current?.showModal();
                      }}
                    >
                      <Image
                        src={shot.url}
                        alt={`Screenshot ${i + 1}`}
                        fill
                        unoptimized
                        sizes="160px"
                      />
                    </button>
                    <span className="screenshot-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <button
                      className="remove-shot"
                      disabled={busy}
                      aria-label={`Remove screenshot ${i + 1}`}
                      onClick={() => remove(shot.id)}
                    >
                      <X size={14} />
                    </button>
                    <div className="shot-controls">
                      <span title={shot.file.name}>{shot.file.name}</span>
                      <button
                        disabled={i === 0 || busy}
                        aria-label={`Move screenshot ${i + 1} earlier`}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        disabled={i === shots.length - 1 || busy}
                        aria-label={`Move screenshot ${i + 1} later`}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {shots.length < 10 && (
                  <button
                    className="add-shot"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                  >
                    <Plus size={24} />
                    <span>Add another</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="empty-photos">
                <ImagePlus size={17} />
                <span>
                  Your screenshots will appear here. Nothing is uploaded until
                  you save.
                </span>
              </div>
            )}
            <div className="upload-tip">
              <span>↗</span>
              <p>
                <strong>A little tip:</strong> Include your bio and prompts, not
                just your photos. The full picture helps people give better
                feedback.
              </p>
            </div>
            {error && (
              <div className="error-message" role="alert">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
            <div className="form-bottom">
              <span>
                <LockKeyhole size={14} /> Your profile stays private.
                Screenshots are deleted after your report is delivered.
              </span>
              <button
                className="button button-coral"
                disabled={!shots.length || busy}
                onClick={() => {
                  setError("");
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Continue <ArrowRight size={18} />
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <fieldset
              disabled={busy || !!savedOrderId}
              className="details-fieldset"
            >
              <label className="field-label" htmlFor="email">
                Your email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="field-help">
                For updates about your review. No public profile is created.
              </p>
              <label className="field-label" htmlFor="user-age">
                Your age
              </label>
              <input
                id="user-age"
                type="number"
                inputMode="numeric"
                min={18}
                max={120}
                step={1}
                required
                placeholder="e.g. 28"
                value={userAge}
                onChange={(e) => {
                  setUserAge(e.target.value);
                  applyRecommendedAge(e.target.value);
                }}
                aria-describedby="age-help"
              />
              <p className="field-help" id="age-help">
                We suggest reviewers within 7 years of your age. All reviewers
                must be 18 or older.
              </p>
              <p className="field-help">
                Who’s reviewing: real people recruited through Terac who match
                the reviewers you choose here. Every review in your report comes
                from one of them.
              </p>
              <label className="field-label" htmlFor="reviewer-gender">
                Reviewer gender
              </label>
              <select
                id="reviewer-gender"
                value={reviewerGender}
                onChange={(e) =>
                  setReviewerGender(e.target.value as ReviewerGender)
                }
              >
                <option value="women">Female</option>
                <option value="men">Male</option>
              </select>
              <div className="reviewer-age-fields">
                <div>
                  <label className="field-label" htmlFor="reviewer-min-age">
                    Minimum reviewer age
                  </label>
                  <input
                    id="reviewer-min-age"
                    type="number"
                    inputMode="numeric"
                    min={18}
                    max={reviewerMaxAge || 120}
                    step={1}
                    required
                    value={reviewerMinAge}
                    onChange={(e) => setReviewerMinAge(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="reviewer-max-age">
                    Maximum reviewer age
                  </label>
                  <input
                    id="reviewer-max-age"
                    type="number"
                    inputMode="numeric"
                    min={reviewerMinAge || 18}
                    max={120}
                    step={1}
                    required
                    value={reviewerMaxAge}
                    onChange={(e) => setReviewerMaxAge(e.target.value)}
                  />
                </div>
              </div>
              <p className="field-help">
                Adjust these if you prefer. Reviewers are based in the United
                States.
              </p>
              <button
                type="button"
                className="text-link age-reset"
                disabled={!validAge(Number(userAge))}
                onClick={() => applyRecommendedAge(userAge)}
              >
                Use recommended ages
              </button>
              <div className="standard-offer">
                <strong>3 independent reviewers</strong>
                <span>$15, one time</span>
              </div>
              <div className="consents">
                <label>
                  <input
                    type="checkbox"
                    checked={ownProfile}
                    required
                    onChange={(e) => setOwn(e.target.checked)}
                  />
                  <span>
                    This is my own dating profile, and I agree to share these
                    screenshots with reviewers.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={adult}
                    required
                    onChange={(e) => setAdult(e.target.checked)}
                  />
                  <span>I am 18 or older.</span>
                </label>
              </div>
            </fieldset>
            {busy && (
              <div className="upload-progress" aria-live="polite">
                <div>
                  <LoaderCircle className="spin" size={16} />
                  {progress === 100
                    ? "Checking your screenshots…"
                    : `Saving your screenshots… ${progress}%`}
                </div>
                <progress max="100" value={progress} />
              </div>
            )}
            {error && (
              <div className="error-message" role="alert">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
            <div className="form-bottom">
              <button
                type="button"
                className="text-link"
                disabled={busy || !!savedOrderId}
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                className="button button-coral"
                type="submit"
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <LockKeyhole size={16} />
                )}{" "}
                {savedOrderId ? "Retry upload" : "Save & review order"}{" "}
                <ArrowRight size={17} />
              </button>
            </div>
            <p className="caption text-right">
              You won’t be charged until you complete Whop checkout.
            </p>
            {savedOrderId && error && (
              <Link href={`/order/${savedOrderId}`} className="text-link">
                View or delete this draft <ArrowRight size={15} />
              </Link>
            )}
          </form>
        )}
      </div>
      <aside className="order-sidebar">
        <div className="summary-card">
          <span className="mini-tag">YOUR SECOND LOOK</span>
          <h3>
            A few honest opinions
            <br />
            can help.
          </h3>
          <div className="summary-illustration">
            <Image
              src="/profile-illustration.svg"
              alt=""
              width={95}
              height={114}
            />
            <span>
              <MessageBubble />
              “I’d keep
              <br />
              that photo.”
            </span>
          </div>
          <ul>
            <li>
              <Users size={18} />
              <div>
                <strong>Independent reviewers</strong>
                <span>{REVIEW_OFFER.reviews} independent human reviewers</span>
              </div>
            </li>
            <li>
              <ImagePlus size={18} />
              <div>
                <strong>Photos and prompts</strong>
                <span>Photos, prompts, and first impressions</span>
              </div>
            </li>
            <li>
              <ShieldCheck size={18} />
              <div>
                <strong>Useful feedback</strong>
                <span>Feedback to help, never to tear down</span>
              </div>
            </li>
          </ul>
          <div className="summary-total">
            <span>{REVIEW_OFFER.name}</span>
            <strong>
              ${REVIEW_OFFER.priceUsd}
              <small> one time</small>
            </strong>
          </div>
        </div>
        <div className="privacy-note">
          <LockKeyhole size={17} />
          <p>
            Your screenshots are stored privately. Only your order session and
            authorized reviewers can access them.
          </p>
        </div>
        <Link href="/example" className="text-link sidebar-link">
          What will my review look like?{" "}
          <ArrowUp size={15} style={{ transform: "rotate(45deg)" }} />
        </Link>
      </aside>
      <dialog
        ref={dialog}
        className="image-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <button
          aria-label="Close image preview"
          className="dialog-close"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        {zoom && (
          <Image
            src={zoom.url}
            width={800}
            height={1000}
            unoptimized
            alt="Expanded screenshot"
          />
        )}
      </dialog>
    </div>
  );
}
function MessageBubble() {
  return <span className="mini-quote">✦</span>;
}
