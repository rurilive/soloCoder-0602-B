import * as Y from 'yjs'
import { io } from 'socket.io-client'
import * as awarenessProtocol from 'y-protocols/awareness.js'
import * as syncProtocol from 'y-protocols/sync.js'
import { createEncoder, toUint8Array, writeVarUint, writeVarUint8Array } from 'lib0/encoding'
import { createDecoder, readVarUint, readVarUint8Array } from 'lib0/decoding'

const messageSync = 0
const messageAwareness = 1

export function createYjsConnection(roomId, userId, userName) {
  const ydoc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(ydoc)
  const socket = io('http://localhost:2221', {
    transports: ['websocket', 'polling']
  })

  let destroyed = false

  awareness.setLocalStateField('user', {
    id: userId,
    name: userName,
    color: getRandomColor()
  })

  function getRandomColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1'
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  let connected = false

  function sendAwarenessUpdate() {
    const encoder = createEncoder()
    writeVarUint(encoder, messageAwareness)
    writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, [ydoc.clientID]))
    socket.emit('awareness-update', {
      room_id: roomId,
      awareness: Array.from(toUint8Array(encoder))
    })
  }

  function readSyncMessage(buffer) {
    const decoder = createDecoder(buffer)
    const messageType = readVarUint(decoder)
    switch (messageType) {
      case messageSync: {
        const encoder = createEncoder()
        writeVarUint(encoder, messageSync)
        syncProtocol.readSyncMessage(decoder, encoder, ydoc, socket)
        return toUint8Array(encoder)
      }
      case messageAwareness: {
        const update = readVarUint8Array(decoder)
        awarenessProtocol.applyAwarenessUpdate(awareness, update, socket)
        return null
      }
      default:
        return null
    }
  }

  socket.on('connect', () => {
    connected = true
    socket.emit('join-room', {
      room_id: roomId,
      user_id: userId,
      user_name: userName
    })
  })

  socket.on('disconnect', () => {
    connected = false
  })

  socket.on('room-joined', (data) => {
    isFirstUser = data.users && data.users.length === 1
    
    if (data.latest_state && data.latest_state.length > 0) {
      try {
        const stateUpdate = new Uint8Array(data.latest_state)
        Y.applyUpdate(ydoc, stateUpdate, 'server')
        isFirstUser = false
      } catch (e) {
        console.error('Error applying server state:', e)
      }
    }
    
    if (data.current_version !== undefined) {
      currentVersion = data.current_version
    }

    const encoder = createEncoder()
    writeVarUint(encoder, messageSync)
    syncProtocol.writeSyncStep1(encoder, ydoc)
    socket.emit('yjs-sync-step1', {
      room_id: roomId,
      update: Array.from(toUint8Array(encoder))
    })
    if (isFirstUser) {
      setTimeout(() => {
        if (!syncCompleted) {
          syncCompleted = true
          if (onReady) {
            onReady({ isFirstUser: true })
          }
        }
      }, 500)
    } else {
      setTimeout(() => {
        if (!syncCompleted) {
          syncCompleted = true
          if (onReady) {
            onReady({ isFirstUser: false })
          }
        }
      }, 500)
    }
    if (data.awareness_list) {
      data.awareness_list.forEach(awarenessData => {
        if (awarenessData) {
          try {
            const update = new Uint8Array(awarenessData)
            const decoder = createDecoder(update)
            const messageType = readVarUint(decoder)
            if (messageType === messageAwareness) {
              const awarenessUpdate = readVarUint8Array(decoder)
              awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, socket)
            }
          } catch (e) {
          }
        }
      })
    }
    sendAwarenessUpdate()
  })

  socket.on('version-rolled-back', (data) => {
    currentVersion = data.version
    if (onRollback) {
      onRollback(data.version)
    }
  })

  ydoc.on('update', (update, origin) => {
    if (origin !== socket && connected) {
      socket.emit('yjs-update', {
        room_id: roomId,
        update: Array.from(update)
      })
    }
  })

  socket.on('yjs-update', (data) => {
    const update = new Uint8Array(data.update)
    Y.applyUpdate(ydoc, update, socket)
  })

  socket.on('yjs-sync-step1', (data) => {
    const update = new Uint8Array(data.update)
    const response = readSyncMessage(update)
    if (response && response.length > 1) {
      socket.emit('yjs-sync-step2', {
        room_id: roomId,
        update: Array.from(response),
        target_sid: data.from_sid
      })
    }
  })

  socket.on('yjs-sync-step2', (data) => {
    const update = new Uint8Array(data.update)
    readSyncMessage(update)
    if (!syncCompleted) {
      syncCompleted = true
      if (onReady) {
        onReady({ isFirstUser })
      }
    }
  })

  socket.on('awareness-update', (data) => {
    if (data.awareness) {
      try {
        const update = new Uint8Array(data.awareness)
        const decoder = createDecoder(update)
        const messageType = readVarUint(decoder)
        if (messageType === messageAwareness) {
          const awarenessUpdate = readVarUint8Array(decoder)
          awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, socket)
        }
      } catch (e) {
      }
    }
  })

  awareness.on('update', () => {
    if (connected) {
      sendAwarenessUpdate()
    }
    const states = Array.from(awareness.getStates().entries()).map(([clientId, state]) => ({
      clientId,
      ...state.user
    }))
    if (onUsersChange) {
      onUsersChange(states)
    }
  })

  let onUsersChange = null
  let onReady = null
  let isFirstUser = false
  let syncCompleted = false
  let onFilesChange = null
  let onRollback = null
  let currentVersion = 0
  let chatMessageListeners = new Set()
  let chatTypingListeners = new Set()
  const API_BASE = 'http://localhost:2221/api'

  socket.on('snapshot-saved', (data) => {
    if (data.success && data.version !== undefined) {
      currentVersion = data.version
    }
  })

  async function fetchVersions() {
    try {
      const response = await fetch(`${API_BASE}/rooms/${roomId}/versions`)
      const data = await response.json()
      return data.versions || []
    } catch (e) {
      console.error('Error fetching versions:', e)
      return []
    }
  }

  async function rollbackToVersion(version) {
    try {
      const response = await fetch(`${API_BASE}/rooms/${roomId}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ version })
      })
      return await response.json()
    } catch (e) {
      console.error('Error rolling back:', e)
      return { success: false, error: e.message }
    }
  }

  async function fetchChatHistory(limit = 100, beforeId = null) {
    try {
      let url = `${API_BASE}/rooms/${roomId}/messages?limit=${limit}`
      if (beforeId) {
        url += `&before_id=${beforeId}`
      }
      const response = await fetch(url)
      const data = await response.json()
      return data.messages || []
    } catch (e) {
      console.error('Error fetching chat history:', e)
      return []
    }
  }

  function sendChatMessage(content) {
    if (!connected || !content.trim()) return
    socket.emit('chat-message', {
      room_id: roomId,
      content: content.trim()
    })
  }

  function sendChatTyping(isTyping) {
    if (!connected) return
    socket.emit('chat-typing', {
      room_id: roomId,
      is_typing: isTyping
    })
  }

  function onChatMessage(callback) {
    chatMessageListeners.add(callback)
    return () => chatMessageListeners.delete(callback)
  }

  function offChatMessage(callback) {
    chatMessageListeners.delete(callback)
  }

  function onChatTyping(callback) {
    chatTypingListeners.add(callback)
    return () => chatTypingListeners.delete(callback)
  }

  function offChatTyping(callback) {
    chatTypingListeners.delete(callback)
  }

  socket.on('chat-message', (message) => {
    chatMessageListeners.forEach(cb => {
      try { cb(message) } catch (e) { console.error(e) }
    })
  })

  socket.on('chat-typing', (data) => {
    chatTypingListeners.forEach(cb => {
      try { cb(data) } catch (e) { console.error(e) }
    })
  })

  socket.on('chat-error', (data) => {
    console.warn('Chat error:', data?.message)
  })

  const filesMap = ydoc.getMap('files')
  const fileContents = ydoc.getMap('fileContents')

  function getFileLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    const extMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'json': 'json'
    }
    return extMap[ext] || 'javascript'
  }

  function getDefaultTemplate(lang) {
    const templates = {
      javascript: '// Welcome to Collaborative JavaScript Editor\n// Start typing to collaborate in real-time!\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();\n',
      typescript: '// Welcome to Collaborative TypeScript Editor\n// Start typing to collaborate in real-time!\n\nfunction hello(): void {\n  console.log("Hello, World!");\n}\n\nhello();\n',
      python: '# Welcome to Collaborative Python Editor\n# Start typing to collaborate in real-time!\n\ndef hello():\n    print("Hello, World!")\n\nhello()\n',
      html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Collab HTML</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n  <p>Start editing to collaborate in real-time!</p>\n</body>\n</html>\n',
      css: '/* Welcome to Collaborative CSS Editor */\n/* Start typing to collaborate in real-time! */\n\nbody {\n  font-family: Arial, sans-serif;\n  margin: 0;\n  padding: 20px;\n  background-color: #f5f5f5;\n}\n\nh1 {\n  color: #333;\n}\n',
      json: '{\n  "message": "Welcome to Collaborative JSON Editor",\n  "start_editing": true,\n  "collaborate": "in real-time"\n}\n'
    }
    return templates[lang] || '// Start typing to collaborate!\n'
  }

  function getFiles() {
    return Array.from(filesMap.values())
  }

  function createFile(filename) {
    const id = 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
    const language = getFileLanguage(filename)
    const fileData = {
      id,
      name: filename,
      language,
      createdAt: Date.now()
    }
    filesMap.set(id, fileData)
    fileContents.set(id, new Y.Text())
    triggerFilesUpdate()
    return fileData
  }

  function setFileContent(fileId, content) {
    const ytext = fileContents.get(fileId)
    if (ytext) {
      ytext.delete(0, ytext.length)
      ytext.insert(0, content)
    }
  }

  function renameFile(fileId, newName) {
    const file = filesMap.get(fileId)
    if (file) {
      const language = getFileLanguage(newName)
      filesMap.set(fileId, { ...file, name: newName, language })
      triggerFilesUpdate()
    }
  }

  function deleteFile(fileId) {
    filesMap.delete(fileId)
    fileContents.delete(fileId)
    triggerFilesUpdate()
  }

  function getFileContent(fileId) {
    return fileContents.get(fileId)
  }

  function triggerFilesUpdate() {
    if (onFilesChange) {
      onFilesChange(getFiles())
    }
  }

  filesMap.observe(() => {
    triggerFilesUpdate()
  })

  function triggerUsersUpdate() {
    const states = Array.from(awareness.getStates().entries()).map(([clientId, state]) => ({
      clientId,
      ...state.user
    }))
    if (onUsersChange) {
      onUsersChange(states)
    }
  }

  return {
    ydoc,
    awareness,
    socket,
    currentVersion: () => currentVersion,
    onUsersChange: (callback) => {
      onUsersChange = callback
      triggerUsersUpdate()
    },
    onReady: (callback) => {
      onReady = callback
      if (syncCompleted) {
        callback({ isFirstUser })
      }
    },
    onRollback: (callback) => {
      onRollback = callback
    },
    getText: (name) => ydoc.getText(name),
    getFiles,
    createFile,
    renameFile,
    deleteFile,
    getFileContent,
    setFileContent,
    getDefaultTemplate,
    fetchVersions,
    rollbackToVersion,
    onFilesChange: (callback) => {
      onFilesChange = callback
      if (syncCompleted) {
        callback(getFiles())
      }
    },
    fetchChatHistory,
    sendChatMessage,
    sendChatTyping,
    onChatMessage,
    offChatMessage,
    onChatTyping,
    offChatTyping,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      awareness.setLocalState(null)
      socket.emit('leave-room', { room_id: roomId })
      socket.disconnect()
      ydoc.destroy()
      chatMessageListeners.clear()
      chatTypingListeners.clear()
    }
  }
}
