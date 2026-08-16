import { useState } from "react";
import useApiStatus from "../../hooks/useApiStatus";
import useTheme from "../../useTheme";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({
  apiBase,
  navItems,
  meta,
  activeView,
  onNavigate,
  notificationCenter,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status } = useApiStatus(apiBase);
  const [theme, changeTheme] = useTheme();

  const handleNavigate = (view) => {
    setSidebarOpen(false);
    onNavigate(view);
  };

  return (
    <div className={`vg-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <Sidebar
        navItems={navItems}
        activeView={activeView}
        onNavigate={handleNavigate}
        apiStatus={status}
      />
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close navigation menu"
        onClick={() => setSidebarOpen(false)}
      />
      <div className="vg-main">
        <TopBar
          meta={meta}
          apiStatus={status}
          apiBase={apiBase}
          theme={theme}
          onThemeChange={changeTheme}
          notificationCenter={notificationCenter}
          onMenu={() => setSidebarOpen(true)}
        />
        <main className="vg-content">{children}</main>
      </div>
    </div>
  );
}
