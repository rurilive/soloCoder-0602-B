import React, { useState, useEffect, useRef } from 'react';
import { notificationAPI } from '../api';
import { useToast } from '../context/ToastContext';

const NOTIFICATION_TYPE_CONFIG = {
  task_created: { icon: '➕', color: '#28a745' },
  task_updated: { icon: '✏️', color: '#ffc107' },
  task_moved: { icon: '🔄', color: '#0d6efd' },
  task_deleted: { icon: '🗑️', color: '#dc3545' },
  default: { icon: '📢', color: '#6c757d' },
};

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef(null);
  const { showToast } = useToast();

  const fetchNotifications = async () => {
    try {
      const res = await notificationAPI.list({ limit: 50 });
      setNotifications(res.data);
    } catch {
      // 静默失败
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await notificationAPI.unreadCount();
      setUnreadCount(res.data.unread_count);
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();

    const token = localStorage.getItem('token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/notifications?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'notification') {
          const newNotification = message.data;
          setNotifications((prev) => [newNotification, ...prev.slice(0, 49)]);
          setUnreadCount((prev) => prev + 1);
          showToast(newNotification.title, 'info');
        }
      } catch (e) {
        console.error('Notification WebSocket parse error:', e);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleMarkRead = async (notificationId) => {
    try {
      await notificationAPI.markRead(notificationId, true);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      showToast('标记已读失败', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      showToast('全部标记为已读', 'success');
    } catch {
      showToast('标记失败', 'error');
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString();
  };

  return (
    <div className="notification-center">
      <button
        className="notification-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>通知</h3>
            {unreadCount > 0 && (
              <button className="btn btn-link btn-sm" onClick={handleMarkAllRead}>
                全部已读
              </button>
            )}
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">暂无通知</div>
            ) : (
              notifications.map((notification) => {
                const config = NOTIFICATION_TYPE_CONFIG[notification.type] || NOTIFICATION_TYPE_CONFIG.default;
                return (
                  <div
                    key={notification.id}
                    className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                    onClick={() => !notification.read && handleMarkRead(notification.id)}
                  >
                    <span className="notification-icon" style={{ color: config.color }}>
                      {config.icon}
                    </span>
                    <div className="notification-content">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">{formatTime(notification.created_at)}</div>
                    </div>
                    {!notification.read && <div className="notification-dot" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {isOpen && <div className="notification-backdrop" onClick={() => setIsOpen(false)} />}
    </div>
  );
}
