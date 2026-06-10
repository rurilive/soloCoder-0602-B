import { useState, useEffect, useRef, useCallback } from 'react'

export default function ChatPanel({ yjsConn, currentUserId, users }) {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [typingUsers, setTypingUsers] = useState({})
  const [unreadCount, setUnreadCount] = useState(0)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isAtBottomRef = useRef(true)

  const userColors = {}
  users.forEach(u => {
    if (u.id) userColors[u.id] = u.color || '#888'
  })

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  const checkIfAtBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true
    const threshold = 50
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }, [])

  useEffect(() => {
    if (!yjsConn) return

    let mounted = true
    setIsLoading(true)

    yjsConn.fetchChatHistory().then(history => {
      if (!mounted) return
      setMessages(history || [])
      setHasMore((history?.length || 0) >= 50)
      setIsLoading(false)
      setTimeout(() => scrollToBottom(), 50)
    }).catch(() => {
      if (mounted) {
        setIsLoading(false)
      }
    })

    const handleNewMessage = (msg) => {
      if (!mounted) return
      setMessages(prev => {
        const exists = prev.some(m => m.id === msg.id)
        if (exists) return prev
        const updated = [...prev, msg]
        if (isAtBottomRef.current) {
          setTimeout(() => scrollToBottom(), 10)
        }
        return updated
      })
      if (msg.user_id !== currentUserId) {
        if (!isAtBottomRef.current || isCollapsed) {
          setUnreadCount(prev => prev + 1)
        }
      }
    }

    const handleTyping = (data) => {
      if (!mounted || data.user_id === currentUserId) return
      setTypingUsers(prev => ({
        ...prev,
        [data.user_id]: { name: data.user_name, is_typing: data.is_typing }
      }))
    }

    const offMsg = yjsConn.onChatMessage(handleNewMessage)
    const offTyping = yjsConn.onChatTyping(handleTyping)

    return () => {
      mounted = false
      offMsg && offMsg()
      offTyping && offTyping()
    }
  }, [yjsConn, currentUserId, isCollapsed, scrollToBottom])

  useEffect(() => {
    const activeTypers = Object.entries(typingUsers).filter(([, v]) => v.is_typing)
    if (activeTypers.length === 0) return
    const timer = setTimeout(() => {
      setTypingUsers(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(k => {
          if (next[k].is_typing) next[k].is_typing = false
        })
        return next
      })
    }, 3000)
    return () => clearTimeout(timer)
  }, [typingUsers])

  const handleScroll = () => {
    isAtBottomRef.current = checkIfAtBottom()
    const container = messagesContainerRef.current
    if (container && container.scrollTop === 0 && !isLoading && hasMore) {
      loadMore()
    }
  }

  const loadMore = async () => {
    if (isLoading || !hasMore || messages.length === 0) return
    setIsLoading(true)
    const firstId = messages[0]?.id
    const prevHeight = messagesContainerRef.current?.scrollHeight || 0
    try {
      const older = await yjsConn.fetchChatHistory(50, firstId)
      if (older && older.length > 0) {
        setMessages(prev => [...older, ...prev])
        setHasMore(older.length >= 50)
        setTimeout(() => {
          if (messagesContainerRef.current) {
            const newHeight = messagesContainerRef.current.scrollHeight
            messagesContainerRef.current.scrollTop = newHeight - prevHeight
          }
        }, 10)
      } else {
        setHasMore(false)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = () => {
    const content = inputValue.trim()
    if (!content || !yjsConn) return
    yjsConn.sendChatMessage(content)
    setInputValue('')
    isAtBottomRef.current = true
    setTimeout(() => scrollToBottom(), 10)
  }

  const handleInputChange = (e) => {
    const val = e.target.value
    setInputValue(val)
    if (yjsConn) {
      yjsConn.sendChatTyping(val.length > 0)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        yjsConn.sendChatTyping(false)
      }, 1500)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return '今天'
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return '昨天'
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const shouldShowDateDivider = (idx) => {
    if (idx === 0) return true
    const curr = new Date((messages[idx]?.created_at || 0) * 1000).toDateString()
    const prev = new Date((messages[idx - 1]?.created_at || 0) * 1000).toDateString()
    return curr !== prev
  }

  const isFromSameUser = (idx) => {
    if (idx === 0) return false
    return messages[idx]?.user_id === messages[idx - 1]?.user_id
  }

  const activeTyperNames = Object.entries(typingUsers)
    .filter(([, v]) => v.is_typing)
    .map(([, v]) => v.name)

  const handleExpand = () => {
    setIsCollapsed(false)
    setUnreadCount(0)
    setTimeout(() => {
      isAtBottomRef.current = true
      scrollToBottom()
    }, 10)
  }

  if (isCollapsed) {
    return (
      <div style={styles.collapsedContainer} onClick={handleExpand}>
        <span style={styles.collapsedIcon}>💬</span>
        <span style={styles.collapsedText}>聊天</span>
        {unreadCount > 0 && (
          <span style={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>💬</span>
          <span style={styles.headerTitle}>团队聊天</span>
        </div>
        <button
          style={styles.collapseBtn}
          onClick={() => setIsCollapsed(true)}
          title="收起聊天"
        >
          ▼
        </button>
      </div>

      <div
        style={styles.messagesContainer}
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {isLoading && messages.length === 0 && (
          <div style={styles.loading}>加载消息中...</div>
        )}

        {!isLoading && messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💭</div>
            <div style={styles.emptyText}>还没有消息</div>
            <div style={styles.emptyHint}>发送第一条消息开始讨论吧</div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isSelf = msg.user_id === currentUserId
          const sameUser = isFromSameUser(idx)
          const showDate = shouldShowDateDivider(idx)

          return (
            <div key={msg.id}>
              {showDate && (
                <div style={styles.dateDivider}>
                  <span style={styles.dateText}>{formatDate(msg.created_at)}</span>
                </div>
              )}
              <div style={{
                ...styles.messageWrapper,
                flexDirection: isSelf ? 'row-reverse' : 'row',
                marginTop: sameUser && !showDate ? '2px' : '10px'
              }}>
                {!isSelf && (!sameUser || showDate) && (
                  <div
                    style={{
                      ...styles.avatar,
                      backgroundColor: userColors[msg.user_id] || '#888'
                    }}
                  >
                    {msg.user_name ? msg.user_name.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                {!isSelf && sameUser && !showDate && (
                  <div style={styles.avatarPlaceholder} />
                )}
                <div style={{
                  ...styles.messageContent,
                  alignItems: isSelf ? 'flex-end' : 'flex-start',
                  maxWidth: '78%'
                }}>
                  {!sameUser && !showDate && (
                    <div style={{
                      ...styles.senderName,
                      color: isSelf ? '#888' : (userColors[msg.user_id] || '#ccc')
                    }}>
                      {isSelf ? '我' : (msg.user_name || 'Anonymous')}
                      <span style={styles.timeInline}>{formatTime(msg.created_at)}</span>
                    </div>
                  )}
                  {showDate && (
                    <div style={{
                      ...styles.senderName,
                      color: isSelf ? '#888' : (userColors[msg.user_id] || '#ccc')
                    }}>
                      {isSelf ? '我' : (msg.user_name || 'Anonymous')}
                      <span style={styles.timeInline}>{formatTime(msg.created_at)}</span>
                    </div>
                  )}
                  <div style={{
                    ...styles.bubble,
                    backgroundColor: isSelf ? '#4ECDC4' : '#3a3a3a',
                    color: isSelf ? '#0d1117' : '#e0e0e0',
                    borderTopRightRadius: (sameUser && !showDate) ? '12px' : '4px',
                    borderTopLeftRadius: (sameUser && !showDate && !isSelf) ? '12px' : (isSelf ? '12px' : '4px')
                  }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {activeTyperNames.length > 0 && (
          <div style={styles.typingIndicator}>
            <div style={styles.typingDots}>
              <span style={styles.typingDot} />
              <span style={{ ...styles.typingDot, animationDelay: '0.15s' }} />
              <span style={{ ...styles.typingDot, animationDelay: '0.3s' }} />
            </div>
            <span style={styles.typingText}>
              {activeTyperNames.slice(0, 2).join('、')}
              {activeTyperNames.length > 2 ? ' 等' : ''} 正在输入...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputContainer}>
        <textarea
          style={styles.input}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={2}
          maxLength={2000}
        />
        <button
          style={{
            ...styles.sendBtn,
            backgroundColor: inputValue.trim() ? '#4ECDC4' : '#3a3a3a',
            cursor: inputValue.trim() ? 'pointer' : 'not-allowed'
          }}
          onClick={sendMessage}
          disabled={!inputValue.trim()}
        >
          发送
        </button>
      </div>
    </div>
  )
}

const styles = {
  collapsedContainer: {
    padding: '10px 12px',
    backgroundColor: '#2d2d2d',
    borderTop: '1px solid #333',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'center',
    position: 'relative'
  },
  collapsedIcon: {
    fontSize: '16px'
  },
  collapsedText: {
    color: '#ddd',
    fontSize: '13px',
    fontWeight: 500
  },
  unreadBadge: {
    position: 'absolute',
    top: '6px',
    right: '12px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 'bold',
    borderRadius: '10px',
    minWidth: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px'
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    borderTop: '1px solid #333',
    backgroundColor: '#252526',
    height: '280px',
    minHeight: 0,
    flexShrink: 0
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#2d2d2d',
    borderBottom: '1px solid #333'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  headerIcon: {
    fontSize: '14px'
  },
  headerTitle: {
    color: '#ddd',
    fontSize: '13px',
    fontWeight: 600
  },
  collapseBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 6px',
    borderRadius: '3px'
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0
  },
  loading: {
    color: '#666',
    textAlign: 'center',
    padding: '20px',
    fontSize: '12px'
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555'
  },
  emptyIcon: {
    fontSize: '36px',
    marginBottom: '8px',
    opacity: 0.5
  },
  emptyText: {
    fontSize: '14px',
    color: '#777',
    marginBottom: '4px'
  },
  emptyHint: {
    fontSize: '12px',
    color: '#555'
  },
  dateDivider: {
    display: 'flex',
    justifyContent: 'center',
    margin: '12px 0 8px 0'
  },
  dateText: {
    backgroundColor: '#333',
    color: '#888',
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '10px'
  },
  messageWrapper: {
    display: 'flex',
    gap: '6px'
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
    flexShrink: 0
  },
  avatarPlaceholder: {
    width: '28px',
    flexShrink: 0
  },
  messageContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0
  },
  senderName: {
    fontSize: '11px',
    marginBottom: '2px',
    paddingLeft: '4px',
    fontWeight: 500
  },
  timeInline: {
    color: '#555',
    fontSize: '10px',
    marginLeft: '6px',
    fontWeight: 400
  },
  bubble: {
    padding: '7px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    lineHeight: 1.5,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap'
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    marginTop: '4px'
  },
  typingDots: {
    display: 'flex',
    gap: '3px'
  },
  typingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#666',
    animation: 'chatBounce 1.2s infinite ease-in-out both'
  },
  typingText: {
    color: '#666',
    fontSize: '11px',
    fontStyle: 'italic'
  },
  inputContainer: {
    display: 'flex',
    gap: '8px',
    padding: '8px 10px',
    borderTop: '1px solid #333',
    backgroundColor: '#2d2d2d',
    flexShrink: 0
  },
  input: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    color: '#ddd',
    border: '1px solid #444',
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '13px',
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.4
  },
  sendBtn: {
    backgroundColor: '#4ECDC4',
    color: '#0d1117',
    border: 'none',
    borderRadius: '6px',
    padding: '0 16px',
    fontSize: '13px',
    fontWeight: 600,
    height: '42px',
    alignSelf: 'flex-end'
  }
}

const keyframesStyle = document.createElement('style')
keyframesStyle.textContent = `
@keyframes chatBounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
`
if (!document.getElementById('chat-keyframes-style')) {
  keyframesStyle.id = 'chat-keyframes-style'
  document.head.appendChild(keyframesStyle)
}
