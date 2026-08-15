import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventsQuery,
  getCreatedFrom,
  mergeUniqueEvents,
  parseApiDate,
  unpackEventsPage,
} from "./eventUtils.js";

test("filters remain attached to initial and Load More queries", () => {
  const filters = { eventType: "intrusion", source: "video", dateRange: "7d" };
  const first = buildEventsQuery(filters, null, 2);
  const next = buildEventsQuery(filters, 41, 2);

  for (const query of [first, next]) {
    assert.equal(query.get("event_type"), "intrusion");
    assert.equal(query.get("source"), "video");
    assert.ok(query.get("created_from"));
    assert.equal(query.get("limit"), "3");
  }
  assert.equal(first.has("before_id"), false);
  assert.equal(next.get("before_id"), "41");
});

test("pagination uses one lookahead row and merges without duplicates", () => {
  const page = unpackEventsPage([{ id: 5 }, { id: 4 }, { id: 3 }], 2);
  assert.deepEqual(page.events.map((event) => event.id), [5, 4]);
  assert.equal(page.hasMore, true);
  assert.deepEqual(
    mergeUniqueEvents(page.events, [{ id: 4 }, { id: 3 }]).map((event) => event.id),
    [5, 4, 3],
  );
});

test("date ranges and naive API timestamps are normalized", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");
  assert.equal(getCreatedFrom("all", now), null);
  assert.equal(getCreatedFrom("7d", now), "2026-08-09T12:00:00.000Z");
  assert.equal(parseApiDate("2026-08-16T12:00:00").toISOString(), now.toISOString());
});
