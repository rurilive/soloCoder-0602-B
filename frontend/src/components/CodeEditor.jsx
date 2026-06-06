import { useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { MonacoBinding } from 'y-monaco'
import * as Y from 'yjs'

export default function CodeEditor({ yjsConn, language, onMount }) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const bindingRef = useRef(null)

  useEffect(() => {
    if (!yjsConn) return

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
    }
  }, [yjsConn])

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor
    monacoRef.current = monaco

    if (yjsConn) {
      const ytext = yjsConn.getText('code')
      if (ytext.length === 0) {
        ytext.insert(0, getDefaultTemplate(language))
      }

      bindingRef.current = new MonacoBinding(
        ytext,
        editor.getModel(),
        new Set([editor]),
        yjsConn.awareness
      )
    }

    if (onMount) {
      onMount(editor, monaco)
    }
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
