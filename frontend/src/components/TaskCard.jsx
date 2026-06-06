import React from 'react';

const PRIORITY_CONFIG = {
  low: { label: '低', color: '#28a745', bg: '#e6f9ec' },
  medium: { label: '中', color: '#ffc107', bg: '#fff8e1' },
  high: { label: '高', color: '#dc3545', bg: '#ffebee' },
};

export default function TaskCard({ task, onDelete, onEdit, customFields = [] }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  const renderCustomFieldValue = (field, value) => {
    if (value === undefined || value === null || value === '') return null;

    switch (field.field_type) {
      case 'checkbox':
        return value ? '✓ 是' : '✗ 否';
      case 'multiselect':
        return Array.isArray(value) ? value.join(', ') : value;
      case 'date':
        return new Date(value).toLocaleDateString();
      default:
        return String(value);
    }
  };

  const customFieldEntries = customFields
    .filter((field) => task.custom_field_values && task.custom_field_values[field.id] !== undefined)
    .map((field) => ({
      field,
      value: task.custom_field_values[field.id],
    }));

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
      
      {customFieldEntries.length > 0 && (
        <div className="task-custom-fields">
          {customFieldEntries.map(({ field, value }) => {
            const rendered = renderCustomFieldValue(field, value);
            if (!rendered) return null;
            return (
              <div key={field.id} className="task-custom-field">
                <span className="custom-field-label">{field.name}:</span>
                <span className="custom-field-value">{rendered}</span>
              </div>
            );
          })}
        </div>
      )}
      
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
