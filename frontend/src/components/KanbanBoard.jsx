import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { projectAPI, taskAPI } from '../api';
import TaskCard from './TaskCard';

const COLUMNS = [
  { id: 'todo', title: '待办', color: '#6c757d' },
  { id: 'in_progress', title: '进行中', color: '#0d6efd' },
  { id: 'done', title: '已完成', color: '#198754' },
];

export default function KanbanBoard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('todo');
  const [error, setError] = useState('');

  const fetchProject = async () => {
    try {
      const res = await projectAPI.get(projectId);
      setProject(res.data);
    } catch {
      setError('加载项目失败');
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await taskAPI.list(projectId);
      setTasks(res.data);
    } catch {
      setError('加载任务失败');
    }
  };

  useEffect(() => {
    fetchProject();
    fetchTasks();
  }, [projectId]);

  const getTasksByStatus = useCallback((status) => {
    return tasks
      .filter((t) => t.status === status)
      .sort((a, b) => a.position - b.position);
  }, [tasks]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setError('');
    try {
      await taskAPI.create(projectId, { title: newTaskTitle, status: newTaskStatus });
      setNewTaskTitle('');
      fetchTasks();
    } catch {
      setError('创建任务失败');
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await taskAPI.delete(projectId, taskId);
      fetchTasks();
    } catch {
      setError('删除任务失败');
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
      await taskAPI.reorder(projectId, taskId, { task_id: taskId, new_status: newStatus, new_position: newPosition });
    } catch {
      setTasks(oldTasks);
      setError('移动任务失败');
    }
  };

  if (!project) return <div className="loading">加载中...</div>;

  return (
    <div className="kanban-page">
      <div className="kanban-header">
        <button className="btn btn-outline" onClick={() => navigate('/')}>← 返回</button>
        <h2>{project.name}</h2>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <form className="add-task-form" onSubmit={handleAddTask}>
        <input
          type="text"
          placeholder="新任务标题"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          required
        />
        <select value={newTaskStatus} onChange={(e) => setNewTaskStatus(e.target.value)}>
          {COLUMNS.map((col) => (
            <option key={col.id} value={col.id}>{col.title}</option>
          ))}
        </select>
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
                  <span className="column-count">{columnTasks.length}</span>
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
                              <TaskCard task={task} onDelete={handleDeleteTask} />
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
    </div>
  );
}
