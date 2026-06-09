import uuid
import subprocess
import tempfile
import os
import sqlite3
import threading
import time
from difflib import SequenceMatcher
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

try:
    import pycrdt as Y
    HAS_PYCRDT = True
except ImportError:
    Y = None
    HAS_PYCRDT = False

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
            state_vector BLOB NOT NULL,
            incremental_update BLOB NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(room_id, version)
        )
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_room_id ON versions(room_id)
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_chat_room_id ON chat_messages(room_id)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at)
    ''')
    conn.commit()
    conn.close()


init_db_schema()


def get_latest_version_row(room_id):
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


def get_all_version_updates(room_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT version, state_vector, incremental_update FROM versions WHERE room_id = ? ORDER BY version ASC',
        (room_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def save_incremental_to_db(room_id, version, state_vector, incremental_update):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO versions (room_id, version, state_vector, incremental_update, created_at) VALUES (?, ?, ?, ?, ?)',
        (room_id, version, state_vector, incremental_update, int(time.time()))
    )
    conn.commit()
    conn.close()


def get_next_version(room_id):
    latest = get_latest_version_row(room_id)
    if latest:
        return latest['version'] + 1
    return 1


def delete_versions_after(room_id, target_version):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'DELETE FROM versions WHERE room_id = ? AND version > ?',
        (room_id, target_version)
    )
    conn.commit()
    conn.close()


def restore_doc_from_versions(room_id, target_version=None):
    if not HAS_PYCRDT:
        return None
    doc = Y.Doc()
    versions = get_all_version_updates(room_id)
    for v in versions:
        if target_version is not None and v['version'] > target_version:
            break
        doc.apply_update(bytes(v['incremental_update']))
    return doc


class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.users = {}
        self.awareness_states = {}
        self.current_version = 0
        self._lock = threading.Lock()
        self.ydoc = Y.Doc() if HAS_PYCRDT else None
        self._last_saved_state = None
        self._load_from_db()

    def _load_from_db(self):
        if not HAS_PYCRDT:
            return
        with self._lock:
            latest = get_latest_version_row(self.room_id)
            if latest:
                self.current_version = latest['version']
                restored = restore_doc_from_versions(self.room_id)
                if restored:
                    self.ydoc = restored
                    self._last_saved_state = bytes(latest['state_vector'])

    def apply_update(self, update_bytes):
        if not HAS_PYCRDT:
            return
        with self._lock:
            try:
                self.ydoc.apply_update(update_bytes)
            except Exception as e:
                print(f"Error applying update for room {self.room_id}: {e}")

    def save_snapshot(self):
        if not HAS_PYCRDT:
            return False
        with self._lock:
            try:
                current_state = self.ydoc.get_state()
                if self._last_saved_state == current_state:
                    return False
                inc_update = self.ydoc.get_update(self._last_saved_state)
                next_ver = get_next_version(self.room_id)
                save_incremental_to_db(
                    self.room_id,
                    next_ver,
                    current_state,
                    inc_update
                )
                self.current_version = next_ver
                self._last_saved_state = current_state
                return True
            except Exception as e:
                print(f"Error saving snapshot for room {self.room_id}: {e}")
                return False

    def get_full_state_update(self):
        if not HAS_PYCRDT:
            return None
        with self._lock:
            try:
                return self.ydoc.get_update()
            except Exception as e:
                print(f"Error getting state for room {self.room_id}: {e}")
                return None

    @staticmethod
    def _compute_diff_summary(current_text, target_text):
        if current_text == target_text:
            return 'no changes'
        sm = SequenceMatcher(None, current_text, target_text)
        ops = [(tag, i1, i2, j1, j2)
               for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != 'equal']
        summary_parts = []
        for tag, i1, i2, j1, j2 in ops:
            if tag == 'replace':
                summary_parts.append(
                    f'replace({i1}:{i2} -> {j1}:{j2})')
            elif tag == 'delete':
                summary_parts.append(f'delete({i1}:{i2})')
            elif tag == 'insert':
                summary_parts.append(f'insert({j1}:{j2})')
        return f'{len(ops)} ops: {", ".join(summary_parts)}'

    def rollback_to_version(self, target_version):
        if not HAS_PYCRDT:
            return None
        with self._lock:
            try:
                target_doc = restore_doc_from_versions(self.room_id, target_version)
                if not target_doc:
                    return None
                sv_before = self.ydoc.get_state()
                target_contents = target_doc.get('fileContents')
                current_contents = self.ydoc.get('fileContents')
                with self.ydoc.new_transaction() as txn:
                    if target_contents and current_contents:
                        target_keys = set(target_contents.keys())
                        current_keys = set(current_contents.keys())
                        for key in current_keys - target_keys:
                            del current_contents[key]
                        for key in target_keys:
                            target_text_obj = target_contents[key]
                            target_text = str(target_text_obj)
                            if key in current_keys:
                                current_text_obj = current_contents[key]
                                current_text = str(current_text_obj)
                                diff_summary = self._compute_diff_summary(
                                    current_text, target_text)
                                print(f"Rollback diff [{key}]: {diff_summary}")
                                current_text_obj.clear()
                                current_text_obj.insert(0, target_text)
                            else:
                                new_text = Y.Text()
                                new_text.insert(0, target_text)
                                current_contents[key] = new_text
                    target_files = target_doc.get('files')
                    current_files = self.ydoc.get('files')
                    if target_files and current_files:
                        for key in list(current_files.keys()):
                            if key not in target_files:
                                del current_files[key]
                        for key in target_files:
                            current_files[key] = target_files[key]
                rollback_update = self.ydoc.get_update(sv_before)
                self.current_version = target_version
                self._last_saved_state = self.ydoc.get_state()
                delete_versions_after(self.room_id, target_version)
                return rollback_update
            except Exception as e:
                print(f"Error rolling back room {self.room_id}: {e}")
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
        start_auto_save(room_id)
    return rooms[room_id]


def start_auto_save(room_id):
    if room_id in auto_save_timers:
        return
    def auto_save_loop():
        while room_id in rooms:
            time.sleep(5)
            room = rooms.get(room_id)
            if room:
                room.save_snapshot()
    timer = threading.Thread(target=auto_save_loop, daemon=True)
    timer.start()
    auto_save_timers[room_id] = timer


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
    room = rooms.get(room_id)
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    rollback_update = room.rollback_to_version(target_version)
    if rollback_update is None:
        return jsonify({'error': 'Rollback failed'}), 500
    socketio.emit('yjs-update', {
        'update': list(bytes(rollback_update)),
        'user_id': 'system'
    }, room=room_id)
    socketio.emit('version-rolled-back', {
        'version': target_version
    }, room=room_id)
    return {'success': True, 'version': target_version}


@app.route('/api/rooms/<room_id>/state', methods=['GET'])
def get_room_state(room_id):
    room = get_or_create_room(room_id)
    state = room.get_full_state_update()
    if state is None:
        return {'state': None, 'version': room.current_version}
    return {'state': list(bytes(state)), 'version': room.current_version}


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

    latest_state = room.get_full_state_update()
    emit('room-joined', {
        'room_id': room_id,
        'user_id': user_id,
        'users': room.get_users(),
        'awareness_list': room.get_all_awareness(),
        'latest_state': list(bytes(latest_state)) if latest_state else None,
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
    room.apply_update(update_bytes)
    emit('yjs-update', {
        'update': list(update_bytes),
        'user_id': room.users.get(request.sid, {}).get('user_id')
    }, room=room_id, include_self=False)


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
    room.apply_update(update_bytes)

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
    room.apply_update(update_bytes)

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
