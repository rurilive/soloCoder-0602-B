import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAPI } from '../api';
import Modal from './Modal';
import { useToast } from '../context/ToastContext';

export default function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editProject, setEditProject] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const fetchProjects = async () => {
    try {
      const res = await projectAPI.list();
      setProjects(res.data);
    } catch (err) {
      showToast('加载项目失败', 'error');
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await projectAPI.create({ name, description });
      setName('');
      setDescription('');
      fetchProjects();
      showToast('项目创建成功', 'success');
    } catch (err) {
      showToast('创建项目失败', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除此项目？')) return;
    try {
      await projectAPI.delete(id);
      fetchProjects();
      showToast('项目删除成功', 'success');
    } catch (err) {
      showToast('删除项目失败', 'error');
    }
  };

  const handleEdit = (project, e) => {
    e.stopPropagation();
    setEditProject({ ...project });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editProject || !editProject.name.trim()) return;
    try {
      await projectAPI.update(editProject.id, {
        name: editProject.name,
        description: editProject.description,
      });
      setEditModalOpen(false);
      setEditProject(null);
      fetchProjects();
      showToast('项目更新成功', 'success');
    } catch (err) {
      showToast('更新项目失败', 'error');
    }
  };

  return (
    <div className="project-list">
      <h2>我的项目</h2>

      <form className="project-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="项目名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="项目描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">创建项目</button>
      </form>

      <div className="projects-grid">
        {projects.map((project) => (
          <div key={project.id} className="project-card" onClick={() => navigate(`/projects/${project.id}`)}>
            <h3>{project.name}</h3>
            <p>{project.description || '暂无描述'}</p>
            <div className="project-meta">
              <span>{new Date(project.created_at).toLocaleDateString()}</span>
              <div className="project-card-actions">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={(e) => handleEdit(project, e)}
                >
                  编辑
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {projects.length === 0 && <p className="empty-msg">还没有项目，请创建一个吧</p>}
      </div>

      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="编辑项目">
        <form onSubmit={handleSaveEdit}>
          <div className="form-group">
            <label>项目名称</label>
            <input
              type="text"
              value={editProject?.name || ''}
              onChange={(e) => setEditProject({ ...editProject, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>项目描述</label>
            <textarea
              value={editProject?.description || ''}
              onChange={(e) => setEditProject({ ...editProject, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setEditModalOpen(false)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">保存</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
