import { useState, useEffect } from 'react'

export default function VersionHistory({ yjsConn, onClose }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [rollingBack, setRollingBack] = useState(null)

  useEffect(() => {
    loadVersions()
  }, [yjsConn])

  async function loadVersions() {
    if (!yjsConn) return
    setLoading(true)
    const data = await yjsConn.fetchVersions()
    setVersions(data)
    setLoading(false)
  }

  async function handleRollback(version) {
    if (!yjsConn) return
    if (!confirm(`确定要回退到版本 ${version} 吗？此操作将通知所有在线用户。`)) {
      return
    }
    setRollingBack(version)
    const result = await yjsConn.rollbackToVersion(version)
    setRollingBack(null)
    if (result.success) {
      alert(`已成功回退到版本 ${version}`)
      loadVersions()
    } else {
      alert(`回退失败: ${result.error || '未知错误'}`)
    }
  }

  function formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>📜 版本历史</h3>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        
        <div style={styles.refreshBar}>
          <button onClick={loadVersions} style={styles.refreshBtn} disabled={loading}>
            {loading ? '加载中...' : '🔄 刷新'}
          </button>
          <span style={styles.currentVersion}>
            当前版本: {yjsConn ? yjsConn.currentVersion() : 0}
          </span>
        </div>

        <div style={styles.versionList}>
          {loading && (
            <div style={styles.empty}>加载版本列表中...</div>
          )}
          {!loading && versions.length === 0 && (
            <div style={styles.empty}>暂无历史版本</div>
          )}
          {!loading && versions.map((v) => (
            <div key={v.id} style={styles.versionItem}>
              <div style={styles.versionInfo}>
                <div style={styles.versionNumber}>版本 #{v.version}</div>
                <div style={styles.versionTime}>{formatDate(v.created_at)}</div>
              </div>
              <button
                onClick={() => handleRollback(v.version)}
                disabled={rollingBack === v.version}
                style={{
                  ...styles.rollbackBtn,
                  opacity: rollingBack === v.version ? 0.5 : 1
                }}
              >
                {rollingBack === v.version ? '回退中...' : '⏪ 回退'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#252526',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    margin: 0,
    color: '#fff',
    fontSize: '18px'
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0 8px'
  },
  refreshBar: {
    padding: '12px 20px',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  refreshBtn: {
    backgroundColor: '#3c3c3c',
    color: '#ddd',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  currentVersion: {
    color: '#888',
    fontSize: '12px'
  },
  versionList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0'
  },
  versionItem: {
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #333',
    '&:hover': {
      backgroundColor: '#2d2d2d'
    }
  },
  versionInfo: {
    flex: 1
  },
  versionNumber: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '4px'
  },
  versionTime: {
    color: '#888',
    fontSize: '12px'
  },
  rollbackBtn: {
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  empty: {
    padding: '40px 20px',
    textAlign: 'center',
    color: '#666',
    fontSize: '14px'
  }
}
