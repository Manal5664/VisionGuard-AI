import { useCallback, useEffect, useState } from "react";
import {
  countUnreadNotifications,
  deduplicateNotifications,
  loadReadNotificationIds,
  markNotificationsRead,
  saveReadNotificationIds,
} from "./notificationUtils";

export default function useNotifications(apiBase, refreshToken) {
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadNotificationIds(window.localStorage));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/notifications?limit=100`);
      if (!response.ok) throw new Error(`Server responded with status ${response.status}.`);

      const data = await response.json();
      setNotifications(deduplicateNotifications(Array.isArray(data) ? data : []));
      setError(null);
    } catch (loadError) {
      setError(`Could not load security notifications: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, refreshToken]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.storageArea === window.localStorage) {
        setReadIds(loadReadNotificationIds(window.localStorage));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((currentReadIds) => {
      const nextReadIds = markNotificationsRead(currentReadIds, notifications);
      saveReadNotificationIds(window.localStorage, nextReadIds);
      return nextReadIds;
    });
  }, [notifications]);

  const markRead = useCallback((notification) => {
    setReadIds((currentReadIds) => {
      const nextReadIds = new Set(currentReadIds);
      nextReadIds.add(String(notification.id));
      saveReadNotificationIds(window.localStorage, nextReadIds);
      return nextReadIds;
    });
  }, []);

  return {
    notifications,
    readIds,
    unreadCount: countUnreadNotifications(notifications, readIds),
    loading,
    error,
    loadNotifications,
    markAllRead,
    markRead,
  };
}
