import { useState, useEffect, useCallback } from 'react'
import { createYjsConnection } from './collab/yjsSocket'
import RoomJoin from './components/RoomJoin'
import CodeEditor from './components/CodeEditor'
import UserList from './components/UserList'
import LanguageSelector from './components/LanguageSelector'

function App() {
  const [joined, setJoined] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [yjsConn, setYjsConn] = useState(null)
  const [users, setUsers] = useState([])
  const [language, setLanguage] = useState('javascript')
  const [connectionStatus, setConnectionStatus] = useState('connecting')

  const handleJoin = useCallback((room, name) => {
    const uid = 'user_' + Math.random().toString(36).substring(2, 10)
    setRoomId(room)
    setUserId(uid)
    setUserName(name)
    setJoined(true)
  }, [])

  useEffect(() => {
    if (!joined || !roomId || !userId || !userName) return

    const conn = createYjsConnection(roomId, userId, userName)
    setYjsConn(conn)

    conn.socket.on('connect', () => {
      setConnectionStatus('connected')
    })

    conn.socket.on('disconnect', () => {
      setConnectionStatus('disconnected')
    })

    conn.socket.on('connect_error', () => {
      setConnectionStatus('error')
    })

    conn.onUsersChange((userList) => {
      setUsers(userList)
    })

    return () => {
      conn.destroy()
      setYjsConn(null)
    }
  }, [joined, roomId, userId, userName])

  function handleLeave() {
    if (yjsConn) {
      yjsConn.destroy()
    }
    setJoined(false)
    setRoomId('')
    setUserId('')
    setUserName('')
    setYjsConn(null)
    setUsers([])
  }

  if (!joined) {
    return <RoomJoin onJoin={handleJoin} />
  }

  return (
    <div style={styles.app}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.logo}>✨ CodeCollab</h2>
          <div style={{
            ...styles.statusBadge,
            backgroundColor: connectionStatus === 'connected' ? '#4CAF50' : '#FF9800'
          }}>
            {connectionStatus === 'connected' ? '已连接' : connectionStatus}
          </div>
        </div>

        <UserList users={users} currentUserId={userId} />

        <div style={styles.sidebarSection}>
          <LanguageSelector language={language} onChange={setLanguage} />
        </div>

        <div style={styles.roomInfo}>
          <div style={styles.roomInfoLabel}>房间 ID</div>
          <div style={styles.roomIdBox}>{roomId}</div>
          <button onClick={() => navigator.clipboard.writeText(roomId)} style={styles.copyBtn}>
            复制房间 ID
          </button>
        </div>

        <div style={styles.spacer} />

        <button onClick={handleLeave} style={styles.leaveBtn}>
          离开房间
        </button>
      </div>

      <div style={styles.main}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.fileName}>
              {language === 'python' ? 'main.py' :
               language === 'typescript' ? 'main.ts' :
               language === 'html' ? 'index.html' :
               language === 'css' ? 'style.css' :
               language === 'json' ? 'data.json' : 'main.js'}
            </span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.headerInfo}>
              {users.length} 人在线
            </span>
          </div>
        </div>
        <div style={styles.editorContainer}>
          {yjsConn && (
            <CodeEditor yjsConn={yjsConn} language={language} />
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  app: {
    display: 'flex',
    width: '100%',
    height: '100%',
    backgroundColor: '#1e1e1e'
  },
  sidebar: {
    width: '260px',
    backgroundColor: '#252526',
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0
  },
  sidebarHeader: {
    padding: '16px 12px',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  logo: {
    color: '#fff',
    fontSize: '18px',
    fontWeight: 600
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 500
  },
  sidebarSection: {
    padding: '12px',
    borderBottom: '1px solid #333'
  },
  roomInfo: {
    padding: '12px',
    borderBottom: '1px solid #333'
  },
  roomInfoLabel: {
    color: '#888',
    fontSize: '12px',
    marginBottom: '6px'
  },
  roomIdBox: {
    backgroundColor: '#1e1e1e',
    color: '#ddd',
    padding: '8px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    marginBottom: '8px'
  },
  copyBtn: {
    width: '100%',
    backgroundColor: '#333',
    color: '#ddd',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  spacer: {
    flex: 1
  },
  leaveBtn: {
    margin: '12px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0
  },
  header: {
    height: '48px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    justifyContent: 'space-between'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  fileName: {
    color: '#ccc',
    fontSize: '14px',
    fontWeight: 500
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  headerInfo: {
    color: '#888',
    fontSize: '13px'
  },
  editorContainer: {
    flex: 1,
    minHeight: 0
  }
}

export default App
