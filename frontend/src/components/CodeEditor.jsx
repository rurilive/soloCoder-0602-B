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

    editor.focus()
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
          backgroundColor: '#ffd70088',
          color: '#000000',
          overviewRuler: {
            color: '#ffd700',
            position: monaco.editor.OverviewRulerLane.Full
          }
        }
      }
    ])

    highlightLineDomWithRetry(lineNumber, 0)

    setTimeout(() => {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
      clearLineHighlightDom()
      editor.setSelection({
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1
      })
    }, 3500)
  }

  function highlightLineDomWithRetry(lineNumber, attempt) {
    if (attempt > 10) return
    
    const found = highlightLineDom(lineNumber)
    if (!found) {
      setTimeout(() => {
        highlightLineDomWithRetry(lineNumber, attempt + 1)
      }, 50)
    }
  }

  function highlightLineDom(lineNumber) {
    if (!editorRef.current || !monacoRef.current) return false
    const editor = editorRef.current
    const editorDom = editor.getDomNode()
    if (!editorDom) return false

    const viewLines = editorDom.querySelector('.view-lines')
    if (!viewLines || viewLines.children.length === 0) return false

    const topForLine = editor.getTopForLineNumber(lineNumber)
    const lineElements = viewLines.querySelectorAll('.view-line')
    
    let closestEl = null
    let closestDiff = Infinity
    
    lineElements.forEach(el => {
      const top = parseInt(el.style.top) || 0
      const diff = Math.abs(top - topForLine)
      if (diff < closestDiff) {
        closestDiff = diff
        closestEl = el
      }
    })
    
    if (closestEl && closestDiff < 5) {
      closestEl.classList.add('search-highlight-dom-line')
      return true
    }
    return false
  }

  function clearLineHighlightDom() {
    if (!editorRef.current) return
    const editorDom = editorRef.current.getDomNode()
    if (!editorDom) return

    const highlighted = editorDom.querySelectorAll('.search-highlight-dom-line')
    highlighted.forEach(el => el.classList.remove('search-highlight-dom-line'))
  }

  useEffect(() => {
    isMountedRef.current = true

    const styleId = 'search-highlight-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .search-highlight-dom-line {
          background: linear-gradient(90deg, #ffd700 0%, #ffed4a 50%, #ffd700 100%) !important;
          box-shadow: inset 5px 0 0 0 #ff6b00 !important;
          border-radius: 3px;
          animation: search-highlight-pulse 1s ease-in-out infinite;
        }
        @keyframes search-highlight-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .search-highlight-line-gutter {
          background-color: #ffd700 !important;
        }
        .search-highlight-inline {
          background-color: #ffd70066 !important;
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
