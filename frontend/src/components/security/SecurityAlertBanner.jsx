import Icon from "../ui/Icon";

export default function SecurityAlertBanner({
  label = "Security Alert",
  title,
  meta = [],
  actions,
}) {
  return (
    <div className="alert-banner" role="alert" aria-live="assertive" aria-atomic="true">
      <div className="alert-banner-heading">
        <span className="alert-banner-label">
          <Icon name="alert" />
          {label}
        </span>
        <strong>{title}</strong>
      </div>
      {meta.length > 0 && (
        <div className="alert-banner-meta">
          {meta.map((item, index) => (
            <span key={index}>{item}</span>
          ))}
        </div>
      )}
      {actions && <div className="alert-banner-actions">{actions}</div>}
    </div>
  );
}
