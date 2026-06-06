import * as Y from 'yjs'
import { io } from 'socket.io-client'
import * as awarenessProtocol from 'y-protocols/awareness.js'
import * as syncProtocol from 'y-protocols/sync.js'

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
    syncProtocol.step1(ydoc, socket, { room_id: roomId })
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
    Y.applyUpdate(ydoc, new Uint8Array(data.update), socket)
  })

  socket.on('yjs-sync-step1', (data) => {
    const update = new Uint8Array(data)
    syncProtocol.readSyncMessage(
      Y.createDecoder(update),
      Y.createEncoder(),
      ydoc,
      socket
    )
  })

  socket.on('yjs-sync-step2', (data) => {
    const update = new Uint8Array(data)
    syncProtocol.readSyncMessage(
      Y.createDecoder(update),
      Y.createEncoder(),
      ydoc,
      socket
    )
  })

  awareness.on('update', () => {
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
      socket.emit('leave-room', { room_id: roomId })
      socket.disconnect()
      ydoc.destroy()
    }
  }
}
