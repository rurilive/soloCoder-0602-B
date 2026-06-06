export default function UserList({ users, currentUserId }) {
  return (
    <div style={styles.container}>
      <h3 style={styles.title}>
        在线用户 ({users.length})
      </h3>
      <div style={styles.userList}>
        {users.map((user, idx) => (
          <div key={idx} style={styles.userItem}>
            <div
              style={{
                ...styles.avatar,
                backgroundColor: user.color || '#888'
              }}
            >
              {user.name ? user.name.charAt(0).toUpperCase() : '?'}
            </div>
            <span style={styles.userName}>
              {user.name || 'Anonymous'}
              {user.id === currentUserId && (
                <span style={styles.youTag}> (你)</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '12px',
    borderBottom: '1px solid #333'
  },
  title: {
    color: '#ccc',
    fontSize: '14px',
    marginBottom: '8px',
    fontWeight: 600
  },
  userList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  userItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  avatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  userName: {
    color: '#ddd',
    fontSize: '13px'
  },
  youTag: {
    color: '#4ECDC4',
    fontSize: '11px'
  }
}
