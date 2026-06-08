import { useState, useEffect } from 'react'
import './VersionHistory.css'

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
    if (!window.confirm(`确定要回退到版本 ${version} 吗？此操作将通知所有在线用户。`)) {
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
    <div className="vh-overlay" onClick={onClose}>
      <div className="vh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vh-header">
          <h3 className="vh-title">📜 版本历史</h3>
          <button className="vh-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="vh-refresh-bar">
          <button className="vh-refresh-btn" onClick={loadVersions} disabled={loading}>
            {loading ? '加载中...' : '🔄 刷新'}
          </button>
          <span className="vh-current-version">
            当前版本: {yjsConn ? yjsConn.currentVersion() : 0}
          </span>
        </div>

        <div className="vh-version-list">
          {loading && (
            <div className="vh-empty">加载版本列表中...</div>
          )}
          {!loading && versions.length === 0 && (
            <div className="vh-empty">暂无历史版本</div>
          )}
          {!loading && versions.map((v) => (
            <div key={v.id} className="vh-version-item">
              <div className="vh-version-info">
                <div className="vh-version-number">版本 #{v.version}</div>
                <div className="vh-version-time">{formatDate(v.created_at)}</div>
              </div>
              <button
                className="vh-rollback-btn"
                onClick={() => handleRollback(v.version)}
                disabled={rollingBack === v.version}
                style={{ opacity: rollingBack === v.version ? 0.5 : 1 }}
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
