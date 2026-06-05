import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAPI } from '../api';

export default function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchProjects = async () => {
    try {
      const res = await projectAPI.list();
      setProjects(res.data);
    } catch (err) {
      setError('加载项目失败');
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await projectAPI.create({ name, description });
      setName('');
      setDescription('');
      fetchProjects();
    } catch (err) {
      setError('创建项目失败');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除此项目？')) return;
    try {
      await projectAPI.delete(id);
      fetchProjects();
    } catch (err) {
      setError('删除项目失败');
    }
  };

  return (
    <div className="project-list">
      <h2>我的项目</h2>
      {error && <div className="error-msg">{error}</div>}

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
              <button
                className="btn btn-danger btn-sm"
                onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 && <p className="empty-msg">还没有项目，请创建一个吧</p>}
      </div>
    </div>
  );
}
