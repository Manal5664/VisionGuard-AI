import { useState } from "react";
import AppShell from "./components/layout/AppShell";
import Cameras from "./Cameras";
import Dashboard from "./Dashboard";
import DetectionTest from "./DetectionTest";
import DetectionViewer from "./DetectionViewer";
import EventsPage from "./EventsPage";
import NotificationCenter from "./NotificationCenter";
import VideoDetection from "./VideoDetection";
import ZonesPage from "./ZonesPage";
import useNotifications from "./useNotifications";

const API_BASE = "http://127.0.0.1:8000";
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "cameras", label: "Cameras", icon: "camera" },
  { id: "setup", label: "Restricted Zones", icon: "zone" },
  { id: "events", label: "Events", icon: "events" },
  { id: "video", label: "Video Detection", icon: "video" },
  { id: "test", label: "Image Detection", icon: "image" },
];

const PAGE_META = {
  dashboard: {
    title: "Dashboard",
    description: "Live status of cameras, zones, and security events.",
  },
  cameras: {
    title: "Cameras",
    description: "Configured webcams and their live monitors.",
  },
  setup: {
    title: "Restricted Zones",
    description: "Draw, edit, and manage protected monitoring areas.",
  },
  events: {
    title: "Events",
    description: "Detection and intrusion activity logged by VisionGuard.",
  },
  video: {
    title: "Video Detection",
    description: "Upload video, draw a zone, and review intrusion timeline.",
  },
  test: {
    title: "Image Detection",
    description: "Single-frame object detection test against saved zones.",
  },
};

export default function App() {
  const [view, setView] = useState("dashboard");
  const [notificationRefreshToken, setNotificationRefreshToken] = useState(0);
  const [eventRefreshToken, setEventRefreshToken] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const notificationState = useNotifications(API_BASE, notificationRefreshToken);

  const handleEventsChanged = () => {
    setNotificationRefreshToken((token) => token + 1);
    setEventRefreshToken((token) => token + 1);
  };

  const handleViewDetection = (notification) => {
    notificationState.markRead(notification);
    setSelectedNotification(notification);
  };

  let page;
  switch (view) {
    case "events":
      page = (
        <EventsPage
          apiBase={API_BASE}
          onViewDetection={handleViewDetection}
          refreshToken={eventRefreshToken}
        />
      );
      break;
    case "cameras":
      page = <Cameras apiBase={API_BASE} onEventsChanged={handleEventsChanged} />;
      break;
    case "setup":
      page = <ZonesPage apiBase={API_BASE} />;
      break;
    case "test":
      page = <DetectionTest onEventsChanged={() => setEventRefreshToken((token) => token + 1)} />;
      break;
    case "video":
      page = <VideoDetection onNotificationsChanged={handleEventsChanged} />;
      break;
    default:
      page = (
        <Dashboard
          apiBase={API_BASE}
          notifications={notificationState.notifications}
          readIds={notificationState.readIds}
          unreadCount={notificationState.unreadCount}
          onViewDetection={handleViewDetection}
          onNavigate={setView}
          refreshToken={eventRefreshToken}
        />
      );
  }

  return (
    <AppShell
      apiBase={API_BASE}
      navItems={NAV_ITEMS}
      meta={PAGE_META[view]}
      activeView={view}
      onNavigate={setView}
      notificationCenter={
        <NotificationCenter
          notifications={notificationState.notifications}
          readIds={notificationState.readIds}
          unreadCount={notificationState.unreadCount}
          loading={notificationState.loading}
          error={notificationState.error}
          onRefresh={notificationState.loadNotifications}
          onMarkAllRead={notificationState.markAllRead}
          onView={handleViewDetection}
        />
      }
    >
      {page}
      {selectedNotification && (
        <DetectionViewer
          apiBase={API_BASE}
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
        />
      )}
    </AppShell>
  );
}
