import Icon from "../ui/Icon";

export default function Sidebar({ navItems, activeView, onNavigate, apiStatus }) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <button
        type="button"
        className="sidebar-brand"
        onClick={() => onNavigate("dashboard")}
        title="VisionGuard — go to Dashboard"
      >
        <span className="brand-mark" aria-hidden="true">
          <Icon name="shield" size={20} />
        </span>
        <span className="brand-copy">
          <strong>VisionGuard</strong>
          <small>Security command center</small>
        </span>
      </button>

      <nav className="sidebar-nav">
        <span className="nav-section-label">Operations</span>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activeView === item.id ? " nav-item-active" : ""}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activeView === item.id ? "page" : undefined}
          >
            <span className="nav-item-icon" aria-hidden="true">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="nav-item-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-status">
          <span className="status-pill-dot" aria-hidden="true" />
          API {apiStatus === "online" ? "Online" : apiStatus === "checking" ? "Checking" : "Offline"}
        </span>
        <span className="sidebar-version">VisionGuard v1.0.0</span>
      </div>
    </aside>
  );
}
