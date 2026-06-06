const USER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
  '#dfe6e9', '#fd79a8', '#a29bfe', '#00b894', '#e17055',
]

function UserList({ users, currentUserId }) {
  const getUserColor = (userId) => {
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash)
    }
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Online Users</h3>
      <div style={styles.list}>
        {users.map((user) => (
          <div
            key={user.user_id}
            style={{
              ...styles.userItem,
              borderLeft: `4px solid ${getUserColor(user.user_id)}`,
            }}
          >
            <div style={styles.userInfo}>
              <span style={styles.username}>
                {user.username}
                {user.user_id === currentUserId && (
                  <span style={styles.youBadge}> (you)</span>
                )}
              </span>
              <span style={styles.language}>{user.language}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '16px',
  },
  title: {
    color: '#e0e0e0',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  userItem: {
    background: '#2d2d30',
    borderRadius: '6px',
    padding: '10px 12px',
    overflow: 'hidden',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  username: {
    color: '#e0e0e0',
    fontSize: '13px',
    fontWeight: '500',
  },
  youBadge: {
    color: '#9cdcfe',
    fontSize: '11px',
    fontWeight: '400',
  },
  language: {
    color: '#888',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
}

export default UserList
