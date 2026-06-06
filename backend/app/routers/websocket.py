import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from app.auth import decode_access_token, validate_schema_name
from app.websocket_manager import manager
from app.schemas import TokenData

router = APIRouter(tags=["websocket"])


async def _handle_websocket_messages(websocket: WebSocket):
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")
                request_id = msg.get("request_id")
                if msg_type == "track_request_id" and request_id:
                    manager.add_request_id(websocket, request_id)
                elif msg_type == "untrack_request_id" and request_id:
                    manager.remove_request_id(websocket, request_id)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        raise


@router.websocket("/ws/projects/{project_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    project_id: int,
    token: str = Query(...),
):
    try:
        token_data: TokenData = decode_access_token(token)
        schema_name = validate_schema_name(token_data.schema_name)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, schema_name, project_id)
    try:
        await _handle_websocket_messages(websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, schema_name, project_id)


@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    token: str = Query(...),
):
    try:
        token_data: TokenData = decode_access_token(token)
        schema_name = validate_schema_name(token_data.schema_name)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect_notifications(websocket, schema_name)
    try:
        await _handle_websocket_messages(websocket)
    except WebSocketDisconnect:
        manager.disconnect_notifications(websocket, schema_name)
