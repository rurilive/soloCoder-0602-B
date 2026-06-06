import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { projectAPI, taskAPI, customFieldAPI, generateRequestId } from '../api';
import { wsManager } from '../websocketManager';
import TaskCard from './TaskCard';
import Modal from './Modal';
import CustomFieldManager from './CustomFieldManager';
import { useToast } from '../context/ToastContext';

const COLUMNS = [
  { id: 'todo', title: '待办', color: '#6c757d' },
  { id: 'in_progress', title: '进行中', color: '#0d6efd' },
  { id: 'done', title: '已完成', color: '#198754' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: '全部优先级' },
  { value: 'low', label: '低优先级' },
  { value: 'medium', label: '中优先级' },
  { value: 'high', label: '高优先级' },
];

const TASK_PRIORITIES = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const TASK_STATUSES = [
  { value: 'todo', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'done', label: '已完成' },
];

export default function KanbanBoard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('todo');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskCustomFields, setNewTaskCustomFields] = useState({});
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [editTask, setEditTask] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkMoveStatus, setBulkMoveStatus] = useState('in_progress');
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const fetchProject = async () => {
    try {
      const res = await projectAPI.get(projectId);
      setProject(res.data);
    } catch {
      showToast('加载项目失败', 'error');
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await taskAPI.list(projectId);
      setTasks(res.data);
    } catch {
      showToast('加载任务失败', 'error');
    }
  };

  const fetchCustomFields = async () => {
    try {
      const res = await customFieldAPI.list(projectId);
      setCustomFields(res.data);
    } catch {
      // 静默失败，可能是新项目还没有自定义字段
    }
  };

  useEffect(() => {
    fetchProject();
    fetchTasks();
    fetchCustomFields();
  }, [projectId]);

  useEffect(() => {
    if (showFieldManager && projectId) {
      fetchCustomFields();
    }
  }, [showFieldManager]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !projectId) return;

    wsManager.connectProject(projectId);

    const unsubscribe = wsManager.on('project', (message) => {
      if (message.type !== 'task_update') return;

      if (message.request_id && wsManager.isRequestPending(message.request_id)) {
        wsManager.untrackRequestId(message.request_id);
        return;
      }

      setTasks((prevTasks) => {
        let newTasks = [...prevTasks];

        if (message.action === 'delete') {
          newTasks = newTasks.filter((t) => t.id !== message.data.id);
        } else if (message.action === 'bulk_delete') {
          const deletedIds = new Set(message.data.task_ids);
          newTasks = newTasks.filter((t) => !deletedIds.has(t.id));
        } else if (message.action === 'create' || message.action === 'update') {
          const taskData = message.data;
          const existingIndex = newTasks.findIndex((t) => t.id === taskData.id);
          if (existingIndex >= 0) {
            newTasks[existingIndex] = { ...newTasks[existingIndex], ...taskData };
          } else {
            newTasks.push(taskData);
          }
        } else if (message.action === 'bulk_update') {
          const taskMap = new Map(message.data.map((t) => [t.id, t]));
          newTasks = newTasks.map((t) => {
            if (taskMap.has(t.id)) {
              return { ...t, ...taskMap.get(t.id) };
            }
            return t;
          });
          message.data.forEach((taskData) => {
            if (!newTasks.find((t) => t.id === taskData.id)) {
              newTasks.push(taskData);
            }
          });
        }

        return newTasks;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [projectId]);

  const getTasksByStatus = useCallback((status) => {
    return tasks
      .filter((t) => t.status === status)
      .filter((t) => priorityFilter === 'all' || t.priority === priorityFilter)
      .sort((a, b) => a.position - b.position);
  }, [tasks, priorityFilter]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const requestId = generateRequestId();
      const data = {
        title: newTaskTitle,
        status: newTaskStatus,
        priority: newTaskPriority,
      };
      if (newTaskDueDate) {
        data.due_date = newTaskDueDate;
      }
      if (Object.keys(newTaskCustomFields).length > 0) {
        data.custom_field_values = newTaskCustomFields;
      }
      await taskAPI.create(projectId, data, {
        headers: { 'X-Request-ID': requestId }
      });
      setNewTaskTitle('');
      setNewTaskDueDate('');
      setNewTaskPriority('medium');
      setNewTaskCustomFields({});
      fetchTasks();
      showToast('任务创建成功', 'success');
    } catch {
      showToast('创建任务失败', 'error');
    }
  };

  const handleCustomFieldChange = (fieldId, value, isEdit = false) => {
    if (isEdit) {
      setEditTask((prev) => ({
        ...prev,
        custom_field_values: {
          ...(prev.custom_field_values || {}),
          [fieldId]: value,
        },
      }));
    } else {
      setNewTaskCustomFields((prev) => ({
        ...prev,
        [fieldId]: value,
      }));
    }
  };

  const renderCustomFieldInput = (field, values, isEdit = false) => {
    const currentValue = values ? values[field.id] : '';
    
    switch (field.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={currentValue || ''}
            onChange={(e) => handleCustomFieldChange(field.id, e.target.value, isEdit)}
            placeholder={`输入${field.name}`}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={currentValue || ''}
            onChange={(e) => handleCustomFieldChange(field.id, e.target.value ? Number(e.target.value) : '', isEdit)}
            placeholder={`输入${field.name}`}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            value={currentValue || ''}
            onChange={(e) => handleCustomFieldChange(field.id, e.target.value, isEdit)}
          />
        );
      case 'checkbox':
        return (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!currentValue}
              onChange={(e) => handleCustomFieldChange(field.id, e.target.checked, isEdit)}
            />
            {field.name}
          </label>
        );
      case 'select':
        return (
          <select
            value={currentValue || ''}
            onChange={(e) => handleCustomFieldChange(field.id, e.target.value, isEdit)}
          >
            <option value="">请选择</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'multiselect':
          const selectedValues = Array.isArray(currentValue) ? currentValue : [];
          return (
            <div className="multiselect-wrapper">
              {(field.options || []).map((opt) => (
              <label key={opt} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt)}
                  onChange={(e) => {
                    const newValues = e.target.checked
                      ? [...selectedValues, opt]
                      : selectedValues.filter((v) => v !== opt);
                    handleCustomFieldChange(field.id, newValues, isEdit);
                  }}
                />
                {opt}
              </label>
            ))}
            </div>
          );
        default:
          return null;
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('确定删除此任务？')) return;
    try {
      const requestId = generateRequestId();
      await taskAPI.delete(projectId, taskId, {
        headers: { 'X-Request-ID': requestId }
      });
      fetchTasks();
      showToast('任务删除成功', 'success');
    } catch {
      showToast('删除任务失败', 'error');
    }
  };

  const handleEditTask = (task) => {
    const formattedTask = { ...task };
    if (formattedTask.due_date) {
      const dateObj = new Date(formattedTask.due_date);
      formattedTask.due_date = dateObj.toISOString().split('T')[0];
    }
    setEditTask(formattedTask);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTask || !editTask.title.trim()) return;
    try {
      const requestId = generateRequestId();
      const data = {
        title: editTask.title,
        description: editTask.description,
        status: editTask.status,
        priority: editTask.priority,
      };
      if (editTask.due_date) {
        data.due_date = editTask.due_date;
      }
      if (editTask.custom_field_values) {
        data.custom_field_values = editTask.custom_field_values;
      }
      await taskAPI.update(projectId, editTask.id, data, {
        headers: { 'X-Request-ID': requestId }
      });
      setEditModalOpen(false);
      setEditTask(null);
      fetchTasks();
      showToast('任务更新成功', 'success');
    } catch {
      showToast('更新任务失败', 'error');
    }
  };

  const handleDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const taskId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const newPosition = destination.index;

    const oldTasks = [...tasks];
    const updatedTask = tasks.find((t) => t.id === taskId);
    if (!updatedTask) return;

    const sourceTasks = getTasksByStatus(source.droppableId);
    const destTasks = getTasksByStatus(destination.droppableId);

    let newTasks = tasks.filter((t) => t.id !== taskId);

    if (source.droppableId === destination.droppableId) {
      const reordered = [...sourceTasks];
      reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, { ...updatedTask, status: newStatus });
      newTasks = newTasks.map((t) => {
        const idx = reordered.findIndex((r) => r.id === t.id);
        if (idx !== -1) return { ...t, status: newStatus, position: idx };
        return t;
      });
    } else {
      const sourceReordered = sourceTasks.filter((t) => t.id !== taskId).map((t, i) => ({ ...t, position: i }));
      const destReordered = [...destTasks];
      destReordered.splice(destination.index, 0, { ...updatedTask, status: newStatus });
      destReordered.forEach((t, i) => { t.position = i; });
      newTasks = [
        ...newTasks.filter((t) => t.status !== source.droppableId && t.status !== destination.droppableId),
        ...sourceReordered,
        ...destReordered,
      ];
    }
    setTasks(newTasks);

    try {
      const requestId = generateRequestId();
      await taskAPI.reorder(projectId, taskId, { task_id: taskId, new_status: newStatus, new_position: newPosition }, {
        headers: { 'X-Request-ID': requestId }
      });
    } catch {
      setTasks(oldTasks);
      showToast('移动任务失败', 'error');
    }
  };

  const toggleTaskSelection = (taskId) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(tasks.map((t) => t.id)));
    }
  };

  const handleBulkMove = async () => {
    if (selectedTasks.size === 0) return;
    try {
      const requestId = generateRequestId();
      await taskAPI.bulkMove(projectId, {
        task_ids: Array.from(selectedTasks),
        new_status: bulkMoveStatus,
      }, {
        headers: { 'X-Request-ID': requestId }
      });
      setSelectedTasks(new Set());
      setSelectMode(false);
      setBulkModalOpen(false);
      fetchTasks();
      showToast('批量移动成功', 'success');
    } catch {
      showToast('批量移动失败', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedTasks.size} 个任务？`)) return;
    try {
      const requestId = generateRequestId();
      await taskAPI.bulkDelete(projectId, {
        task_ids: Array.from(selectedTasks),
      }, {
        headers: { 'X-Request-ID': requestId }
      });
      setSelectedTasks(new Set());
      setSelectMode(false);
      fetchTasks();
      showToast('批量删除成功', 'success');
    } catch {
      showToast('批量删除失败', 'error');
    }
  };

  if (!project) return <div className="loading">加载中...</div>;

  return (
    <div className="kanban-page">
      <div className="kanban-header">
        <button className="btn btn-outline" onClick={() => navigate('/')}>← 返回</button>
        <h2>{project.name}</h2>
        <div className="kanban-header-actions">
          <button 
            className="btn btn-outline" 
            onClick={() => setShowFieldManager(!showFieldManager)}
          >
            {showFieldManager ? '隐藏字段管理' : '📋 自定义字段'}
          </button>
          <div className="priority-filter-wrapper">
            <label>优先级筛选:</label>
            <select
              className="priority-filter-global"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {selectMode ? (
            <>
              <button className="btn btn-outline" onClick={handleSelectAll}>
                {selectedTasks.size === tasks.length ? '取消全选' : '全选'}
              </button>
              <button className="btn btn-primary" onClick={() => setBulkModalOpen(true)} disabled={selectedTasks.size === 0}>
                批量移动 ({selectedTasks.size})
              </button>
              <button className="btn btn-danger" onClick={handleBulkDelete} disabled={selectedTasks.size === 0}>
                批量删除 ({selectedTasks.size})
              </button>
              <button className="btn btn-outline" onClick={() => { setSelectMode(false); setSelectedTasks(new Set()); }}>
                取消选择
              </button>
            </>
          ) : (
            <button className="btn btn-outline" onClick={() => setSelectMode(true)}>
              批量操作
            </button>
          )}
        </div>
      </div>

      <CustomFieldManager 
        projectId={projectId} 
        isOpen={showFieldManager} 
        onClose={() => setShowFieldManager(false)} 
      />

      <form className="add-task-form" onSubmit={handleAddTask}>
        <input
          type="text"
          placeholder="新任务标题"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          required
        />
        <select value={newTaskStatus} onChange={(e) => setNewTaskStatus(e.target.value)}>
          {TASK_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)}>
          {TASK_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>优先级: {p.label}</option>
          ))}
        </select>
        <input
          type="date"
          placeholder="截止日期"
          value={newTaskDueDate}
          onChange={(e) => setNewTaskDueDate(e.target.value)}
        />
        {customFields.map((field) => (
          <div key={field.id} className="custom-field-input">
            <label>{field.name}{field.required && ' *'}</label>
            {renderCustomFieldInput(field, newTaskCustomFields, false)}
          </div>
        ))}
        <button type="submit" className="btn btn-primary">添加任务</button>
      </form>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {COLUMNS.map((column) => {
            const columnTasks = getTasksByStatus(column.id);
            return (
              <div className="kanban-column" key={column.id}>
                <div className="column-header" style={{ borderTopColor: column.color }}>
                  <span className="column-title">{column.title}</span>
                  <div className="column-header-right">
                    <span className="column-count">{columnTasks.length}</span>
                  </div>
                </div>
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      className={`column-body ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {columnTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`task-card-wrapper${snapshot.isDragging ? ' dragging' : ''}`}
                            >
                              {selectMode && (
                                <input
                                  type="checkbox"
                                  className="task-checkbox"
                                  checked={selectedTasks.has(task.id)}
                                  onChange={() => toggleTaskSelection(task.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              <TaskCard 
                                task={task} 
                                onDelete={handleDeleteTask} 
                                onEdit={handleEditTask} 
                                customFields={customFields}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {columnTasks.length === 0 && (
                        <div className="empty-column">拖拽任务到此处</div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="编辑任务">
        <form onSubmit={handleSaveEdit}>
          <div className="form-group">
            <label>标题</label>
            <input
              type="text"
              value={editTask?.title || ''}
              onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>描述</label>
            <textarea
              value={editTask?.description || ''}
              onChange={(e) => setEditTask({ ...editTask, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>状态</label>
            <select
              value={editTask?.status || 'todo'}
              onChange={(e) => setEditTask({ ...editTask, status: e.target.value })}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>优先级</label>
            <select
              value={editTask?.priority || 'medium'}
              onChange={(e) => setEditTask({ ...editTask, priority: e.target.value })}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>截止日期</label>
            <input
              type="date"
              value={editTask?.due_date || ''}
              onChange={(e) => setEditTask({ ...editTask, due_date: e.target.value })}
            />
          </div>
          {customFields.map((field) => (
            <div key={field.id} className="form-group">
              <label>{field.name}{field.required && ' *'}</label>
              {renderCustomFieldInput(field, editTask?.custom_field_values, true)}
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setEditModalOpen(false)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">保存</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={bulkModalOpen} onClose={() => setBulkModalOpen(false)} title="批量移动任务">
        <div className="form-group">
          <label>移动到状态</label>
          <select
            value={bulkMoveStatus}
            onChange={(e) => setBulkMoveStatus(e.target.value)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <p>已选择 {selectedTasks.size} 个任务</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setBulkModalOpen(false)}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleBulkMove}>
            确认移动
          </button>
        </div>
      </Modal>
    </div>
  );
}
