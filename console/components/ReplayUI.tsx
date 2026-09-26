// console/components/ReplayUI.tsx
// Portal‑OS v11 — Replay UI (Timeline + Diff + Replay Viewer)

import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function ReplayUI() {
  const [timeline, setTimeline] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [surface, setSurface] = useState(null);
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);

  // ------------------------------------------------------------
  // Load timeline on mount
  // ------------------------------------------------------------
  useEffect(() => {
    loadTimeline();
  }, []);

  async function loadTimeline() {
    setLoading(true);
    try {
      const res = await api.get("/portal/timeline");
      setTimeline(res.timeline.events);
    } catch (err) {
      console.error("Timeline load failed:", err);
    }
    setLoading(false);
  }

  // ------------------------------------------------------------
  // Replay a specific event
  // ------------------------------------------------------------
  async function replayEvent(eventId: string) {
    setLoading(true);
    setSelectedEvent(eventId);

    try {
      const res = await api.post("/portal/replay", {
        eventId,
      });
      setSurface(res.surface);
    } catch (err) {
      console.error("Replay failed:", err);
    }

    setLoading(false);
  }

  // ------------------------------------------------------------
  // Diff between two events
  // ------------------------------------------------------------
  async function diffEvents(fromId: string, toId: string) {
    setLoading(true);

    try {
      const res = await api.post("/portal/diff", {
        from: fromId,
        to: toId,
      });
      setDiff(res.diff);
    } catch (err) {
      console.error("Diff failed:", err);
    }

    setLoading(false);
  }

  // ------------------------------------------------------------
  // Render timeline list
  // ------------------------------------------------------------
  function renderTimeline() {
    return (
      <div className="timeline-list">
        {timeline.map((event) => (
          <div
            key={event.id}
            className={`timeline-item ${
              selectedEvent === event.id ? "selected" : ""
            }`}
            onClick={() => replayEvent(event.id)}
          >
            <div className="event-id">{event.id}</div>
            <div className="event-action">{event.action}</div>
            <div className="event-panel">{event.panel}</div>
            <div className="event-time">
              {new Date(event.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ------------------------------------------------------------
  // Render surface state
  // ------------------------------------------------------------
  function renderSurface() {
    if (!surface) return <div className="surface-empty">No surface</div>;

    return (
      <div className="surface-view">
        {Object.values(surface.panels).map((panel: any) => (
          <div key={panel.id} className="panel-card">
            <div className="panel-title">{panel.title}</div>
            <div className="panel-meta">
              x={panel.x}, y={panel.y}, w={panel.width}, h={panel.height}
            </div>
            <div className="panel-visible">
              {panel.visible ? "Visible" : "Hidden"}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ------------------------------------------------------------
  // Render diff
  // ------------------------------------------------------------
  function renderDiff() {
    if (!diff) return <div className="diff-empty">No diff</div>;

    return (
      <div className="diff-view">
        <h3>Diff</h3>
        <pre>{JSON.stringify(diff, null, 2)}</pre>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Main UI
  // ------------------------------------------------------------
  return (
    <div className="replay-ui">
      <h2>Portal Replay UI</h2>

      {loading && <div className="loading">Loading…</div>}

      <div className="replay-grid">
        <div className="timeline-column">
          <h3>Timeline</h3>
          {renderTimeline()}
        </div>

        <div className="surface-column">
          <h3>Surface</h3>
          {renderSurface()}
        </div>

        <div className="diff-column">
          <h3>Diff</h3>
          {renderDiff()}
        </div>
      </div>

      <div className="diff-controls">
        <h3>Compute Diff</h3>
        <DiffControls timeline={timeline} onDiff={diffEvents} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Diff Controls Component
// ------------------------------------------------------------
function DiffControls({ timeline, onDiff }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="diff-controls-inner">
      <select value={from} onChange={(e) => setFrom(e.target.value)}>
        <option value="">From event…</option>
        {timeline.map((e) => (
          <option key={e.id} value={e.id}>
            {e.id} — {e.action}
          </option>
        ))}
      </select>

      <select value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">To event…</option>
        {timeline.map((e) => (
          <option key={e.id} value={e.id}>
            {e.id} — {e.action}
          </option>
        ))}
      </select>

      <button
        disabled={!from || !to}
        onClick={() => onDiff(from, to)}
      >
        Compute Diff
      </button>
    </div>
  );
}
