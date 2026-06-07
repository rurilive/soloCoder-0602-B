import { useState, useRef, useEffect } from 'react'

export default function FileTree({ files, selectedFileId, onSelectFile, onCreateFile, onRenameFile, onDeleteFile }) {
  const [newFileName, setNewFileName] = useState('')
  const [showNewFileInput, setShowNewFileInput] = useState(false)
  const [editingFileId, setEditingFileId] = useState(null)
  const [editName, setEditName] = useState('')
  const newFileInputRef = useRef(null)
  const editInputRef = useRef(null)

  useEffect(() => {
    if (showNewFileInput && newFileInputRef.current) {
      newFileInputRef.current.focus()
    }
  }, [showNewFileInput])

  useEffect(() => {
    if (editingFileId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingFileId])

  function handleCreateFile(e) {
    e.preventDefault()
    if (newFileName.trim()) {
      onCreateFile(newFileName.trim())
      setNewFileName('')
      setShowNewFileInput(false)
    }
  }

  function handleStartRename(file) {
    setEditingFileId(file.id)
    setEditName(file.name)
  }

  function handleRenameSubmit(e) {
    e.preventDefault()
    if (editName.trim() && editingFileId) {
      onRenameFile(editingFileId, editName.trim())
    }
    setEditingFileId(null)
    setEditName('')
  }

  function handleKeyDown(e, file) {
    if (e.key === 'Enter') {
      handleStartRename(file)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (window.confirm(`确定要删除文件 "${file.name}" 吗？`)) {
        onDeleteFile(file.id)
      }
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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>文件</span>
        <button
          onClick={() => setShowNewFileInput(true)}
          style={styles.addBtn}
          title="新建文件"
        >
          +
        </button>
      </div>

      {showNewFileInput && (
        <form onSubmit={handleCreateFile} style={styles.newFileForm}>
          <input
            ref={newFileInputRef}
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="文件名 (如: app.js)"
            style={styles.input}
            onBlur={() => {
              if (!newFileName.trim()) {
                setShowNewFileInput(false)
              }
            }}
          />
        </form>
      )}

      <div style={styles.fileList}>
        {files.length === 0 ? (
          <div style={styles.emptyState}>暂无文件，点击 + 创建</div>
        ) : (
          files.map((file) => (
            <div key={file.id}>
              {editingFileId === file.id ? (
                <form onSubmit={handleRenameSubmit} style={styles.renameForm}>
                  <span style={styles.fileIcon}>{getFileIcon(file.name)}</span>
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={styles.renameInput}
                    onBlur={handleRenameSubmit}
                  />
                </form>
              ) : (
                <div
                  style={{
                    ...styles.fileItem,
                    backgroundColor: selectedFileId === file.id ? '#094771' : 'transparent'
                  }}
                  onClick={() => onSelectFile(file.id)}
                  onDoubleClick={() => handleStartRename(file)}
                  onKeyDown={(e) => handleKeyDown(e, file)}
                  tabIndex={0}
                >
                  <span style={styles.fileIcon}>{getFileIcon(file.name)}</span>
                  <span style={styles.fileName}>{file.name}</span>
                  <div style={styles.fileActions}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(file)
                      }}
                      style={styles.actionBtn}
                      title="重命名"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`确定要删除文件 "${file.name}" 吗？`)) {
                          onDeleteFile(file.id)
                        }
                      }}
                      style={styles.actionBtn}
                      title="删除"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}
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
    overflow: 'hidden'
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
  addBtn: {
    backgroundColor: 'transparent',
    color: '#ccc',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  },
  newFileForm: {
    padding: '8px 12px',
    borderBottom: '1px solid #333'
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
  fileList: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0'
  },
  emptyState: {
    padding: '16px 12px',
    color: '#666',
    fontSize: '12px',
    fontStyle: 'italic'
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    outline: 'none'
  },
  fileIcon: {
    fontSize: '14px',
    flexShrink: 0
  },
  fileName: {
    color: '#ddd',
    fontSize: '13px',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  fileActions: {
    display: 'flex',
    gap: '4px',
    opacity: 1,
    transition: 'opacity 0.15s'
  },
  actionBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
    borderRadius: '3px'
  },
  renameForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: '#1e1e1e'
  },
  renameInput: {
    flex: 1,
    backgroundColor: '#252526',
    color: '#fff',
    border: '1px solid #094771',
    borderRadius: '4px',
    padding: '4px 6px',
    fontSize: '13px',
    outline: 'none'
  }
}
