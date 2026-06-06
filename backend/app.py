import uuid
from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['SECRET_KEY'] = 'yjs-collab-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

rooms = {}


class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.users = {}
        self.yjs_update_buffer = bytearray()

    def add_user(self, user_id, user_name, sid):
        self.users[sid] = {'user_id': user_id, 'user_name': user_name}

    def remove_user(self, sid):
        if sid in self.users:
            del self.users[sid]

    def get_users(self):
        return list(self.users.values())

    def has_users(self):
        return len(self.users) > 0


def get_or_create_room(room_id):
    if room_id not in rooms:
        rooms[room_id] = Room(room_id)
    return rooms[room_id]


@app.route('/api/rooms', methods=['GET'])
def list_rooms():
    room_list = []
    for room_id, room in rooms.items():
        room_list.append({
            'room_id': room_id,
            'user_count': len(room.get_users())
        })
    return {'rooms': room_list}


@app.route('/api/health', methods=['GET'])
def health():
    return {'status': 'ok'}


@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    for room_id, room in list(rooms.items()):
        user_info = room.users.get(request.sid)
        if user_info:
            room.remove_user(request.sid)
            leave_room(room_id)
            emit('user-left', {
                'user_id': user_info['user_id'],
                'user_name': user_info['user_name'],
                'users': room.get_users()
            }, room=room_id)
            if not room.has_users():
                del rooms[room_id]


@socketio.on('join-room')
def handle_join_room(data):
    room_id = data.get('room_id')
    user_name = data.get('user_name', 'Anonymous')
    user_id = data.get('user_id', str(uuid.uuid4()))

    if not room_id:
        emit('error', {'message': 'room_id is required'})
        return

    room = get_or_create_room(room_id)
    join_room(room_id)
    room.add_user(user_id, user_name, request.sid)

    print(f"User {user_name} joined room {room_id}")

    emit('room-joined', {
        'room_id': room_id,
        'user_id': user_id,
        'users': room.get_users()
    })

    emit('user-joined', {
        'user_id': user_id,
        'user_name': user_name,
        'users': room.get_users()
    }, room=room_id, include_self=False)

    if len(room.yjs_update_buffer) > 0:
        emit('yjs-sync-step1', bytes(room.yjs_update_buffer))


@socketio.on('yjs-update')
def handle_yjs_update(data):
    room_id = data.get('room_id')
    update = data.get('update')

    if not room_id or not update:
        return

    room = rooms.get(room_id)
    if not room:
        return

    update_bytes = bytes(update)
    room.yjs_update_buffer.extend(update_bytes)

    emit('yjs-update', {
        'update': list(update_bytes),
        'user_id': room.users.get(request.sid, {}).get('user_id')
    }, room=room_id, include_self=False)


@socketio.on('yjs-sync-step1')
def handle_yjs_sync_step1(data):
    room_id = data.get('room_id')
    update = data.get('update')

    if not room_id:
        return

    room = rooms.get(room_id)
    if not room:
        return

    update_bytes = bytes(update)
    room.yjs_update_buffer.extend(update_bytes)

    for sid in room.users.keys():
        if sid != request.sid:
            emit('yjs-sync-step1', list(update_bytes), to=sid)


@socketio.on('yjs-sync-step2')
def handle_yjs_sync_step2(data):
    room_id = data.get('room_id')
    update = data.get('update')
    target_sid = data.get('target_sid')

    if not room_id or not update:
        return

    if target_sid:
        emit('yjs-sync-step2', list(bytes(update)), to=target_sid)


@socketio.on('leave-room')
def handle_leave_room(data):
    room_id = data.get('room_id')
    if not room_id:
        return

    room = rooms.get(room_id)
    if not room:
        return

    user_info = room.users.get(request.sid)
    if user_info:
        room.remove_user(request.sid)
        leave_room(room_id)
        emit('user-left', {
            'user_id': user_info['user_id'],
            'user_name': user_info['user_name'],
            'users': room.get_users()
        }, room=room_id)

        if not room.has_users():
            del rooms[room_id]


if __name__ == '__main__':
    print("Starting collaborative code editor backend on port 2221...")
    socketio.run(app, host='0.0.0.0', port=2221, debug=False, use_reloader=False)
