const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' }
]

export default function LanguageSelector({ language, onChange }) {
  return (
    <div style={styles.container}>
      <label style={styles.label}>语言:</label>
      <select
        value={language}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  label: {
    color: '#ccc',
    fontSize: '13px'
  },
  select: {
    backgroundColor: '#1e1e1e',
    color: '#ddd',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none'
  }
}
