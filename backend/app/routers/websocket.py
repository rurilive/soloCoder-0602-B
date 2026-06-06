from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from app.auth import decode_access_token, validate_schema_name
from app.websocket_manager import manager
from app.schemas import TokenData

router = APIRouter(tags=["websocket"])


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
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, schema_name, project_id)
