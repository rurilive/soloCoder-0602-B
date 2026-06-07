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
    getText: (name) => ydoc.getText(name),
    getFiles,
    createFile,
    renameFile,
    deleteFile,
    getFileContent,
    setFileContent,
    getDefaultTemplate,
    onFilesChange: (callback) => {
      onFilesChange = callback
      if (syncCompleted) {
        callback(getFiles())
      }
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      awareness.setLocalState(null)
      socket.emit('leave-room', { room_id: roomId })
      socket.disconnect()
      ydoc.destroy()
    }
  }
}
