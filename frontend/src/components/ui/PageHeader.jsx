export default function PageHeader({ eyebrow, title, description, actions, className = "" }) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div>
        {eyebrow && <span className="page-header-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p className="page-header-desc">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
