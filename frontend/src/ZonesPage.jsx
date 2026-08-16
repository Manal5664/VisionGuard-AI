import { useEffect, useRef, useState } from "react";
import { displayToImage, normalizeRect } from "./coords";
import { useZoneDrawer } from "./useZoneDrawer";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import FormField from "./components/ui/FormField";
import Icon from "./components/ui/Icon";
import PageHeader from "./components/ui/PageHeader";
import Spinner from "./components/ui/Spinner";

export default function ZonesPage({ apiBase }) {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [imageUrl, setImageUrl] = useState(null);
  const [imageName, setImageName] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoneName, setZoneName] = useState("");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fileInputRef = useRef(null);

  const {
    wrapperRef,
    rect,
    clear,
    pointerHandlers,
  } = useZoneDrawer({
    enabled: Boolean(imageUrl),
    onReset: () => setStatus(null),
  });

  const loadZones = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${apiBase}/api/zones`);
      if (!response.ok) throw new Error(`Server responded with status ${response.status}.`);
      setZones(await response.json());
    } catch (error) {
      setLoadError(`Zones could not be loaded: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZones();
  }, [apiBase]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const resetEditor = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageName("");
    setNaturalSize({ width: 0, height: 0 });
    setZoneName("");
    setEditing(null);
    setStatus(null);
    clear();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    clear();
    setStatus(null);
  };

  const handleImageLoad = (event) => {
    setNaturalSize({
      width: event.target.naturalWidth,
      height: event.target.naturalHeight,
    });
  };

  const handleEdit = (zone) => {
    resetEditor();
    setEditing(zone);
    setZoneName(zone.name);
    setStatus({ type: "info", message: `Editing "${zone.name}". Draw a new rectangle to update its area, or just rename it.` });
  };

  const handleSave = async () => {
    if (!editing && !imageUrl) {
      setStatus({ type: "error", message: "Choose an image first to draw the zone." });
      return;
    }
    if (!zoneName.trim()) {
      setStatus({ type: "error", message: "Enter a zone name." });
      return;
    }

    let coordinates = null;
    if (rect && Math.abs(rect.x2 - rect.x1) >= 1 && Math.abs(rect.y2 - rect.y1) >= 1) {
      const bounds = wrapperRef.current.getBoundingClientRect();
      coordinates = displayToImage(
        rect,
        bounds.width,
        bounds.height,
        naturalSize.width,
        naturalSize.height,
      );
      if (!coordinates) {
        setStatus({ type: "error", message: "Could not compute image coordinates." });
        return;
      }
    } else if (editing) {
      coordinates = { x1: editing.x1, y1: editing.y1, x2: editing.x2, y2: editing.y2 };
    } else {
      setStatus({ type: "error", message: "Draw a rectangle over the image first." });
      return;
    }

    const payload = { name: zoneName.trim(), ...coordinates };

    setSaving(true);
    try {
      const url = editing ? `${apiBase}/api/zones/${editing.id}` : `${apiBase}/api/zones`;
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 201 || response.status === 200) {
        const saved = await response.json();
        await loadZones();
        setStatus({
          type: "success",
          message: editing
            ? `Zone "${saved.name}" updated successfully.`
            : `Zone "${saved.name}" saved successfully.`,
        });
        resetEditor();
      } else {
        let detail = `Server responded with status ${response.status}.`;
        try {
          const data = await response.json();
          if (data?.detail) {
            detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
          }
        } catch {
          // response body was not JSON
        }
        setStatus({ type: "error", message: `Save failed: ${detail}` });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: `Save failed: ${error.message}. Is the backend running at ${apiBase}?`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zone) => {
    if (!window.confirm(`Delete zone "${zone.name}"? This cannot be undone.`)) return;
    setDeletingId(zone.id);
    setStatus(null);
    try {
      const response = await fetch(`${apiBase}/api/zones/${zone.id}`, {
        method: "DELETE",
      });
      if (response.status !== 204) {
        let detail = `Server responded with status ${response.status}.`;
        try {
          const data = await response.json();
          if (data?.detail) {
            detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
          }
        } catch {
          // response body was not JSON
        }
        setStatus({ type: "error", message: `Delete failed: ${detail}` });
        return;
      }
      await loadZones();
      if (editing?.id === zone.id) resetEditor();
      setStatus({ type: "success", message: `Zone "${zone.name}" deleted.` });
    } catch (error) {
      setStatus({
        type: "error",
        message: `Delete failed: ${error.message}. Is the backend running at ${apiBase}?`,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const drawRect = rect ? normalizeRect(rect) : null;
  const bounds = wrapperRef.current?.getBoundingClientRect();
  const previewCoords = drawRect
    ? displayToImage(
        drawRect,
        bounds?.width ?? 0,
        bounds?.height ?? 0,
        naturalSize.width,
        naturalSize.height,
      )
    : editing
      ? { x1: editing.x1, y1: editing.y1, x2: editing.x2, y2: editing.y2 }
      : null;

  return (
    <div>
      <PageHeader
        eyebrow="Restricted areas"
        title="Restricted Zones"
        description="Draw and manage protected monitoring areas. Zones can be global or tied to a specific camera."
        actions={
          <Button variant="secondary" icon="refresh" onClick={loadZones}>
            Refresh
          </Button>
        }
      />

      {loadError && (
        <p className="status status-error" role="alert">
          {loadError}
        </p>
      )}

      <div className="zones-layout">
        <Card
          eyebrow="Configured"
          title="Saved zones"
          actions={
            !loading && (
              <span className="count-chip">{zones.length}</span>
            )
          }
          flush
        >
          {loading ? (
            <div className="loading-row">
              <Spinner size="sm" />
              Loading zones…
            </div>
          ) : zones.length === 0 ? (
            <EmptyState
              icon="zone"
              title="No zones configured"
              description="Draw a zone on the right to start protecting an area."
            />
          ) : (
            <div>
              {zones.map((zone) => (
                <div className="zone-item" key={zone.id}>
                  <div className="zone-item-copy">
                    <strong>{zone.name}</strong>
                    <small>
                      {zone.camera_id
                        ? `Camera #${zone.camera_id}`
                        : "Global"} · x1:{zone.x1} y1:{zone.y1} x2:{zone.x2} y2:{zone.y2}
                    </small>
                  </div>
                  <div className="zone-item-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit zone"
                      aria-label={`Edit zone ${zone.name}`}
                      onClick={() => handleEdit(zone)}
                      disabled={deletingId === zone.id}
                    >
                      <Icon name="edit" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button-danger"
                      title="Delete zone"
                      aria-label={`Delete zone ${zone.name}`}
                      onClick={() => handleDelete(zone)}
                      disabled={deletingId === zone.id}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          eyebrow={editing ? "Editing" : "New zone"}
          title={editing ? `Edit "${editing.name}"` : "Draw a zone"}
          actions={
            editing && (
              <Button variant="ghost" icon="close" onClick={resetEditor}>
                Cancel
              </Button>
            )
          }
        >
          <div className="stack">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
            />

            {imageUrl ? (
              <div className="zone-draw-preview">
                <div ref={wrapperRef} className="draw-canvas" {...pointerHandlers}>
                  <img
                    src={imageUrl}
                    alt="Preview used for drawing the restricted zone"
                    draggable={false}
                    onLoad={handleImageLoad}
                  />
                  {drawRect && (
                    <div
                      className="zone-rect"
                      style={{
                        left: drawRect.x1,
                        top: drawRect.y1,
                        width: drawRect.x2 - drawRect.x1,
                        height: drawRect.y2 - drawRect.y1,
                      }}
                    />
                  )}
                </div>
                <span className="hint">
                  Drag over the image to define the zone area. {imageName}
                </span>
              </div>
            ) : (
              <button
                type="button"
                className="drop-zone"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="drop-zone-icon" aria-hidden="true">
                  <Icon name="upload" />
                </span>
                <strong>{editing ? "Choose an image to redraw this zone" : "Choose a reference image"}</strong>
                <span>
                  {editing
                    ? "Optional: pick an image to update the zone coordinates."
                    : "Pick an image of the area you want to protect, then drag over it."}
                </span>
              </button>
            )}

            <FormField label="Zone name">
              <input
                value={zoneName}
                onChange={(event) => setZoneName(event.target.value)}
                placeholder="e.g. Front desk"
              />
            </FormField>

            <div className="coords-box">
              <span className="coords-label">Zone coordinates</span>
              {previewCoords ? (
                <code className="coords-value">
                  x1: {previewCoords.x1}, y1: {previewCoords.y1}, x2: {previewCoords.x2}, y2:{" "}
                  {previewCoords.y2}
                </code>
              ) : (
                <span className="muted">No coordinates yet.</span>
              )}
            </div>

            <div className="actions">
              <Button
                variant="primary"
                icon={editing ? "check" : "plus"}
                loading={saving}
                onClick={handleSave}
              >
                {saving ? "Saving…" : editing ? "Update Zone" : "Save Zone"}
              </Button>
              <Button variant="secondary" icon="close" onClick={resetEditor} disabled={!imageUrl && !editing}>
                Clear
              </Button>
            </div>

            {status && (
              <p className={`status status-${status.type}`} role="status">
                {status.message}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
