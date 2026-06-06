import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import CodeEditor from './components/CodeEditor'
import UserList from './components/UserList'

const SERVER_URL = 'http://localhost:2221'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'json', label: 'JSON' },
]

function App() {
  const [socket, setSocket] = useState(null)
  const [joined, setJoined] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [username, setUsername] = useState('')
  const [userId, setUserId] = useState(() => uuidv4())
  const [users, setUsers] = useState([])
  const [language, setLanguage] = useState('javascript')
  const [initialUpdates, setInitialUpdates] = useState([])

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
    })

    newSocket.on('connect', () => {
      console.log('Connected to server')
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('room_joined', (data) => {
      setUserId(data.user_id)
      setUsers(data.users)
      setInitialUpdates(data.updates || [])
      setJoined(true)
    })

    socket.on('user_joined', (data) => {
      setUsers((prev) => {
        if (prev.find((u) => u.user_id === data.user.user_id)) {
          return prev
        }
        return [...prev, data.user]
      })
    })

    socket.on('user_left', (data) => {
      setUsers((prev) => prev.filter((u) => u.user_id !== data.user_id))
    })

    socket.on('user_updated', (data) => {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === data.user.user_id ? data.user : u
        )
      )
    })

    return () => {
      socket.off('room_joined')
      socket.off('user_joined')
      socket.off('user_left')
      socket.off('user_updated')
    }
  }, [socket])

  const handleJoin = (e) => {
    e.preventDefault()
    if (!roomId.trim() || !username.trim() || !socket) return

    socket.emit('join_room', {
      room_id: roomId.trim(),
      user_id: userId,
      username: username.trim(),
      language: language,
    })
  }

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang)
    if (socket && joined) {
      socket.emit('change_language', {
        room_id: roomId,
        user_id: userId,
        language: newLang,
      })
    }
  }

  if (!joined) {
    return (
      <div style={styles.container}>
        <div style={styles.loginBox}>
          <h1 style={styles.title}>Collaborative Code Editor</h1>
          <p style={styles.subtitle}>Real-time collaborative editing with CRDT</p>
          <form onSubmit={handleJoin} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Room ID</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room name or ID"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={styles.select}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" style={styles.button}>
              Join Room
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.headerTitle}>Room: {roomId}</h2>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={styles.langSelect}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userCount}>
            {users.length} user{users.length !== 1 ? 's' : ''} online
          </span>
        </div>
      </div>
      <div style={styles.main}>
        <div style={styles.editorContainer}>
          <CodeEditor
            socket={socket}
            roomId={roomId}
            userId={userId}
            language={language}
            initialUpdates={initialUpdates}
          />
        </div>
        <div style={styles.sidebar}>
          <UserList users={users} currentUserId={userId} />
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  loginBox: {
    background: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    width: '100%',
    maxWidth: '420px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: '8px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '32px',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  input: {
    padding: '12px 16px',
    fontSize: '14px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  select: {
    padding: '12px 16px',
    fontSize: '14px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    outline: 'none',
    background: 'white',
    cursor: 'pointer',
  },
  button: {
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'transform 0.2s',
  },
  app: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e1e',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: '#252526',
    borderBottom: '1px solid #333',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  headerTitle: {
    color: '#e0e0e0',
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
  },
  langSelect: {
    padding: '6px 12px',
    fontSize: '13px',
    background: '#3c3c3c',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    outline: 'none',
  },
  headerRight: {},
  userCount: {
    color: '#9cdcfe',
    fontSize: '13px',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  editorContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '240px',
    background: '#252526',
    borderLeft: '1px solid #333',
    overflowY: 'auto',
  },
}

export default App
