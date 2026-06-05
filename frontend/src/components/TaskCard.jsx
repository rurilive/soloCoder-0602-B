import React from 'react';

export default function TaskCard({ task, onDelete }) {
  return (
    <div className="task-card">
      <div className="task-card-header">
        <strong>{task.title}</strong>
        <button className="btn btn-danger btn-xs" onClick={() => onDelete(task.id)}>×</button>
      </div>
      {task.description && <p className="task-desc">{task.description}</p>}
      <div className="task-meta">
        <span className="task-id">#{task.id}</span>
      </div>
    </div>
  );
}
