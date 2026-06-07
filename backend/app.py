import uuid
import subprocess
import tempfile
import os
import sqlite3
import threading
import time
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['SECRET_KEY'] = 'yjs-collab-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yjs_versions.db')

rooms = {}
auto_save_timers = {}


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db_schema():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            snapshot BLOB NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(room_id, version)
        )
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_room_id ON versions(room_id)
    ''')
    conn.commit()
    conn.close()


init_db_schema()


def get_latest_version(room_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT * FROM versions WHERE room_id = ? ORDER BY version DESC LIMIT 1',
        (room_id,)
    )
    row = cursor.fetchone()
    conn.close()
    return row


def get_all_versions(room_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT id, version, created_at FROM versions WHERE room_id = ? ORDER BY version DESC',
        (room_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_version_snapshot(room_id, version):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT snapshot FROM versions WHERE room_id = ? AND version = ?',
        (room_id, version)
    )
    row = cursor.fetchone()
    conn.close()
    return row['snapshot'] if row else None


def save_snapshot_to_db(room_id, version, snapshot):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO versions (room_id, version, snapshot, created_at) VALUES (?, ?, ?, ?)',
        (room_id, version, snapshot, int(time.time()))
    )
    conn.commit()
    conn.close()


def get_next_version(room_id):
    latest = get_latest_version(room_id)
    if latest:
        return latest['version'] + 1
    return 1


class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.users = {}
        self.awareness_states = {}
        self.current_version = 0
        self.pending_snapshot = None
        self._lock = threading.Lock()
        latest = get_latest_version(self.room_id)
        if latest:
            self.current_version = latest['version']

    def save_snapshot(self, snapshot_bytes):
        with self._lock:
            try:
                next_ver = get_next_version(self.room_id)
                save_snapshot_to_db(self.room_id, next_ver, snapshot_bytes)
                self.current_version = next_ver
                return True
            except Exception as e:
                print(f"Error saving snapshot for room {self.room_id}: {e}")
                return False

    def get_latest_snapshot(self):
        latest = get_latest_version(self.room_id)
        if latest:
            return latest['snapshot']
        return None

    def add_user(self, user_id, user_name, sid):
        self.users[sid] = {'user_id': user_id, 'user_name': user_name}

    def remove_user(self, sid):
        if sid in self.users:
            user_id = self.users[sid]['user_id']
            del self.users[sid]
            if user_id in self.awareness_states:
                del self.awareness_states[user_id]
            return user_id
        return None

    def get_users(self):
        return list(self.users.values())

    def has_users(self):
        return len(self.users) > 0

    def set_awareness(self, user_id, awareness):
        self.awareness_states[user_id] = awareness

    def get_all_awareness(self):
        return list(self.awareness_states.values())


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


@app.route('/api/rooms/<room_id>/versions', methods=['GET'])
def get_room_versions(room_id):
    versions = get_all_versions(room_id)
    return {'versions': versions}


@app.route('/api/rooms/<room_id>/rollback', methods=['POST'])
def rollback_room(room_id):
    data = request.get_json()
    if not data or 'version' not in data:
        return jsonify({'error': 'version is required'}), 400
    target_version = data['version']
    snapshot = get_version_snapshot(room_id, target_version)
    if snapshot is None:
        return jsonify({'error': 'Version not found'}), 404
    room = rooms.get(room_id)
    if room:
        room.current_version = target_version
    socketio.emit('yjs-update', {
        'update': list(bytes(snapshot)),
        'user_id': 'system'
    }, room=room_id)
    socketio.emit('version-rolled-back', {
        'version': target_version
    }, room=room_id)
    return {'success': True, 'version': target_version}


@app.route('/api/rooms/<room_id>/state', methods=['GET'])
def get_room_state(room_id):
    get_or_create_room(room_id)
    latest = get_latest_version(room_id)
    if latest is None:
        return {'state': None, 'version': 0}
    return {'state': list(bytes(latest['snapshot'])), 'version': latest['version']}


@app.route('/api/health', methods=['GET'])
def health():
    return {'status': 'ok'}


@app.route('/api/run', methods=['POST'])
def run_code():
    data = request.get_json()
    if not data or 'code' not in data:
        return jsonify({'error': 'No code provided'}), 400

    code = data['code']
    language = data.get('language', 'python')

    if language != 'python':
        return jsonify({'error': f'Unsupported language: {language}'}), 400

    temp_dir = None
    try:
        temp_dir = tempfile.mkdtemp(prefix='code_runner_')
        temp_file = os.path.join(temp_dir, 'script.py')

        wrapper_code = '''
import builtins
import sys

_unsafe_builtins = ['open', 'eval', 'exec', 'compile', 'input', 'exit', 'quit']
_unsafe_modules = ['os', 'subprocess', 'shutil', 'ctypes', 'socket', 'ftplib', 'http', 'urllib', 'requests', 'multiprocessing', 'threading', 'builtins', 'importlib', 'pkgutil', 'code', 'codeop']

_original_import = builtins.__import__

def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    base_name = name.split('.')[0]
    if base_name in _unsafe_modules:
        raise ImportError(f"Import of module '{name}' is not allowed for security reasons")
    return _original_import(name, globals, locals, fromlist, level)

builtins.__import__ = _safe_import

for _name in _unsafe_builtins:
    if hasattr(builtins, _name):
        delattr(builtins, _name)

del _name
'''

        final_code = wrapper_code + '\n' + code

        with open(temp_file, 'w') as f:
            f.write(final_code)

        restricted_env = os.environ.copy()
        restricted_env['PYTHONPATH'] = ''
        restricted_env['PYTHONHOME'] = ''
        restricted_env['PATH'] = '/usr/bin:/bin'
        restricted_env.pop('HOME', None)
        restricted_env.pop('USER', None)
        restricted_env.pop('LOGNAME', None)

        cmd = [
            'prlimit',
            '--cpu=5',
            '--as=134217728',
            '--data=67108864',
            '--stack=33554432',
            '--fsize=1048576',
            '--nofile=32',
            '--nproc=0',
            'python3', '-S', '-I', temp_file
        ]

        result = subprocess.run(
            cmd,
            cwd=temp_dir,
            capture_output=True,
            text=True,
            timeout=10,
            env=restricted_env
        )

        for root, dirs, files in os.walk(temp_dir, topdown=False):
            for name in files:
                os.remove(os.path.join(root, name))
            for name in dirs:
                os.rmdir(os.path.join(root, name))
        os.rmdir(temp_dir)

        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    except subprocess.TimeoutExpired:
        if temp_dir and os.path.exists(temp_dir):
            try:
                for root, dirs, files in os.walk(temp_dir, topdown=False):
                    for name in files:
                        os.remove(os.path.join(root, name))
                    for name in dirs:
                        os.rmdir(os.path.join(root, name))
                os.rmdir(temp_dir)
            except:
                pass
        return jsonify({
            'stdout': '',
            'stderr': 'Execution timed out after 10 seconds',
            'returncode': -1
        })
    except Exception as e:
        if temp_dir and os.path.exists(temp_dir):
            try:
                for root, dirs, files in os.walk(temp_dir, topdown=False):
                    for name in files:
                        os.remove(os.path.join(root, name))
                    for name in dirs:
                        os.rmdir(os.path.join(root, name))
                os.rmdir(temp_dir)
            except:
                pass
        return jsonify({
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        })


@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    for room_id, room in list(rooms.items()):
        user_info = room.users.get(request.sid)
        if user_info:
            user_id = room.remove_user(request.sid)
            leave_room(room_id)
            emit('awareness-update', {
                'user_id': user_id,
                'awareness': None,
                'awareness_list': room.get_all_awareness()
            }, room=room_id)
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

    print(f"User {user_name} ({user_id}) joined room {room_id}")

    latest_snapshot = room.get_latest_snapshot()
    emit('room-joined', {
        'room_id': room_id,
        'user_id': user_id,
        'users': room.get_users(),
        'awareness_list': room.get_all_awareness(),
        'latest_state': list(bytes(latest_snapshot)) if latest_snapshot else None,
        'current_version': room.current_version
    })

    emit('user-joined', {
        'user_id': user_id,
        'user_name': user_name,
        'users': room.get_users()
    }, room=room_id, include_self=False)


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
    emit('yjs-update', {
        'update': list(update_bytes),
        'user_id': room.users.get(request.sid, {}).get('user_id')
    }, room=room_id, include_self=False)


@socketio.on('save-snapshot')
def handle_save_snapshot(data):
    room_id = data.get('room_id')
    snapshot = data.get('snapshot')

    if not room_id or not snapshot:
        return

    room = rooms.get(room_id)
    if not room:
        return

    snapshot_bytes = bytes(snapshot)
    success = room.save_snapshot(snapshot_bytes)
    emit('snapshot-saved', {
        'success': success,
        'version': room.current_version
    })


@socketio.on('yjs-sync-step1')
def handle_yjs_sync_step1(data):
    room_id = data.get('room_id')
    update = data.get('update')

    if not room_id or not update:
        return

    room = rooms.get(room_id)
    if not room:
        return

    update_bytes = bytes(update)

    for sid in room.users.keys():
        if sid != request.sid:
            emit('yjs-sync-step1', {
                'update': list(update_bytes),
                'from_sid': request.sid
            }, to=sid)


@socketio.on('yjs-sync-step2')
def handle_yjs_sync_step2(data):
    room_id = data.get('room_id')
    update = data.get('update')
    target_sid = data.get('target_sid')

    if not room_id or not update:
        return

    room = rooms.get(room_id)
    if not room:
        return

    update_bytes = bytes(update)

    if target_sid and target_sid in room.users:
        emit('yjs-sync-step2', {
            'update': list(update_bytes)
        }, to=target_sid)


@socketio.on('awareness-update')
def handle_awareness_update(data):
    room_id = data.get('room_id')
    awareness = data.get('awareness')

    if not room_id:
        return

    room = rooms.get(room_id)
    if not room:
        return

    user_info = room.users.get(request.sid)
    if not user_info:
        return

    user_id = user_info['user_id']
    room.set_awareness(user_id, awareness)

    emit('awareness-update', {
        'user_id': user_id,
        'awareness': awareness,
        'awareness_list': room.get_all_awareness()
    }, room=room_id, include_self=False)


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
        user_id = room.remove_user(request.sid)
        leave_room(room_id)
        emit('awareness-update', {
            'user_id': user_id,
            'awareness': None,
            'awareness_list': room.get_all_awareness()
        }, room=room_id)
        emit('user-left', {
            'user_id': user_info['user_id'],
            'user_name': user_info['user_name'],
            'users': room.get_users()
        }, room=room_id)

        if not room.has_users():
            del rooms[room_id]


if __name__ == '__main__':
    print("Starting collaborative code editor backend on port 2221...")
    socketio.run(app, host='0.0.0.0', port=2221, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
