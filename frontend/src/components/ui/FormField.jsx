export default function FormField({ label, hint, error, children, className = "" }) {
  return (
    <label className={`field ${className}`.trim()}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}
