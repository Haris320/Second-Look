export type ProfileReport = {
  summary?: string;
  like_count?: number;
  review_count?: number;
  words?: string[];
  top_fixes?: { title: string; description: string }[];
  prompt_feedback?: string;
  prompt_rewrites?: string[];
};
export function ReportContent({ report }: { report: ProfileReport }) {
  return (
    <div className="report-grid">
      {report.summary && (
        <article className="report-card wide">
          <span className="eyebrow">THE BIG PICTURE</span>
          <h2>Your first impression</h2>
          <p>{report.summary}</p>
        </article>
      )}
      {typeof report.like_count === "number" &&
        typeof report.review_count === "number" && (
          <article className="report-card">
            <span className="eyebrow">FIRST IMPRESSIONS</span>
            <h2>A reason to say hello.</h2>
            <div className="report-score">
              <div className="score-circle">
                {report.like_count}/{report.review_count}
                <small>REVIEWERS</small>
              </div>
              <p>
                Said they would like
                <br />
                this profile.
              </p>
            </div>
            <p className="caption">
              A small group’s opinions, not a prediction of matches.
            </p>
          </article>
        )}
      {!!report.words?.length && (
        <article className="report-card">
          <span className="eyebrow">HOW YOU COME ACROSS</span>
          <h2>The words that came up.</h2>
          <div className="word-tags">
            {report.words.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
          <p>The personality your reviewers noticed.</p>
        </article>
      )}
      {!!report.top_fixes?.length && (
        <article className="report-card wide">
          <span className="eyebrow">YOUR NEXT MOVES</span>
          <h2>Small changes. A clearer picture.</h2>
          <ol className="fix-list">
            {report.top_fixes.map((fix, i) => (
              <li key={i}>
                <b>0{i + 1}</b>
                <h3>{fix.title}</h3>
                <p>{fix.description}</p>
              </li>
            ))}
          </ol>
        </article>
      )}
      {report.prompt_feedback && (
        <article className="report-card">
          <span className="eyebrow">YOUR PROMPTS</span>
          <h2>Give them something to ask about.</h2>
          <p>{report.prompt_feedback}</p>
        </article>
      )}
      {!!report.prompt_rewrites?.length && (
        <article className="report-card">
          <span className="eyebrow">AI-ASSISTED SUGGESTIONS</span>
          <h2>A starting point. Make it yours.</h2>
          {report.prompt_rewrites.map((text, i) => (
            <blockquote className="report-quote" key={i}>
              “{text}”
            </blockquote>
          ))}
          <p className="caption">
            Generated suggestions, separate from human feedback. Only use
            details that are true to you.
          </p>
        </article>
      )}
    </div>
  );
}
