"use client";
import Image from "next/image";
import { useState } from "react";
import { Info, Send } from "lucide-react";
export function ReviewerPreview() {
  const [choice, setChoice] = useState("");
  const [score, setScore] = useState("7");
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE REVIEWER WORKSPACE</p>
          <h1>
            Your perspective
            <br />
            <em>makes a difference.</em>
          </h1>
          <p>
            Be specific, be honest, and be kind. Help someone’s personality come
            through.
          </p>
        </div>
      </div>
      <div className="notice">
        <Info size={17} /> Interface preview. Open your assigned task from Terac
        to review a real profile. Live assignments and submissions are not
        connected yet.
      </div>
      <div className="review-layout">
        <div className="review-placeholder">
          <Image
            src="/profile-illustration.svg"
            alt="Illustrative profile, not a customer screenshot"
            width={300}
            height={360}
          />
          <p>Example illustration · No customer profile is shown</p>
        </div>
        <form
          className="panel review-form"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(
              "Preview complete. Nothing was submitted or sent to Terac.",
            );
          }}
        >
          <h2>A thoughtful first impression.</h2>
          <label>Would you like this profile?</label>
          <div
            className="choice-buttons"
            role="group"
            aria-label="First impression"
          >
            {["Yes", "Maybe", "No"].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={choice === c}
                className={choice === c ? "selected" : ""}
                onClick={() => setChoice(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <label htmlFor="rating" className="range-label">
            Photo impression <span>{score}/10</span>
          </label>
          <input
            type="range"
            id="rating"
            min="1"
            max="10"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
          <label htmlFor="works">What works well?</label>
          <textarea
            id="works"
            required
            placeholder="Mention a specific photo or prompt and explain why it works."
          />
          <label htmlFor="change">What’s one thing they could change?</label>
          <textarea
            id="change"
            required
            placeholder="Offer one practical, constructive suggestion."
          />
          <label htmlFor="words">Describe the impression in three words</label>
          <input
            type="text"
            id="words"
            required
            placeholder="For example: warm, curious, easygoing"
          />
          <button className="button button-dark" disabled={!choice}>
            <Send size={15} /> Try the feedback form
          </button>
          {message && (
            <p
              className="notice"
              role="status"
              style={{ marginTop: 16, marginBottom: 0 }}
            >
              {message}
            </p>
          )}
        </form>
      </div>
    </>
  );
}
