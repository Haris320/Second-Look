"use client";
import { useState, useEffect, useCallback } from "react";
import { LockKeyhole, RefreshCw, LoaderCircle } from "lucide-react";
type Data = {
  orders: {
    id: string;
    tier: string;
    status: string;
    reviews_done: number;
    review_target: number;
    amount_cents: number | null;
    created_at: string;
  }[];
  decisions: {
    id: string;
    step: string;
    choice: string;
    reason: string;
    created_at: string;
  }[];
};
export function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      if (r.status === 401) {
        setData(null);
        return;
      }
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body);
    } catch {
      setError("Could not load dashboard data. Please retry.");
    }
  }, []);
  // Fetch completion updates state asynchronously; this effect subscribes to external data.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setPassword("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <form className="auth-panel" onSubmit={login}>
        <div className="status-icon">
          <LockKeyhole size={24} />
        </div>
        <h1>Behind the scenes.</h1>
        <p>
          The Second Look team dashboard. Sign in to see orders, review
          progress, and the decision log.
        </p>
        <label className="field-label" htmlFor="password">
          Team password
        </label>
        <input
          type="password"
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        <button className="button button-dark" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <LockKeyhole size={15} />
          )}{" "}
          Open dashboard
        </button>
      </form>
    );
  const paid = data.orders.filter((o) => o.status !== "pending_payment");
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEAM WORKSPACE</p>
          <h1>
            The bigger <em>picture.</em>
          </h1>
          <p>
            Live data for the latest 100 orders. No sample orders or simulated
            revenue.
          </p>
        </div>
        <button
          className="button button-outline refresh-button"
          onClick={() => void load()}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="stats-grid">
        {[
          [
            "Revenue",
            `$${(paid.reduce((sum, o) => sum + (o.amount_cents ?? 0), 0) / 100).toFixed(2)}`,
          ],
          ["Paid orders", paid.length],
          [
            "Reviews received",
            data.orders.reduce((sum, o) => sum + o.reviews_done, 0),
          ],
          [
            "Reports delivered",
            data.orders.filter((o) => o.status === "done").length,
          ],
        ].map(([label, value]) => (
          <article className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Latest 100 orders</small>
          </article>
        ))}
      </div>
      <section className="panel">
        <h2>Orders</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ORDER</th>
                <th>REVIEW</th>
                <th>STATUS</th>
                <th>PROGRESS</th>
                <th>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id.slice(0, 8)}</td>
                  <td>Profile review</td>
                  <td>
                    <span className="status-badge">
                      {o.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    {o.reviews_done} / {o.review_target}
                  </td>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.orders.length && (
            <p className="empty-state">
              No orders yet. Your first upload will appear here.
            </p>
          )}
        </div>
      </section>
      <section className="panel dashboard-section">
        <h2>Decision log</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>STEP</th>
                <th>DECISION</th>
                <th>REASON</th>
              </tr>
            </thead>
            <tbody>
              {data.decisions.map((d) => (
                <tr key={d.id}>
                  <td>{d.step}</td>
                  <td>{d.choice}</td>
                  <td>{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.decisions.length && (
            <p className="empty-state">
              Agent decisions will appear here as orders are processed.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
