from flask import Flask
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import uuid
from collections import defaultdict

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.config["SECRET_KEY"] = "your-secret-key-change-in-production"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

rooms = defaultdict(lambda: {
    "updates": [],
    "users": {}
})

DEFAULT_CONTENT = "// Welcome to Collaborative Code Editor!\n// Start typing to collaborate in real-time\n\nfunction hello() {\n  console.log('Hello, World!');\n}\n"

@app.route("/")
def index():
    return {"status": "ok", "message": "Collaborative Editor Server"}

@app.route("/api/rooms")
def list_rooms():
    return {"rooms": list(rooms.keys())}

@socketio.on("join_room")
def handle_join_room(data):
    room_id = data.get("room_id", "default")
    user_id = data.get("user_id") or str(uuid.uuid4())
    username = data.get("username", f"User_{user_id[:6]}")
    language = data.get("language", "javascript")

    join_room(room_id)

    rooms[room_id]["users"][user_id] = {
        "user_id": user_id,
        "username": username,
        "language": language
    }

    emit("room_joined", {
        "user_id": user_id,
        "room_id": room_id,
        "updates": rooms[room_id]["updates"],
        "users": list(rooms[room_id]["users"].values())
    }, to=user_id)

    emit("user_joined", {
        "user": rooms[room_id]["users"][user_id]
    }, to=room_id, include_self=False)

@socketio.on("yjs_update")
def handle_yjs_update(data):
    room_id = data.get("room_id")
    update = data.get("update")
    user_id = data.get("user_id")

    if not room_id or update is None:
        return

    rooms[room_id]["updates"].append(update)

    emit("yjs_update", {
        "update": update,
        "user_id": user_id
    }, to=room_id, include_self=False)

@socketio.on("change_language")
def handle_change_language(data):
    room_id = data.get("room_id")
    user_id = data.get("user_id")
    language = data.get("language")

    if not room_id or not user_id:
        return

    if user_id in rooms[room_id]["users"]:
        rooms[room_id]["users"][user_id]["language"] = language
        emit("user_updated", {
            "user": rooms[room_id]["users"][user_id]
        }, to=room_id)

@socketio.on("disconnect")
def handle_disconnect():
    from flask_socketio import request
    user_id = request.sid

    for room_id in list(rooms.keys()):
        if user_id in rooms[room_id]["users"]:
            user = rooms[room_id]["users"].pop(user_id)
            leave_room(room_id)
            emit("user_left", {
                "user_id": user_id,
                "username": user["username"]
            }, to=room_id)

            if len(rooms[room_id]["users"]) == 0:
                del rooms[room_id]

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=2221, debug=True)
