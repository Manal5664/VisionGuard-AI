export default function Spinner({ size, className = "" }) {
  return (
    <span
      className={`spinner ${size === "sm" ? "spinner-sm" : ""} ${className}`.trim()}
      role="status"
      aria-label="Loading"
    />
  );
}
