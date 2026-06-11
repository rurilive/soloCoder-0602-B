import { useState, useEffect } from 'react'

const defaultSnippets = {
  javascript: [
    {
      name: '箭头函数',
      code: 'const funcName = (params) => {\n  // 函数体\n  return result\n}',
      description: 'ES6 箭头函数模板'
    },
    {
      name: '异步函数',
      code: 'async function asyncFunc() {\n  try {\n    const result = await someAsyncOperation()\n    return result\n  } catch (error) {\n    console.error(error)\n  }\n}',
      description: 'async/await 异步函数模板'
    },
    {
      name: 'Promise 封装',
      code: 'function fetchData() {\n  return new Promise((resolve, reject) => {\n    // 异步操作\n    if (success) {\n      resolve(data)\n    } else {\n      reject(error)\n    }\n  })\n}',
      description: 'Promise 基础模板'
    },
    {
      name: '数组遍历 - map',
      code: 'const newArray = array.map((item, index) => {\n  // 处理每个元素\n  return transformedItem\n})',
      description: 'Array.map 遍历转换'
    },
    {
      name: '数组遍历 - filter',
      code: 'const filtered = array.filter((item) => {\n  // 返回 true 保留该元素\n  return condition\n})',
      description: 'Array.filter 条件过滤'
    },
    {
      name: '对象解构',
      code: 'const { prop1, prop2, ...rest } = obj',
      description: 'ES6 对象解构赋值'
    },
    {
      name: '数组解构',
      code: 'const [first, second, ...others] = array',
      description: 'ES6 数组解构赋值'
    },
    {
      name: 'Console 调试',
      code: 'console.log(\'变量名:\', variable)\nconsole.table(data)\nconsole.time(\'计时器\')\nconsole.timeEnd(\'计时器\')',
      description: '常用 console 调试方法'
    },
    {
      name: 'Fetch API',
      code: 'fetch(url, {\n  method: \'GET\',\n  headers: {\n    \'Content-Type\': \'application/json\'\n  }\n})\n.then(response => response.json())\n.then(data => console.log(data))\n.catch(error => console.error(\'Error:\', error))',
      description: 'Fetch API 请求模板'
    },
    {
      name: 'Class 类定义',
      code: 'class ClassName {\n  constructor(params) {\n    this.property = params\n  }\n\n  method() {\n    // 方法体\n  }\n}',
      description: 'ES6 Class 类定义模板'
    }
  ],
  python: [
    {
      name: '函数定义',
      code: 'def func_name(params):\n    """函数文档字符串"""\n    # 函数体\n    return result',
      description: 'Python 函数定义模板'
    },
    {
      name: '列表推导式',
      code: 'result = [item for item in iterable if condition]',
      description: 'Python 列表推导式'
    },
    {
      name: '字典推导式',
      code: 'result = {key: value for key, value in iterable if condition}',
      description: 'Python 字典推导式'
    },
    {
      name: 'Try-Except',
      code: 'try:\n    # 可能出错的代码\n    pass\nexcept ValueError as e:\n    print(f"值错误: {e}")\nexcept Exception as e:\n    print(f"未知错误: {e}")\nelse:\n    # 没有异常时执行\n    pass\nfinally:\n    # 总是执行\n    pass',
      description: '完整的异常处理模板'
    },
    {
      name: 'With 语句',
      code: 'with open(\'filename.txt\', \'r\', encoding=\'utf-8\') as f:\n    content = f.read()',
      description: '文件操作 with 语句'
    },
    {
      name: '类定义',
      code: 'class ClassName:\n    def __init__(self, params):\n        self.property = params\n\n    def method(self):\n        # 方法体\n        pass',
      description: 'Python 类定义模板'
    },
    {
      name: '装饰器',
      code: 'def decorator(func):\n    def wrapper(*args, **kwargs):\n        # 函数执行前\n        result = func(*args, **kwargs)\n        # 函数执行后\n        return result\n    return wrapper',
      description: 'Python 装饰器模板'
    },
    {
      name: 'Lambda 表达式',
      code: 'lambda x, y: x + y',
      description: '匿名函数 lambda 表达式'
    },
    {
      name: 'Requests HTTP',
      code: 'import requests\n\nresponse = requests.get(url)\nif response.status_code == 200:\n    data = response.json()\n    print(data)',
      description: 'requests 库 GET 请求'
    },
    {
      name: 'Main 入口',
      code: 'if __name__ == \'__main__\':\n    # 主程序入口\n    main()',
      description: 'Python 主程序入口模板'
    }
  ],
  html: [
    {
      name: 'HTML5 模板',
      code: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>页面标题</title>\n</head>\n<body>\n  <!-- 页面内容 -->\n</body>\n</html>',
      description: '完整 HTML5 文档结构'
    },
    {
      name: 'CSS 链接',
      code: '<link rel="stylesheet" href="styles.css">',
      description: '引入外部 CSS 文件'
    },
    {
      name: 'Script 标签',
      code: '<script src="script.js"></script>',
      description: '引入外部 JavaScript 文件'
    },
    {
      name: 'Meta 标签组',
      code: '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<meta name="description" content="页面描述">\n<meta name="keywords" content="关键词1,关键词2">\n<meta name="author" content="作者名">',
      description: '常用 meta 标签组合'
    },
    {
      name: '表单模板',
      code: '<form action="/submit" method="POST">\n  <div>\n    <label for="name">姓名:</label>\n    <input type="text" id="name" name="name" required>\n  </div>\n  <button type="submit">提交</button>\n</form>',
      description: '基础 HTML 表单'
    },
    {
      name: '表格模板',
      code: '<table>\n  <thead>\n    <tr>\n      <th>表头1</th>\n      <th>表头2</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td>数据1</td>\n      <td>数据2</td>\n    </tr>\n  </tbody>\n</table>',
      description: 'HTML 表格结构'
    },
    {
      name: '导航栏',
      code: '<nav>\n  <ul>\n    <li><a href="/">首页</a></li>\n    <li><a href="/about">关于</a></li>\n    <li><a href="/contact">联系</a></li>\n  </ul>\n</nav>',
      description: '简单导航栏结构'
    },
    {
      name: '响应式图片',
      code: '<img src="image.jpg" alt="图片描述" style="max-width: 100%; height: auto;">',
      description: '响应式图片标签'
    }
  ]
}

const STORAGE_KEY = 'code_snippets_custom'

export default function SnippetLibrary({ editor }) {
  const [activeCategory, setActiveCategory] = useState('javascript')
  const [customSnippets, setCustomSnippets] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSnippet, setNewSnippet] = useState({
    name: '',
    code: '',
    description: '',
    category: 'javascript'
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCategories, setExpandedCategories] = useState({
    javascript: true,
    python: false,
    html: false,
    custom: false
  })
  const [hoveredSnippet, setHoveredSnippet] = useState(null)
  const [focusedSearch, setFocusedSearch] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setCustomSnippets(JSON.parse(saved))
      } catch (e) {
        console.error('加载自定义片段失败:', e)
      }
    }
  }, [])

  const saveCustomSnippets = (snippets) => {
    setCustomSnippets(snippets)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets))
  }

  const handleInsertSnippet = (code) => {
    if (!editor) {
      alert('请先打开一个文件')
      return
    }

    const monaco = window.monaco
    if (!monaco) {
      alert('编辑器尚未准备好，请稍候再试')
      return
    }

    const selection = editor.getSelection()
    const range = new monaco.Range(
      selection.startLineNumber,
      selection.startColumn,
      selection.endLineNumber,
      selection.endColumn
    )

    editor.executeEdits('snippet-insert', [
      { range, text: code }
    ])

    editor.focus()
  }

  const handleAddSnippet = () => {
    if (!newSnippet.name.trim() || !newSnippet.code.trim()) {
      alert('请填写片段名称和代码')
      return
    }

    const category = newSnippet.category
    const newCustomSnippets = { ...customSnippets }
    if (!newCustomSnippets[category]) {
      newCustomSnippets[category] = []
    }
    newCustomSnippets[category].push({
      name: newSnippet.name,
      code: newSnippet.code,
      description: newSnippet.description,
      isCustom: true
    })

    saveCustomSnippets(newCustomSnippets)
    setNewSnippet({ name: '', code: '', description: '', category: 'javascript' })
    setShowAddModal(false)
    setExpandedCategories(prev => ({ ...prev, custom: true }))
  }

  const handleDeleteCustomSnippet = (category, index) => {
    if (!confirm('确定要删除这个自定义片段吗？')) return

    const newCustomSnippets = { ...customSnippets }
    newCustomSnippets[category].splice(index, 1)
    if (newCustomSnippets[category].length === 0) {
      delete newCustomSnippets[category]
    }
    saveCustomSnippets(newCustomSnippets)
  }

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  const getAllSnippetsForCategory = (category) => {
    const defaults = defaultSnippets[category] || []
    const customs = customSnippets[category] || []
    return [...defaults, ...customs]
  }

  const filterSnippets = (snippets) => {
    if (!searchTerm.trim()) return snippets
    const term = searchTerm.toLowerCase()
    return snippets.filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.description.toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term)
    )
  }

  const categoryLabels = {
    javascript: 'JavaScript',
    python: 'Python',
    html: 'HTML',
    custom: '自定义'
  }

  const categoryIcons = {
    javascript: '📜',
    python: '🐍',
    html: '🌐',
    custom: '⭐'
  }

  const categories = ['javascript', 'python', 'html']

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>📋 代码片段</h3>
        <button
          onClick={() => setShowAddModal(true)}
          style={styles.addBtn}
          title="添加自定义片段"
        >
          +
        </button>
      </div>

      <input
        type="text"
        placeholder="搜索片段..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => setFocusedSearch(true)}
        onBlur={() => setFocusedSearch(false)}
        style={{
          ...styles.searchInput,
          borderColor: focusedSearch ? '#4ECDC4' : '#444'
        }}
      />

      <div style={styles.snippetsList}>
        {categories.map(category => {
          const snippets = filterSnippets(getAllSnippetsForCategory(category))
          return (
            <div key={category} style={styles.categorySection}>
              <div
                style={styles.categoryHeader}
                onClick={() => toggleCategory(category)}
              >
                <span style={styles.categoryIcon}>{categoryIcons[category]}</span>
                <span style={styles.categoryName}>{categoryLabels[category]}</span>
                <span style={styles.categoryCount}>{snippets.length}</span>
                <span style={styles.toggleIcon}>
                  {expandedCategories[category] ? '▼' : '▶'}
                </span>
              </div>

              {expandedCategories[category] && snippets.length > 0 && (
                <div style={styles.snippetItems}>
                  {snippets.map((snippet, idx) => {
                    const snippetKey = `${category}-${idx}`
                    const isHovered = hoveredSnippet === snippetKey
                    return (
                      <div
                        key={snippetKey}
                        style={{
                          ...styles.snippetItem,
                          borderColor: isHovered ? '#4ECDC4' : 'transparent',
                          backgroundColor: isHovered ? '#333' : '#2a2a2a'
                        }}
                        onClick={() => handleInsertSnippet(snippet.code)}
                        onMouseEnter={() => setHoveredSnippet(snippetKey)}
                        onMouseLeave={() => setHoveredSnippet(null)}
                        title={snippet.description || '点击插入'}
                      >
                        <div style={styles.snippetName}>
                          {snippet.name}
                          {snippet.isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteCustomSnippet(category, defaultSnippets[category].length ? idx - defaultSnippets[category].length : idx)
                              }}
                              style={styles.deleteBtn}
                              title="删除"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div style={styles.snippetDesc}>{snippet.description}</div>
                        <pre style={styles.snippetPreview}>
                          {snippet.code.substring(0, 60)}{snippet.code.length > 60 ? '...' : ''}
                        </pre>
                      </div>
                    )
                  })}
                </div>
              )}

              {expandedCategories[category] && snippets.length === 0 && (
                <div style={styles.emptyState}>没有匹配的片段</div>
              )}
            </div>
          )
        })}
      </div>

      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h4 style={styles.modalTitle}>添加自定义片段</h4>
              <button
                onClick={() => setShowAddModal(false)}
                style={styles.closeBtn}
              >
                ×
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>分类</label>
                <select
                  value={newSnippet.category}
                  onChange={(e) => setNewSnippet({ ...newSnippet, category: e.target.value })}
                  style={styles.select}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="html">HTML</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>名称</label>
                <input
                  type="text"
                  value={newSnippet.name}
                  onChange={(e) => setNewSnippet({ ...newSnippet, name: e.target.value })}
                  placeholder="例如: 自定义函数"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>描述 (可选)</label>
                <input
                  type="text"
                  value={newSnippet.description}
                  onChange={(e) => setNewSnippet({ ...newSnippet, description: e.target.value })}
                  placeholder="简要描述这个片段的用途"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>代码</label>
                <textarea
                  value={newSnippet.code}
                  onChange={(e) => setNewSnippet({ ...newSnippet, code: e.target.value })}
                  placeholder="粘贴或输入代码片段..."
                  style={styles.textarea}
                  rows={8}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => setShowAddModal(false)}
                style={styles.cancelBtn}
              >
                取消
              </button>
              <button
                onClick={handleAddSnippet}
                style={styles.saveBtn}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    padding: '12px',
    borderBottom: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    margin: 0
  },
  addBtn: {
    backgroundColor: '#4ECDC4',
    color: '#1e1e1e',
    border: 'none',
    borderRadius: '4px',
    width: '24px',
    height: '24px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchInput: {
    backgroundColor: '#1e1e1e',
    color: '#ddd',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '12px',
    outline: 'none',
    transition: 'border-color 0.15s ease'
  },
  snippetsList: {
    maxHeight: '400px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  categorySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: '#333',
    borderRadius: '4px',
    cursor: 'pointer',
    userSelect: 'none'
  },
  categoryIcon: {
    fontSize: '13px'
  },
  categoryName: {
    color: '#ddd',
    fontSize: '12px',
    fontWeight: 500,
    flex: 1
  },
  categoryCount: {
    color: '#888',
    fontSize: '11px',
    backgroundColor: '#444',
    padding: '2px 6px',
    borderRadius: '10px'
  },
  toggleIcon: {
    color: '#888',
    fontSize: '10px'
  },
  snippetItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingLeft: '8px',
    marginTop: '2px'
  },
  snippetItem: {
    padding: '8px',
    backgroundColor: '#2a2a2a',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.15s ease'
  },
  snippetName: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '2px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  snippetDesc: {
    color: '#888',
    fontSize: '11px',
    marginBottom: '4px'
  },
  snippetPreview: {
    color: '#666',
    fontSize: '10px',
    fontFamily: 'monospace',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#e74c3c',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: '3px'
  },
  emptyState: {
    color: '#666',
    fontSize: '11px',
    padding: '8px',
    textAlign: 'center'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#252526',
    borderRadius: '8px',
    width: '480px',
    maxWidth: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #333'
  },
  modalTitle: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    margin: 0
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0 4px'
  },
  modalBody: {
    padding: '16px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    color: '#ccc',
    fontSize: '12px',
    fontWeight: 500
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#ddd',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '8px 10px',
    fontSize: '13px',
    outline: 'none'
  },
  select: {
    backgroundColor: '#1e1e1e',
    color: '#ddd',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '8px 10px',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer'
  },
  textarea: {
    backgroundColor: '#1e1e1e',
    color: '#ddd',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'monospace',
    outline: 'none',
    resize: 'vertical',
    minHeight: '120px'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '12px 20px',
    borderTop: '1px solid #333'
  },
  cancelBtn: {
    backgroundColor: '#3c3c3c',
    color: '#ddd',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '13px',
    cursor: 'pointer'
  },
  saveBtn: {
    backgroundColor: '#4ECDC4',
    color: '#1e1e1e',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer'
  }
}
