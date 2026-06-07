import { useState, useEffect, useCallback, useRef } from 'react'
import { createYjsConnection } from './collab/yjsSocket'
import RoomJoin from './components/RoomJoin'
import CodeEditor from './components/CodeEditor'
import UserList from './components/UserList'
import FileTree from './components/FileTree'
import Terminal from './components/Terminal'

function App() {
  const [joined, setJoined] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [yjsConn, setYjsConn] = useState(null)
  const [users, setUsers] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [files, setFiles] = useState([])
  const [selectedFileId, setSelectedFileId] = useState(null)
  const [openTabs, setOpenTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [terminalLogs, setTerminalLogs] = useState([])
  const [showTerminal, setShowTerminal] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const editorRef = useRef(null)
  const iframeRef = useRef(null)

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

    conn.onReady(({ isFirstUser }) => {
      if (isFirstUser) {
        setTimeout(() => {
          const defaultFile = conn.createFile('main.js')
          if (defaultFile) {
            setSelectedFileId(defaultFile.id)
            setOpenTabs([defaultFile.id])
            setActiveTabId(defaultFile.id)
          }
        }, 100)
      }
    })

    conn.onFilesChange((fileList) => {
      setFiles(fileList)
      setOpenTabs(prev => {
        const existingIds = new Set(fileList.map(f => f.id))
        const filtered = prev.filter(id => existingIds.has(id))
        return filtered
      })
      setActiveTabId(prev => {
        const existingIds = new Set(fileList.map(f => f.id))
        if (prev && existingIds.has(prev)) return prev
        return fileList.length > 0 ? fileList[0].id : null
      })
      setSelectedFileId(prev => {
        const existingIds = new Set(fileList.map(f => f.id))
        if (prev && existingIds.has(prev)) return prev
        return fileList.length > 0 ? fileList[0].id : null
      })
    })

    return () => {
      conn.destroy()
      setYjsConn(null)
      setFiles([])
      setOpenTabs([])
      setActiveTabId(null)
      setSelectedFileId(null)
      setTerminalLogs([])
    }
  }, [joined, roomId, userId, userName])

  function handleLeave() {
    setJoined(false)
    setRoomId('')
    setUserId('')
    setUserName('')
    setUsers([])
  }

  function handleSelectFile(fileId) {
    setSelectedFileId(fileId)
    if (!openTabs.includes(fileId)) {
      setOpenTabs([...openTabs, fileId])
    }
    setActiveTabId(fileId)
  }

  function handleCloseTab(fileId, e) {
    e.stopPropagation()
    const newTabs = openTabs.filter(id => id !== fileId)
    setOpenTabs(newTabs)
    if (activeTabId === fileId) {
      const newActive = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null
      setActiveTabId(newActive)
      setSelectedFileId(newActive)
    }
  }

  function handleCreateFile(filename) {
    if (yjsConn) {
      const file = yjsConn.createFile(filename)
      if (file) {
        handleSelectFile(file.id)
      }
    }
  }

  function handleRenameFile(fileId, newName) {
    if (yjsConn) {
      yjsConn.renameFile(fileId, newName)
    }
  }

  function handleDeleteFile(fileId) {
    if (yjsConn) {
      yjsConn.deleteFile(fileId)
    }
  }

  function addLog(content, type = 'log') {
    setTerminalLogs(prev => [...prev, { content, type, timestamp: Date.now() }])
  }

  function clearTerminal() {
    setTerminalLogs([])
  }

  function getCurrentFile() {
    return files.find(f => f.id === activeTabId)
  }

  function getCurrentCode() {
    if (!editorRef.current || !activeTabId) return ''
    const ytext = yjsConn.getFileContent(activeTabId)
    return ytext ? ytext.toString() : ''
  }

  async function runCode() {
    const currentFile = getCurrentFile()
    if (!currentFile) {
      addLog('没有打开的文件', 'error')
      return
    }

    const code = getCurrentCode()
    if (!code.trim()) {
      addLog('代码为空', 'warn')
      return
    }

    setIsRunning(true)
    addLog(`运行 ${currentFile.name}...`, 'info')

    const language = currentFile.language

    if (language === 'javascript' || language === 'typescript' || language === 'html') {
      runJavaScript(code, language)
    } else if (language === 'python') {
      await runPython(code)
    } else {
      addLog(`不支持运行 ${language} 代码`, 'warn')
      setIsRunning(false)
    }
  }

  function runJavaScript(code, language) {
    try {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.sandbox = 'allow-scripts'

      const messageHandler = (event) => {
        if (event.data && event.data.type === 'console') {
          addLog(event.data.message, event.data.level)
        } else if (event.data && event.data.type === 'result') {
          if (event.data.value !== undefined) {
            addLog(`返回值: ${event.data.value}`, 'success')
          }
        } else if (event.data && event.data.type === 'error') {
          addLog(event.data.message, 'error')
        } else if (event.data && event.data.type === 'done') {
          setIsRunning(false)
          window.removeEventListener('message', messageHandler)
          if (iframeRef.current) {
            try {
              document.body.removeChild(iframeRef.current)
            } catch (e) {}
            iframeRef.current = null
          }
        }
      }

      window.addEventListener('message', messageHandler)
      iframeRef.current = iframe
      document.body.appendChild(iframe)

      const encodedCode = btoa(unescape(encodeURIComponent(code)))

      const srcDoc = '<!DOCTYPE html><html><body><script>' +
        '(function(){' +
        'const originalConsole = {};' +
        '["log","error","warn","info","debug"].forEach(function(method){' +
        'originalConsole[method]=console[method];' +
        'console[method]=function(){var args=Array.prototype.slice.call(arguments);' +
        'var message=args.map(function(arg){if(typeof arg==="object"){try{return JSON.stringify(arg,null,2)}catch(e){return String(arg)}}return String(arg)}).join(" ");' +
        'parent.postMessage({type:"console",level:method,message:message},"*")}' +
        '});' +
        'window.onerror=function(message,source,lineno){parent.postMessage({type:"error",message:message+" (line "+lineno+")"},"*");parent.postMessage({type:"done"},"*");return true};' +
        'try{' +
        'var code=decodeURIComponent(escape(atob("' + encodedCode + '")));' +
        'var result=eval(code);' +
        'if(result!==undefined){var resultStr;try{resultStr=typeof result==="object"?JSON.stringify(result,null,2):String(result)}catch(e){resultStr=String(result)}parent.postMessage({type:"result",value:resultStr},"*")}' +
        '}catch(e){parent.postMessage({type:"error",message:e.name+": "+e.message},"*")}' +
        'setTimeout(function(){parent.postMessage({type:"done"},"*")},50)' +
        '})();' +
        '<' + '/script></body></html>'

      iframe.srcdoc = srcDoc

      setTimeout(() => {
        if (iframeRef.current) {
          window.removeEventListener('message', messageHandler)
          try {
            document.body.removeChild(iframeRef.current)
          } catch (e) {}
          iframeRef.current = null
          setIsRunning(false)
        }
      }, 5000)

    } catch (e) {
      addLog(`执行错误: ${e.message}`, 'error')
      setIsRunning(false)
    }
  }

  async function runPython(code) {
    try {
      const response = await fetch('http://localhost:2221/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code,
          language: 'python'
        })
      })

      const result = await response.json()

      if (result.stdout) {
        result.stdout.split('\n').forEach(line => {
          if (line.trim()) {
            addLog(line, 'log')
          }
        })
      }

      if (result.stderr) {
        result.stderr.split('\n').forEach(line => {
          if (line.trim()) {
            addLog(line, 'error')
          }
        })
      }

      if (result.returncode === 0) {
        addLog('执行完成', 'success')
      } else if (result.returncode !== -1) {
        addLog(`进程退出码: ${result.returncode}`, 'warn')
      }

    } catch (e) {
      addLog(`请求错误: ${e.message}`, 'error')
    }
    setIsRunning(false)
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor
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

  const currentFile = getCurrentFile()

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

        <div style={styles.fileTreeContainer}>
          {yjsConn && (
            <FileTree
              files={files}
              selectedFileId={selectedFileId}
              onSelectFile={handleSelectFile}
              onCreateFile={handleCreateFile}
              onRenameFile={handleRenameFile}
              onDeleteFile={handleDeleteFile}
            />
          )}
        </div>

        <UserList users={users} currentUserId={userId} />

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
          <div style={styles.tabsContainer}>
            {openTabs.map(tabId => {
              const file = files.find(f => f.id === tabId)
              if (!file) return null
              return (
                <div
                  key={tabId}
                  style={{
                    ...styles.tab,
                    backgroundColor: activeTabId === tabId ? '#1e1e1e' : '#2d2d2d',
                    borderBottom: activeTabId === tabId ? '2px solid #4ECDC4' : '2px solid transparent'
                  }}
                  onClick={() => handleSelectFile(tabId)}
                >
                  <span style={styles.tabIcon}>{getFileIcon(file.name)}</span>
                  <span style={styles.tabName}>{file.name}</span>
                  <button
                    onClick={(e) => handleCloseTab(tabId, e)}
                    style={styles.tabClose}
                    title="关闭标签"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
          <div style={styles.headerRight}>
            <button
              onClick={runCode}
              disabled={isRunning || !activeTabId}
              style={{
                ...styles.runBtn,
                opacity: isRunning || !activeTabId ? 0.5 : 1
              }}
            >
              {isRunning ? '⏳ 运行中...' : '▶️ 运行代码'}
            </button>
            <span style={styles.headerInfo}>
              {users.length} 人在线
            </span>
          </div>
        </div>

        <div style={styles.editorArea}>
          <div style={styles.editorContainer}>
            {yjsConn && activeTabId && currentFile && (
              <CodeEditor
                yjsConn={yjsConn}
                fileId={activeTabId}
                language={currentFile.language}
                onMount={handleEditorMount}
              />
            )}
            {!activeTabId && (
              <div style={styles.noFileSelected}>
                <div style={styles.noFileIcon}>📁</div>
                <div style={styles.noFileText}>选择或创建一个文件开始编辑</div>
              </div>
            )}
          </div>

          {showTerminal && (
            <div style={styles.terminalContainer}>
              <Terminal logs={terminalLogs} onClear={clearTerminal} />
            </div>
          )}
        </div>

        <div style={styles.bottomBar}>
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            style={styles.toggleTerminalBtn}
          >
            {showTerminal ? '▼ 隐藏终端' : '▲ 显示终端'}
          </button>
          {currentFile && (
            <span style={styles.bottomInfo}>
              {getFileIcon(currentFile.name)} {currentFile.name}
            </span>
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
    fontWeight: 600,
    margin: 0
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 500
  },
  fileTreeContainer: {
    flex: 1,
    minHeight: '200px',
    borderBottom: '1px solid #333',
    overflow: 'hidden'
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
    minWidth: 0,
    overflow: 'hidden'
  },
  header: {
    height: '48px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px 0 0',
    justifyContent: 'space-between',
    flexShrink: 0
  },
  tabsContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    height: '100%',
    overflowX: 'auto',
    overflowY: 'hidden'
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    height: '100%',
    cursor: 'pointer',
    minWidth: '100px',
    maxWidth: '200px',
    boxSizing: 'border-box'
  },
  tabIcon: {
    fontSize: '14px',
    flexShrink: 0
  },
  tabName: {
    color: '#ccc',
    fontSize: '13px',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  tabClose: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: '3px',
    flexShrink: 0
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    paddingRight: '16px'
  },
  runBtn: {
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  headerInfo: {
    color: '#888',
    fontSize: '13px'
  },
  editorArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden'
  },
  editorContainer: {
    flex: 1,
    minHeight: 0,
    position: 'relative'
  },
  noFileSelected: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555'
  },
  noFileIcon: {
    fontSize: '64px',
    marginBottom: '16px',
    opacity: 0.5
  },
  noFileText: {
    fontSize: '16px',
    opacity: 0.7
  },
  terminalContainer: {
    height: '240px',
    borderTop: '1px solid #333',
    flexShrink: 0
  },
  bottomBar: {
    height: '24px',
    backgroundColor: '#007acc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    flexShrink: 0
  },
  toggleTerminalBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '2px 8px'
  },
  bottomInfo: {
    color: '#fff',
    fontSize: '11px'
  }
}

export default App
