import { useRef, useEffect } from 'react'

export default function Terminal({ logs, onClear }) {
  const terminalRef = useRef(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  function getLogStyle(type) {
    switch (type) {
      case 'error':
        return { color: '#F44336' }
      case 'warn':
        return { color: '#FF9800' }
      case 'info':
        return { color: '#2196F3' }
      case 'success':
        return { color: '#4CAF50' }
      case 'input':
        return { color: '#9C27B0' }
      default:
        return { color: '#ddd' }
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>终端</span>
        <div style={styles.headerActions}>
          <span style={styles.logCount}>{logs.length} 条输出</span>
          <button onClick={onClear} style={styles.clearBtn} title="清空终端">
            🗑️
          </button>
        </div>
      </div>
      <div ref={terminalRef} style={styles.terminal}>
        {logs.length === 0 ? (
          <div style={styles.emptyState}>
            运行代码后，输出将显示在这里...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ ...styles.logLine, ...getLogStyle(log.type) }}>
              <span style={styles.prefix}>{log.type === 'input' ? '> ' : ''}</span>
              <span style={styles.logContent}>{log.content}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e1e',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
    flexShrink: 0
  },
  title: {
    color: '#ccc',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  logCount: {
    color: '#666',
    fontSize: '11px'
  },
  clearBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 6px',
    borderRadius: '3px'
  },
  terminal: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    fontSize: '13px',
    lineHeight: '1.5'
  },
  emptyState: {
    color: '#555',
    fontStyle: 'italic',
    padding: '16px 0'
  },
  logLine: {
    margin: '2px 0',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap'
  },
  prefix: {
    userSelect: 'none',
    opacity: 0.7
  },
  logContent: {
    display: 'inline'
  }
}
