import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'

function CodeEditor({ socket, roomId, userId, language, initialUpdates }) {
  const ydocRef = useRef(null)
  const bindingRef = useRef(null)
  const monacoRef = useRef(null)
  const [editorReady, setEditorReady] = useState(false)

  useEffect(() => {
    if (!socket || !roomId || !userId) return

    const ydoc = new Y.Doc()
    ydocRef.current = ydoc

    const ytext = ydoc.getText('monaco')

    if (initialUpdates && initialUpdates.length > 0) {
      initialUpdates.forEach((update) => {
        try {
          if (typeof update === 'string') {
            Y.applyUpdate(ydoc, Uint8Array.from(atob(update), c => c.charCodeAt(0)))
          } else if (update instanceof Array || ArrayBuffer.isView(update)) {
            Y.applyUpdate(ydoc, new Uint8Array(update))
          }
        } catch (e) {
          console.error('Failed to apply initial update:', e)
        }
      })
    }

    ydoc.on('update', (update, origin) => {
      if (origin !== 'remote') {
        try {
          const base64Update = btoa(String.fromCharCode(...new Uint8Array(update)))
          socket.emit('yjs_update', {
            room_id: roomId,
            update: base64Update,
            user_id: userId,
          })
        } catch (e) {
          console.error('Failed to encode update:', e)
        }
      }
    })

    const handleYjsUpdate = (data) => {
      try {
        let updateUint8
        if (typeof data.update === 'string') {
          updateUint8 = Uint8Array.from(atob(data.update), c => c.charCodeAt(0))
        } else if (data.update instanceof Array || ArrayBuffer.isView(data.update)) {
          updateUint8 = new Uint8Array(data.update)
        }
        if (updateUint8) {
          Y.applyUpdate(ydoc, updateUint8, 'remote')
        }
      } catch (e) {
        console.error('Failed to apply remote update:', e)
      }
    }

    socket.on('yjs_update', handleYjsUpdate)

    return () => {
      socket.off('yjs_update', handleYjsUpdate)
      if (bindingRef.current) {
        bindingRef.current.destroy()
      }
      ydoc.destroy()
    }
  }, [socket, roomId, userId, initialUpdates])

  const handleEditorDidMount = (editor, monaco) => {
    monacoRef.current = { editor, monaco }
    setEditorReady(true)
  }

  useEffect(() => {
    if (!editorReady || !ydocRef.current || !monacoRef.current) return

    const { editor, monaco } = monacoRef.current
    const ytext = ydocRef.current.getText('monaco')

    const model = editor.getModel()
    if (!model) return

    const binding = new MonacoBinding(
      ytext,
      model,
      new Set([editor]),
      monaco.editor
    )
    bindingRef.current = binding

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
    }
  }, [editorReady])

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      onMount={handleEditorDidMount}
      options={{
        fontSize: 14,
        fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
        minimap: { enabled: true },
        automaticLayout: true,
        wordWrap: 'on',
        lineNumbers: 'on',
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
        tabSize: 2,
        insertSpaces: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
      }}
      loading={
        <div style={styles.loading}>
          <p>Loading editor...</p>
        </div>
      }
    />
  )
}

const styles = {
  loading: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
    fontSize: '14px',
  },
}

export default CodeEditor
