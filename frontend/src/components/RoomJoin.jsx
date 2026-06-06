import { useState } from 'react'

export default function RoomJoin({ onJoin }) {
  const [roomId, setRoomId] = useState('')
  const [userName, setUserName] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (roomId.trim() && userName.trim()) {
      onJoin(roomId.trim(), userName.trim())
    }
  }

  function generateRandomRoom() {
    const random = Math.random().toString(36).substring(2, 10)
    setRoomId(`room-${random}`)
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>✨ 协作代码编辑器</h1>
        <p style={styles.subtitle}>基于 CRDT (Yjs) 的多人实时协作编程</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>用户名</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="输入你的名字"
              style={styles.input}
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>房间 ID</label>
            <div style={styles.roomInputGroup}>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="输入房间 ID 或点击生成"
                style={{ ...styles.input, flex: 1 }}
              />
              <button
                type="button"
                onClick={generateRandomRoom}
                style={styles.genBtn}
              >
                生成
              </button>
            </div>
          </div>

          <button type="submit" style={styles.joinBtn} disabled={!roomId || !userName}>
            加入房间
          </button>
        </form>

        <div style={styles.features}>
          <div style={styles.featureItem}>
            <span style={styles.featureIcon}>🔄</span>
            <span>实时 CRDT 同步</span>
          </div>
          <div style={styles.featureItem}>
            <span style={styles.featureIcon}>💻</span>
            <span>Monaco Editor</span>
          </div>
          <div style={styles.featureItem}>
            <span style={styles.featureIcon}>🎨</span>
            <span>多语言高亮</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
  },
  card: {
    backgroundColor: '#1e1e2e',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    border: '1px solid #333'
  },
  title: {
    color: '#fff',
    fontSize: '28px',
    marginBottom: '8px',
    textAlign: 'center'
  },
  subtitle: {
    color: '#888',
    fontSize: '14px',
    marginBottom: '32px',
    textAlign: 'center'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    color: '#ccc',
    fontSize: '14px',
    fontWeight: 500
  },
  input: {
    backgroundColor: '#2a2a3a',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  roomInputGroup: {
    display: 'flex',
    gap: '8px'
  },
  genBtn: {
    backgroundColor: '#444',
    color: '#ddd',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s'
  },
  joinBtn: {
    backgroundColor: '#4ECDC4',
    color: '#1a1a2e',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px'
  },
  features: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    marginTop: '32px',
    paddingTop: '24px',
    borderTop: '1px solid #333'
  },
  featureItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    color: '#888',
    fontSize: '12px'
  },
  featureIcon: {
    fontSize: '20px'
  }
}
