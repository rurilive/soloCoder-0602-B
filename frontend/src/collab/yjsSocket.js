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
    const encoder = createEncoder()
    writeVarUint(encoder, messageSync)
    syncProtocol.writeSyncStep1(encoder, ydoc)
    socket.emit('yjs-sync-step1', {
      room_id: roomId,
      update: Array.from(toUint8Array(encoder))
    })
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
            // ignore invalid awareness data
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
        // ignore invalid awareness data
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

  return {
    ydoc,
    awareness,
    socket,
    onUsersChange: (callback) => {
      onUsersChange = callback
    },
    getText: (name) => ydoc.getText(name),
    destroy: () => {
      awareness.setLocalState(null)
      socket.emit('leave-room', { room_id: roomId })
      socket.disconnect()
      ydoc.destroy()
    }
  }
}
