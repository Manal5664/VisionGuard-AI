export default function Card({ eyebrow, title, actions, children, className = "", flush }) {
  return (
    <section className={`panel ${flush ? "panel-flush" : ""} ${className}`.trim()}>
      {(eyebrow || title || actions) && (
        <div className="panel-header">
          <div>
            {eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}
            {title && <h2 className="panel-title">{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
