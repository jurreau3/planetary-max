// src/ui/replay/ReplayUI.tsx
// Portal‑OS v11 — Replay UI (front‑end time‑travel interface)

import { useEffect, useState } from "react";
import "./ReplayUI.css";

type TimelineEvent = {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
};

type PortalTimeline = {
  events: TimelineEvent[];
};

type PortalSurfaceState = {
  panels: Record<
    string,
    {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      visible: boolean;
    }
  >;
};

export default function ReplayUI() {
  const [timeline, setTimeline] = useState<PortalTimeline | null>(null);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [surface, setSurface] = useState<PortalSurfaceState | null>(null);
  const [diff, setDiff] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch timeline on mount
  useEffect(() => {
    loadTimeline();
  }, []);

  async function loadTimeline() {
    const res = await fetch("/api/portal/timeline", {
      method: "POST",
    });
    const data = await res.json();
    setTimeline(data.timeline);
  }

  async function jumpTo(eventId: string | null) {
    setLoading(true);
    setCurrentEventId(eventId);

    const replayRes = await fetch("/api/portal/replay", {
      method: "POST",
      body: JSON.stringify({ untilEventId: eventId }),
    });
    const replayData = await replayRes.json();
    setSurface(replayData.surface);

    const diffRes = await fetch("/api/portal/diff", {
      method: "POST",
      body: JSON.stringify({ untilEventId: eventId }),
    });
    const diffData = await diffRes.json();
    setDiff(diffData.diff);

    setLoading(false);
  }

  function renderTimeline() {
    if (!timeline) return null;

    return (
      <div className="timeline-events">
        {timeline.events.map((ev) => (
          <div
            key={ev.id}
            className={
              "timeline-event" +
              (currentEventId === ev.id ? " active-event" : "")
            }
            onClick={() => jumpTo(ev.id)}
          >
            <div className="event-id">{ev.id}</div>
            <div className="event-type">{ev.type}</div>
            <div className="event-time">
              {new Date(ev.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderScrubber() {
    if (!timeline) return null;

    return (
      <input
        type="range"
        min={0}
        max={timeline.events.length}
        value={
          currentEventId
            ? timeline.events.findIndex((e) => e.id === currentEventId)
            : 0
        }
        onChange={(e) => {
          const idx = Number(e.target.value);
          const ev = timeline.events[idx];
          jumpTo(ev ? ev.id : null);
        }}
        className="timeline-scrubber"
      />
    );
  }

  function renderSurface() {
    if (!surface) return <div className="surface-empty">No surface yet</div>;

    return (
      <div className="surface-viewer">
        {Object.values(surface.panels).map((p) => (
          <div
            key={p.id}
            className="panel"
            style={{
              left: p.x,
              top: p.y,
              width: p.width,
              height: p.height,
              opacity: p.visible ? 1 : 0.3,
            }}
          >
            <div className="panel-header">{p.id}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderDiff() {
    if (!diff) return <div className="diff-empty">No diff</div>;

    return (
      <pre className="diff-viewer">
        {JSON.stringify(diff, null, 2)}
      </pre>
    );
  }

  return (
    <div className="replay-ui">
      <h2>Portal Replay UI</h2>

      {loading && <div className="loading">Loading…</div>}

      <div className="scrubber-section">{renderScrubber()}</div>

      <div className="timeline-section">{renderTimeline()}</div>

      <div className="surface-section">
        <h3>Surface State</h3>
        {renderSurface()}
      </div>

      <div className="diff-section">
        <h3>Diff</h3>
        {renderDiff()}
      </div>

      <div className="controls">
        <button onClick={() => jumpTo(null)}>Reset</button>
      </div>
    </div>
  );
}
