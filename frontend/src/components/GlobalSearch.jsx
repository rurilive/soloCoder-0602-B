import { useState, useEffect, useMemo, useRef } from 'react'

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightMatches(text, keyword, isRegex, caseSensitive) {
  if (!keyword) return text
  try {
    const pattern = isRegex ? keyword : escapeRegExp(keyword)
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(pattern, flags)
    const parts = []
    let lastIndex = 0
    let match
    while ((match = regex.exec(text)) !== null) {
      if (match.index === regex.lastIndex) {
        regex.lastIndex++
        continue
      }
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      }
      parts.push({ type: 'match', content: match[0] })
      lastIndex = match.index + match[0].length
      if (match[0].length === 0) {
        regex.lastIndex++
      }
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) })
    }
    return parts.length > 0 ? parts : text
  } catch (e) {
    return text
  }
}

function renderHighlighted(text, keyword, isRegex, caseSensitive) {
  const result = highlightMatches(text, keyword, isRegex, caseSensitive)
  if (typeof result === 'string') return result
  return result.map((part, i) =>
    part.type === 'match' ? (
      <span key={i} style={styles.matchHighlight}>{part.content}</span>
    ) : (
      <span key={i}>{part.content}</span>
    )
  )
}

export default function GlobalSearch({ files, yjsConn, onJumpToLine, contentVersion }) {
  const [isOpen, setIsOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isOpen])

  const searchResults = useMemo(() => {
    if (!keyword.trim() || !yjsConn || !files || files.length === 0) {
      return []
    }

    const results = []
    let pattern
    try {
      const patternStr = isRegex ? keyword : escapeRegExp(keyword)
      const flags = caseSensitive ? 'g' : 'gi'
      pattern = new RegExp(patternStr, flags)
    } catch (e) {
      return []
    }

    for (const file of files) {
      const ytext = yjsConn.getFileContent(file.id)
      if (!ytext) continue
      const content = ytext.toString()
      const lines = content.split('\n')
      const fileMatches = []

      for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0
        if (pattern.test(lines[i])) {
          fileMatches.push({
            lineNumber: i + 1,
            lineContent: lines[i]
          })
        }
      }

      if (fileMatches.length > 0) {
        results.push({
          file,
          matches: fileMatches
        })
      }
    }

    return results
  }, [keyword, files, yjsConn, isRegex, caseSensitive, contentVersion])

  const totalMatches = searchResults.reduce((sum, r) => sum + r.matches.length, 0)

  function handleJump(fileId, lineNumber) {
    if (onJumpToLine) {
      onJumpToLine(fileId, lineNumber)
    }
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    const iconMap = {
      'js': '📜',
      'jsx': '⚛️',
      'ts': '🔷',
      'tsx': '⚛️',
      'py': '🐍',
      'html': '🌐',
      'htm': '🌐',
      'css': '🎨',
      'json': '📋'
    }
    return iconMap[ext] || '📄'
  }

  if (!isOpen) {
    return (
      <div style={styles.triggerContainer}>
        <button
          onClick={() => setIsOpen(true)}
          style={styles.triggerBtn}
          title="全局搜索 (Ctrl+Shift+F)"
        >
          🔍 搜索
        </button>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <style>{`
        .gs-match-item:hover {
          background-color: #2a2d2e !important;
        }
        .gs-file-header:hover {
          background-color: #37373d !important;
        }
      `}</style>
      <div style={styles.header}>
        <span style={styles.title}>搜索</span>
        <button
          onClick={() => {
            setIsOpen(false)
            setKeyword('')
          }}
          style={styles.closeBtn}
          title="关闭搜索"
        >
          ×
        </button>
      </div>

      <div style={styles.searchBar}>
        <input
          ref={inputRef}
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入搜索关键词..."
          style={styles.input}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setKeyword('')
            }
          }}
        />
      </div>

      <div style={styles.toggleBar}>
        <button
          onClick={() => setIsRegex(!isRegex)}
          style={{
            ...styles.toggleBtn,
            backgroundColor: isRegex ? '#094771' : 'transparent',
            color: isRegex ? '#fff' : '#888',
            borderColor: isRegex ? '#094771' : '#444'
          }}
          title="正则表达式"
        >
          .*
        </button>
        <button
          onClick={() => setCaseSensitive(!caseSensitive)}
          style={{
            ...styles.toggleBtn,
            backgroundColor: caseSensitive ? '#094771' : 'transparent',
            color: caseSensitive ? '#fff' : '#888',
            borderColor: caseSensitive ? '#094771' : '#444'
          }}
          title="大小写敏感"
        >
          Aa
        </button>
        {keyword && (
          <span style={styles.matchCount}>
            {totalMatches} 个结果 in {searchResults.length} 个文件
          </span>
        )}
      </div>

      <div style={styles.resultsContainer}>
        {!keyword.trim() ? (
          <div style={styles.placeholder}>输入关键词开始搜索</div>
        ) : totalMatches === 0 ? (
          <div style={styles.noResults}>没有找到匹配结果</div>
        ) : (
          searchResults.map(({ file, matches }) => (
            <div key={file.id} style={styles.fileGroup}>
              <div style={styles.fileHeader} className="gs-file-header">
                <span style={styles.fileIcon}>{getFileIcon(file.name)}</span>
                <span style={styles.fileName}>{file.name}</span>
                <span style={styles.fileMatchCount}>{matches.length}</span>
              </div>
              <div style={styles.matchList}>
                {matches.map((match, idx) => (
                  <div
                    key={idx}
                    style={styles.matchItem}
                    className="gs-match-item"
                    onClick={() => handleJump(file.id, match.lineNumber)}
                    title={`跳转到第 ${match.lineNumber} 行`}
                  >
                    <span style={styles.lineNumber}>{match.lineNumber}</span>
                    <span style={styles.lineContent}>
                      {renderHighlighted(match.lineContent, keyword, isRegex, caseSensitive)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    borderBottom: '1px solid #333',
    backgroundColor: '#252526',
    display: 'flex',
    flexDirection: 'column',
    height: '340px',
    flexShrink: 0,
    overflow: 'hidden'
  },
  triggerContainer: {
    borderBottom: '1px solid #333',
    padding: '4px 8px'
  },
  triggerBtn: {
    width: '100%',
    backgroundColor: 'transparent',
    color: '#ccc',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid #333'
  },
  title: {
    color: '#ccc',
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 6px',
    borderRadius: '3px'
  },
  searchBar: {
    padding: '8px 12px'
  },
  input: {
    width: '100%',
    backgroundColor: '#1e1e1e',
    color: '#fff',
    border: '1px solid #094771',
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  toggleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 12px 8px 12px'
  },
  toggleBtn: {
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #444',
    borderRadius: '3px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'monospace',
    minWidth: '28px'
  },
  matchCount: {
    color: '#888',
    fontSize: '11px',
    marginLeft: 'auto'
  },
  resultsContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column'
  },
  placeholder: {
    padding: '16px 12px',
    color: '#666',
    fontSize: '12px',
    fontStyle: 'italic'
  },
  noResults: {
    padding: '16px 12px',
    color: '#666',
    fontSize: '12px'
  },
  fileGroup: {
    marginBottom: '4px'
  },
  fileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: '#2d2d30'
  },
  fileIcon: {
    fontSize: '13px',
    flexShrink: 0
  },
  fileName: {
    color: '#ddd',
    fontSize: '12px',
    fontWeight: 500,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  fileMatchCount: {
    backgroundColor: '#444',
    color: '#ccc',
    borderRadius: '10px',
    padding: '1px 6px',
    fontSize: '10px',
    fontWeight: 600
  },
  matchList: {
    paddingLeft: '4px'
  },
  matchItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 12px 3px 20px',
    cursor: 'pointer',
    transition: 'background-color 0.15s'
  },
  matchItemHover: {
    backgroundColor: '#2a2d2e'
  },
  lineNumber: {
    color: '#858585',
    fontSize: '11px',
    fontFamily: 'monospace',
    minWidth: '32px',
    textAlign: 'right',
    flexShrink: 0
  },
  lineContent: {
    color: '#d4d4d4',
    fontSize: '12px',
    fontFamily: 'monospace',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  matchHighlight: {
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    color: '#ff6b6b',
    fontWeight: 600,
    borderRadius: '2px',
    padding: '0 1px'
  }
}
