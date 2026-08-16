import Icon from "./Icon";

export default function EmptyState({ icon = "scan", title, description, actions, compact = false }) {
  return (
    <div className="empty-state" style={compact ? { minHeight: 160 } : undefined}>
      <span className="empty-state-icon">
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      {description && <span>{description}</span>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  );
}
