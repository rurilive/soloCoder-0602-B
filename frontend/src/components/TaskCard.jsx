import React from 'react';

const PRIORITY_CONFIG = {
  low: { label: '低', color: '#28a745', bg: '#e6f9ec' },
  medium: { label: '中', color: '#ffc107', bg: '#fff8e1' },
  high: { label: '高', color: '#dc3545', bg: '#ffebee' },
};

export default function TaskCard({ task, onDelete, onEdit }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  return (
    <div className="task-card">
      <div className="task-card-header">
        <div className="task-title-group">
          <span
            className="priority-badge"
            style={{ backgroundColor: priority.bg, color: priority.color }}
          >
            {priority.label}
          </span>
          <strong>{task.title}</strong>
        </div>
        <div className="task-card-actions">
          <button className="btn btn-outline btn-xs" onClick={() => onEdit(task)}>
            编辑
          </button>
          <button className="btn btn-danger btn-xs" onClick={() => onDelete(task.id)}>
            ×
          </button>
        </div>
      </div>
      {task.description && <p className="task-desc">{task.description}</p>}
      <div className="task-meta">
        <span className="task-id">#{task.id}</span>
        {task.due_date && (
          <span className="task-due-date">
            截止: {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
