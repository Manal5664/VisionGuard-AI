import { useEffect, useRef, useState } from "react";
import {
  buildEventsQuery,
  formatEventDate,
  mergeUniqueEvents,
  unpackEventsPage,
} from "./eventUtils";
import { formatVideoTime } from "./notificationUtils";
import Button from "./components/ui/Button";
import EmptyState from "./components/ui/EmptyState";
import Icon from "./components/ui/Icon";
import PageHeader from "./components/ui/PageHeader";
import Spinner from "./components/ui/Spinner";

const DEFAULT_FILTERS = {
  eventType: "all",
  source: "all",
  dateRange: "all",
};

const SOURCE_CLASS = {
  video: "source-video",
  image: "source-image",
  camera: "source-camera",
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
    <div>
      <PageHeader
        eyebrow="Activity log"
        title="Events"
        description="Review detections and security alerts recorded by VisionGuard."
        actions={
          <span className="count-chip">
            {loading ? "Loading…" : `${events.length} event${events.length === 1 ? "" : "s"} shown`}
          </span>
        }
      />

      <section className="filters" aria-label="Event filters">
        <label className="filter">
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
        <label className="filter">
          <span>Source</span>
          <select
            value={filters.source}
            onChange={(event) => updateFilter("source", event.target.value)}
          >
            <option value="all">All sources</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="camera">Camera</option>
          </select>
        </label>
        <label className="filter">
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
          <Button variant="ghost" icon="close" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </Button>
        )}
      </section>

      {error && (
        <p className="status status-error events-status" role="alert">
          {error}
        </p>
      )}

      <section className="panel" aria-live="polite">
        {loading ? (
          <div className="loading-row">
            <Spinner size="sm" />
            Loading events…
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="events"
            title="No matching events"
            description="Try changing the filters or run a new detection."
          />
        ) : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Source</th>
                  <th>Object</th>
                  <th>Confidence</th>
                  <th>Recorded</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const confidence = Number(event.confidence);
                  const canView = Boolean(event.media_path);
                  return (
                    <tr key={event.id}>
                      <td data-label="Event">
                        <div className="event-cell">
                          <span
                            className={`event-cell-icon event-cell-icon-${event.event_type}`}
                            aria-hidden="true"
                          >
                            {event.event_type === "intrusion" ? <Icon name="alert" size={14} /> : <Icon name="check" size={14} />}
                          </span>
                          <span className="event-cell-copy">
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
                          <span
                            className={`severity-pill ${event.event_type === "intrusion" ? "severity-threat" : "severity-detection"}`}
                          >
                            {event.event_type === "intrusion" ? (
                              <Icon name="alert" size={11} />
                            ) : (
                              <Icon name="check" size={11} />
                            )}
                            {event.event_type === "intrusion" ? "Intrusion" : "Detection"}
                          </span>
                        </div>
                      </td>
                      <td data-label="Source">
                        <span className={`source-badge ${SOURCE_CLASS[event.source] || "source-image"}`}>
                          {event.source === "video"
                            ? "Video"
                            : event.source === "camera"
                              ? "Camera"
                              : "Image"}
                        </span>
                      </td>
                      <td data-label="Object" className="event-object">{event.object_type || "Unknown"}</td>
                      <td data-label="Confidence" className="mono">
                        {Number.isFinite(confidence)
                          ? `${(confidence * 100).toFixed(1)}%`
                          : "Unavailable"}
                      </td>
                      <td data-label="Recorded">
                        <time dateTime={event.created_at || undefined}>
                          {formatEventDate(event.created_at)}
                        </time>
                      </td>
                      <td data-label="Action">
                        {canView ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            iconRight="chevronRight"
                            onClick={() => onViewDetection(event)}
                          >
                            View Detection
                          </Button>
                        ) : (
                          <span className="row-unavailable">No video</span>
                        )}
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
            <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
              {loadingMore ? "Loading…" : "Load More"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
