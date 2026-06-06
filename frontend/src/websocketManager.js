const REQUEST_TIMEOUT = 5000;

class WebSocketManager {
  constructor() {
    this.projectWs = null;
    this.notificationWs = null;
    this.projectId = null;
    this.listeners = new Map();
    this.pendingRequests = new Map();
  }

  _getWsUrl(path) {
    const token = localStorage.getItem('token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}?token=${encodeURIComponent(token)}`;
  }

  connectProject(projectId) {
    if (this.projectWs && this.projectId === projectId) {
      return;
    }
    this.disconnectProject();
    this.projectId = projectId;

    const wsUrl = this._getWsUrl(`/ws/projects/${projectId}`);
    this.projectWs = new WebSocket(wsUrl);

    this.projectWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const listeners = this.listeners.get('project') || [];
        listeners.forEach((cb) => cb(message));
      } catch (e) {
        console.error('Project WebSocket parse error:', e);
      }
    };

    this.projectWs.onclose = () => {
      this.projectWs = null;
    };
  }

  connectNotifications() {
    if (this.notificationWs) {
      return;
    }

    const wsUrl = this._getWsUrl('/ws/notifications');
    this.notificationWs = new WebSocket(wsUrl);

    this.notificationWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const listeners = this.listeners.get('notification') || [];
        listeners.forEach((cb) => cb(message));
      } catch (e) {
        console.error('Notification WebSocket parse error:', e);
      }
    };

    this.notificationWs.onclose = () => {
      this.notificationWs = null;
    };
  }

  disconnectProject() {
    if (this.projectWs) {
      this.projectWs.close();
      this.projectWs = null;
      this.projectId = null;
    }
  }

  disconnectNotifications() {
    if (this.notificationWs) {
      this.notificationWs.close();
      this.notificationWs = null;
    }
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
    return () => {
      const cbs = this.listeners.get(type) || [];
      const idx = cbs.indexOf(callback);
      if (idx >= 0) {
        cbs.splice(idx, 1);
      }
    };
  }

  _sendToWs(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (e) {
        console.error('WebSocket send error:', e);
      }
    }
  }

  trackRequestId(requestId) {
    if (!requestId || this.pendingRequests.has(requestId)) {
      return;
    }
    const timeoutId = setTimeout(() => {
      this.pendingRequests.delete(requestId);
    }, REQUEST_TIMEOUT);
    this.pendingRequests.set(requestId, timeoutId);
    const msg = { type: 'track_request_id', request_id: requestId };
    this._sendToWs(this.projectWs, msg);
    this._sendToWs(this.notificationWs, msg);
  }

  untrackRequestId(requestId) {
    if (!requestId) {
      return;
    }
    const timeoutId = this.pendingRequests.get(requestId);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    this.pendingRequests.delete(requestId);
    const msg = { type: 'untrack_request_id', request_id: requestId };
    this._sendToWs(this.projectWs, msg);
    this._sendToWs(this.notificationWs, msg);
  }

  isRequestPending(requestId) {
    return this.pendingRequests.has(requestId);
  }
}

export const wsManager = new WebSocketManager();
export default wsManager;
