export default function StatusPill({ status, children, className = "" }) {
  return (
    <span className={`status-pill status-${status} ${className}`.trim()}>
      <span className="status-pill-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
