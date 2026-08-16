export default function ProgressBar({ value = 0, label, detail, tone }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="progress" role="status" aria-label={label}>
      <div className="progress-label">
        <span>{label}</span>
        {detail != null && <span>{detail}</span>}
      </div>
      <div className="progress-track">
        <div
          className={`progress-bar${tone === "danger" ? " progress-bar-danger" : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
