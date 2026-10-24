export type ProfileReport = {
  summary?: string;
  like_count?: number;
  review_count?: number;
  words?: string[];
  top_fixes?: { title: string; description: string }[];
  prompt_feedback?: string;
  prompt_rewrites?: string[];
};
export type AgentReport = {
  version: number;
  review_count: number;
  like: { yes: number; maybe: number; no: number };
  come_across?: { word: string; count: number }[];
  top_fixes?: { fix: string; mentions: number }[];
  prompts?: { works?: { summary: string }; falls_flat?: { summary: string } };
  ai_rewrites?: { prompt: string; rewrite: string }[];
  photos?: {
    position: number;
    avg_score: number;
    best_votes: number;
    worst_votes: number;
  }[];
  lead_photo?: number;
  cut_photo?: number;
};
export function ReportContent({
  report: input,
}: {
  report: ProfileReport | AgentReport;
}) {
  const agent = "version" in input ? input : null;
  const report: ProfileReport = agent
    ? {
        review_count: agent.review_count,
        like_count: agent.like?.yes,
        words: agent.come_across?.map((item) => item.word),
        top_fixes: agent.top_fixes?.map((item) => ({
          title: item.fix,
          description: `${item.mentions} reviewer${item.mentions === 1 ? "" : "s"} mentioned this.`,
        })),
        prompt_feedback: [
          agent.prompts?.works?.summary,
          agent.prompts?.falls_flat?.summary,
        ]
          .filter(Boolean)
          .join(" "),
        prompt_rewrites: agent.ai_rewrites?.map((item) => item.rewrite),
      }
    : (input as ProfileReport);
  return (
    <div className="report-grid">
      {!!agent?.photos?.length && (
        <article className="report-card wide">
          <span className="eyebrow">YOUR PHOTOS</span>
          <h2>What your reviewers noticed.</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PHOTO</th>
                  <th>AVERAGE SCORE</th>
                  <th>BEST PHOTO VOTES</th>
                  <th>SUGGESTION</th>
                </tr>
              </thead>
              <tbody>
                {agent.photos.map((photo) => (
                  <tr key={photo.position}>
                    <td>Photo {photo.position}</td>
                    <td>{photo.avg_score.toFixed(1)} / 10</td>
                    <td>{photo.best_votes}</td>
                    <td>
                      {photo.position === agent.lead_photo
                        ? "Lead with this"
                        : photo.position === agent.cut_photo
                          ? "Consider replacing"
                          : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
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
