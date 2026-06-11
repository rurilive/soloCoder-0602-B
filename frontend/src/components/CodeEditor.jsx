import { useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { MonacoBinding } from 'y-monaco'

export default function CodeEditor({ yjsConn, fileId, language, onMount, highlightLine }) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const bindingRef = useRef(null)
  const modelRef = useRef(null)
  const isMountedRef = useRef(false)
  const rafIdRef = useRef(null)
  const decorationsRef = useRef([])

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

  function applyLineHighlight(lineNumber) {
    if (!editorRef.current || !monacoRef.current || !lineNumber) {
      return
    }

    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor.getModel()
    const lineLength = model.getLineMaxColumn(lineNumber)

    editor.revealLineInCenter(lineNumber)

    editor.setSelection({
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: lineLength
    })

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, lineLength),
        options: {
          inlineClassName: 'search-highlight-inline',
          overviewRuler: {
            color: '#ff6600',
            position: monaco.editor.OverviewRulerLane.Full
          }
        }
      },
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          linesDecorationsClassName: 'search-highlight-line-gutter',
          overviewRuler: {
            color: '#ff6600',
            position: monaco.editor.OverviewRulerLane.Full
          }
        }
      }
    ])

    setTimeout(() => {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
      editor.setSelection({
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1
      })
    }, 5000)
  }

  useEffect(() => {
    isMountedRef.current = true

    const styleId = 'search-highlight-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .search-highlight-line {
          background-color: #ff6600 !important;
        }
        .search-highlight-line-gutter {
          background-color: #ff6600 !important;
          border-left: 5px solid #ff3300 !important;
        }
        .search-highlight-inline {
          background-color: #ff6600aa !important;
          color: #ffffff !important;
          font-weight: 600 !important;
        }
      `
      document.head.appendChild(style)
    }

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!yjsConn || !editorRef.current || !monacoRef.current || !fileId) return

    setupBinding(editorRef.current, monacoRef.current, fileId, language)
    decorationsRef.current = []

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

  useEffect(() => {
    if (!highlightLine || !editorRef.current || !monacoRef.current) return
    if (highlightLine.fileId !== fileId) return

    if (bindingRef.current) {
      applyLineHighlight(highlightLine.lineNumber)
    } else {
      rafIdRef.current = requestAnimationFrame(() => {
        applyLineHighlight(highlightLine.lineNumber)
      })
    }
  }, [highlightLine, fileId])

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
