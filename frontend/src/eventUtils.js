export const EVENT_PAGE_SIZE = 12;

export function getCreatedFrom(dateRange, now = new Date()) {
  if (dateRange === "all") return null;

  const start = new Date(now);
  if (dateRange === "today") {
    start.setHours(0, 0, 0, 0);
  } else {
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : null;
    if (days === null) return null;
    start.setDate(start.getDate() - days);
  }
  return start.toISOString();
}

export function buildEventsQuery(filters, beforeId = null, pageSize = EVENT_PAGE_SIZE) {
  const params = new URLSearchParams({ limit: String(pageSize + 1) });
  if (filters.eventType !== "all") params.set("event_type", filters.eventType);
  if (filters.source !== "all") params.set("source", filters.source);

  const createdFrom = getCreatedFrom(filters.dateRange);
  if (createdFrom) params.set("created_from", createdFrom);
  if (beforeId != null) params.set("before_id", String(beforeId));
  return params;
}

export function unpackEventsPage(data, pageSize = EVENT_PAGE_SIZE) {
  const rows = Array.isArray(data) ? data : [];
  return {
    events: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  };
}

export function mergeUniqueEvents(currentEvents, newEvents) {
  const seen = new Set(currentEvents.map((event) => String(event.id)));
  return [
    ...currentEvents,
    ...newEvents.filter((event) => {
      const id = String(event.id);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  ];
}

export function parseApiDate(value) {
  if (!value) return null;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatEventDate(value) {
  const date = parseApiDate(value);
  if (!date) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
