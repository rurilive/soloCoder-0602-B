import json
from typing import Dict, Set, Tuple
from fastapi import WebSocket, WebSocketDisconnect
from app.schemas import TaskResponse, NotificationResponse


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[Tuple[str, int], Set[WebSocket]] = {}
        self.notification_connections: Dict[str, Set[WebSocket]] = {}

    def _get_key(self, schema_name: str, project_id: int) -> Tuple[str, int]:
        return (schema_name, project_id)

    def _get_notification_key(self, schema_name: str) -> str:
        return schema_name

    async def connect(self, websocket: WebSocket, schema_name: str, project_id: int):
        await websocket.accept()
        key = self._get_key(schema_name, project_id)
        if key not in self.active_connections:
            self.active_connections[key] = set()
        self.active_connections[key].add(websocket)

    def disconnect(self, websocket: WebSocket, schema_name: str, project_id: int):
        key = self._get_key(schema_name, project_id)
        if key in self.active_connections:
            self.active_connections[key].discard(websocket)
            if not self.active_connections[key]:
                del self.active_connections[key]

    async def connect_notifications(self, websocket: WebSocket, schema_name: str):
        await websocket.accept()
        key = self._get_notification_key(schema_name)
        if key not in self.notification_connections:
            self.notification_connections[key] = set()
        self.notification_connections[key].add(websocket)

    def disconnect_notifications(self, websocket: WebSocket, schema_name: str):
        key = self._get_notification_key(schema_name)
        if key in self.notification_connections:
            self.notification_connections[key].discard(websocket)
            if not self.notification_connections[key]:
                del self.notification_connections[key]

    async def broadcast_task_update(
        self,
        schema_name: str,
        project_id: int,
        task: TaskResponse,
        action: str = "update",
        request_id: str | None = None,
        exclude_websocket: WebSocket | None = None,
    ):
        key = self._get_key(schema_name, project_id)
        if key not in self.active_connections:
            return

        message = {
            "type": "task_update",
            "action": action,
            "request_id": request_id,
            "data": {
                "id": task.id,
                "project_id": task.project_id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "priority": task.priority,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "position": task.position,
                "custom_field_values": task.custom_field_values or {},
                "updated_at": task.updated_at.isoformat(),
            },
        }

        for connection in self.active_connections[key]:
            if connection == exclude_websocket:
                continue
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(connection, schema_name, project_id)
            except Exception:
                pass

    async def broadcast_task_delete(
        self,
        schema_name: str,
        project_id: int,
        task_id: int,
        request_id: str | None = None,
        exclude_websocket: WebSocket | None = None,
    ):
        key = self._get_key(schema_name, project_id)
        if key not in self.active_connections:
            return

        message = {
            "type": "task_update",
            "action": "delete",
            "request_id": request_id,
            "data": {"id": task_id, "project_id": project_id},
        }

        for connection in self.active_connections[key]:
            if connection == exclude_websocket:
                continue
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(connection, schema_name, project_id)
            except Exception:
                pass

    async def broadcast_bulk_update(
        self,
        schema_name: str,
        project_id: int,
        tasks: list[TaskResponse],
        action: str = "bulk_update",
        request_id: str | None = None,
        exclude_websocket: WebSocket | None = None,
    ):
        key = self._get_key(schema_name, project_id)
        if key not in self.active_connections:
            return

        message = {
            "type": "task_update",
            "action": action,
            "request_id": request_id,
            "data": [
                {
                    "id": task.id,
                    "project_id": task.project_id,
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "position": task.position,
                    "custom_field_values": task.custom_field_values or {},
                    "updated_at": task.updated_at.isoformat(),
                }
                for task in tasks
            ],
        }

        for connection in self.active_connections[key]:
            if connection == exclude_websocket:
                continue
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(connection, schema_name, project_id)
            except Exception:
                pass

    async def broadcast_bulk_delete(
        self,
        schema_name: str,
        project_id: int,
        task_ids: list[int],
        request_id: str | None = None,
        exclude_websocket: WebSocket | None = None,
    ):
        key = self._get_key(schema_name, project_id)
        if key not in self.active_connections:
            return

        message = {
            "type": "task_update",
            "action": "bulk_delete",
            "request_id": request_id,
            "data": {"task_ids": task_ids, "project_id": project_id},
        }

        for connection in self.active_connections[key]:
            if connection == exclude_websocket:
                continue
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(connection, schema_name, project_id)
            except Exception:
                pass

    async def broadcast_notification(
        self,
        schema_name: str,
        notification: NotificationResponse,
        request_id: str | None = None,
        exclude_websocket: WebSocket | None = None,
    ):
        key = self._get_notification_key(schema_name)
        if key not in self.notification_connections:
            return

        message = {
            "type": "notification",
            "request_id": request_id,
            "data": {
                "id": notification.id,
                "type": notification.type,
                "title": notification.title,
                "message": notification.message,
                "related_task_id": notification.related_task_id,
                "related_project_id": notification.related_project_id,
                "read": notification.read,
                "created_at": notification.created_at.isoformat(),
            },
        }

        for connection in self.notification_connections[key]:
            if connection == exclude_websocket:
                continue
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect_notifications(connection, schema_name)
            except Exception:
                pass


manager = ConnectionManager()
