import { useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { MonacoBinding } from 'y-monaco'

export default function CodeEditor({ yjsConn, fileId, language, onMount }) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const bindingRef = useRef(null)
  const modelRef = useRef(null)
  const isMountedRef = useRef(false)
  const rafIdRef = useRef(null)

  function setupBinding(editor, monaco, fileId, lang) {
    if (bindingRef.current) {
      bindingRef.current.destroy()
      bindingRef.current = null
    }
    if (modelRef.current) {
      modelRef.current.dispose()
      modelRef.current = null
    }

    if (!yjsConn || !fileId) return

    const ytext = yjsConn.getFileContent(fileId)
    if (!ytext) return

    const model = monaco.editor.createModel(ytext.toString(), lang)
    modelRef.current = model
    editor.setModel(model)

    bindingRef.current = new MonacoBinding(
      ytext,
      model,
      new Set([editor]),
      yjsConn.awareness
    )
  }

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!yjsConn || !editorRef.current || !monacoRef.current || !fileId) return

    setupBinding(editorRef.current, monacoRef.current, fileId, language)

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
      if (modelRef.current) {
        modelRef.current.dispose()
        modelRef.current = null
      }
    }
  }, [yjsConn, fileId, language])

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor
    monacoRef.current = monaco

    rafIdRef.current = requestAnimationFrame(() => {
      if (isMountedRef.current && !bindingRef.current && yjsConn && fileId) {
        setupBinding(editor, monaco, fileId, language)
      }
    })

    if (onMount) {
      onMount(editor, monaco)
    }
  }

  function getValue() {
    if (editorRef.current) {
      return editorRef.current.getValue()
    }
    return ''
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Editor
        height="100%"
        language={language}
        theme="vs-dark"
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          automaticLayout: true,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          tabSize: 2
        }}
      />
    </div>
  )
}
