import { useEffect, useRef, useState } from "react";
import {
  buildEventsQuery,
  formatEventDate,
  mergeUniqueEvents,
  unpackEventsPage,
} from "./eventUtils";
import { formatVideoTime } from "./notificationUtils";

const DEFAULT_FILTERS = {
  eventType: "all",
  source: "all",
  dateRange: "all",
};

export default function EventsPage({ apiBase, onViewDetection, refreshToken }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    const controller = new AbortController();

    setLoading(true);
    setEvents([]);
    setHasMore(false);
    setError(null);

    fetch(`${apiBase}/api/events?${buildEventsQuery(filters)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Server responded with status ${response.status}.`);
        return response.json();
      })
      .then((data) => {
        if (requestSequence.current !== sequence) return;
        const page = unpackEventsPage(data);
        setEvents(page.events);
        setHasMore(page.hasMore);
      })
      .catch((loadError) => {
        if (loadError.name !== "AbortError" && requestSequence.current === sequence) {
          setError(`Events could not be loaded: ${loadError.message}`);
        }
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoading(false);
      });

    return () => controller.abort();
  }, [apiBase, filters, refreshToken]);

  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const loadMore = async () => {
    const beforeId = events.at(-1)?.id;
    if (beforeId == null || loadingMore) return;
    const sequence = requestSequence.current;

    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/api/events?${buildEventsQuery(filters, beforeId)}`,
      );
      if (!response.ok) throw new Error(`Server responded with status ${response.status}.`);
      const page = unpackEventsPage(await response.json());
      if (requestSequence.current !== sequence) return;
      setEvents((current) => mergeUniqueEvents(current, page.events));
      setHasMore(page.hasMore);
    } catch (loadError) {
      setError(`More events could not be loaded: ${loadError.message}`);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtersActive = Object.values(filters).some((value) => value !== "all");

  return (
    <div className="workspace-page events-page">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Activity log</span>
          <h1>Events</h1>
          <p>Review detections and security alerts recorded by VisionGuard.</p>
        </div>
        <span className="event-count-label">
          {loading ? "Loading…" : `${events.length} event${events.length === 1 ? "" : "s"} shown`}
        </span>
      </header>

      <section className="event-filters" aria-label="Event filters">
        <label>
          <span>Event type</span>
          <select
            value={filters.eventType}
            onChange={(event) => updateFilter("eventType", event.target.value)}
          >
            <option value="all">All events</option>
            <option value="intrusion">Security alerts</option>
            <option value="detection">Detections</option>
          </select>
        </label>
        <label>
          <span>Source</span>
          <select
            value={filters.source}
            onChange={(event) => updateFilter("source", event.target.value)}
          >
            <option value="all">All sources</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </label>
        <label>
          <span>Date</span>
          <select
            value={filters.dateRange}
            onChange={(event) => updateFilter("dateRange", event.target.value)}
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
        {filtersActive && (
          <button
            type="button"
            className="clear-filters-button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Clear filters
          </button>
        )}
      </section>

      {error && (
        <p className="status status-error events-status" role="alert">
          {error}
        </p>
      )}

      <section className="events-card" aria-live="polite">
        {loading ? (
          <div className="events-loading">
            <span className="loading-spinner" />
            Loading events…
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <strong>No matching events</strong>
            <span>Try changing the filters or run a new detection.</span>
          </div>
        ) : (
          <div className="events-table-wrap">
            <table className="events-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Source</th>
                  <th>Object</th>
                  <th>Confidence</th>
                  <th>Recorded</th>
                  <th><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const confidence = Number(event.confidence);
                  const canView = Boolean(event.media_path);
                  return (
                    <tr key={event.id}>
                      <td data-label="Event">
                        <div className="event-type-cell">
                          <span className={`event-type-icon event-type-icon-${event.event_type}`}>
                            {event.event_type === "intrusion" ? "!" : "✓"}
                          </span>
                          <span>
                            <strong>
                              {event.event_type === "intrusion" ? "Security alert" : "Detection"}
                            </strong>
                            <small>
                              {event.zone_name ||
                                (event.video_time_seconds != null
                                  ? `Video time ${formatVideoTime(event.video_time_seconds)}`
                                  : `Event #${event.id}`)}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td data-label="Source">
                        <span className={`source-badge source-badge-${event.source}`}>
                          {event.source === "video" ? "Video" : "Image"}
                        </span>
                      </td>
                      <td data-label="Object" className="event-object">
                        {event.object_type || "Unknown"}
                      </td>
                      <td data-label="Confidence" className="event-confidence">
                        {Number.isFinite(confidence)
                          ? `${(confidence * 100).toFixed(1)}%`
                          : "Unavailable"}
                      </td>
                      <td data-label="Recorded">
                        <time dateTime={event.created_at || undefined}>
                          {formatEventDate(event.created_at)}
                        </time>
                      </td>
                      <td className="event-action-cell">
                        <button
                          type="button"
                          className="event-view-button"
                          onClick={() => onViewDetection(event)}
                          disabled={!canView}
                          title={canView ? undefined : "Video is unavailable for this event"}
                        >
                          {canView ? "View Detection" : "Unavailable"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && hasMore && (
          <div className="load-more-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load More"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
