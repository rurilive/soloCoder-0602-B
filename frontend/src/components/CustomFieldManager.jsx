import React, { useState, useEffect } from 'react';
import { customFieldAPI } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from './Modal';

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '单选' },
  { value: 'multiselect', label: '多选' },
  { value: 'checkbox', label: '复选框' },
];

export default function CustomFieldManager({ projectId, isOpen, onClose }) {
  const [fields, setFields] = useState([]);
  const [editingField, setEditingField] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showToast } = useToast();

  const fetchFields = async () => {
    try {
      const res = await customFieldAPI.list(projectId);
      setFields(res.data);
    } catch {
      showToast('加载自定义字段失败', 'error');
    }
  };

  useEffect(() => {
    if (projectId && isOpen) {
      fetchFields();
    }
  }, [projectId, isOpen]);

  const handleAddField = () => {
    setEditingField({
      name: '',
      field_type: 'text',
      required: false,
      options: [],
    });
    setIsModalOpen(true);
  };

  const handleEditField = (field) => {
    setEditingField({ ...field, options: field.options || [] });
    setIsModalOpen(true);
  };

  const handleDeleteField = async (fieldId) => {
    if (!window.confirm('确定删除此字段？所有任务的相关值也将被移除。')) return;
    try {
      await customFieldAPI.delete(projectId, fieldId);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      showToast('字段删除成功', 'success');
    } catch {
      showToast('删除字段失败', 'error');
    }
  };

  const handleSaveField = async () => {
    if (!editingField.name.trim()) {
      showToast('请输入字段名称', 'error');
      return;
    }
    try {
      if (editingField.id) {
        await customFieldAPI.update(projectId, editingField.id, editingField);
        setFields((prev) =>
          prev.map((f) => (f.id === editingField.id ? { ...f, ...editingField } : f))
        );
        showToast('字段更新成功', 'success');
      } else {
        const res = await customFieldAPI.create(projectId, editingField);
        setFields((prev) => [...prev, res.data]);
        showToast('字段创建成功', 'success');
      }
      setIsModalOpen(false);
      setEditingField(null);
    } catch {
      showToast('保存字段失败', 'error');
    }
  };

  const handleAddOption = () => {
    setEditingField((prev) => ({
      ...prev,
      options: [...(prev.options || []), ''],
    }));
  };

  const handleRemoveOption = (index) => {
    setEditingField((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const handleOptionChange = (index, value) => {
    setEditingField((prev) => {
      const newOptions = [...prev.options];
      newOptions[index] = value;
      return { ...prev, options: newOptions };
    });
  };

  return (
    <>
      {isOpen && (
        <div className="custom-field-manager">
          <div className="field-manager-header">
            <h3>自定义字段管理</h3>
            <button className="btn btn-primary btn-sm" onClick={handleAddField}>
              + 添加字段
            </button>
          </div>
          <div className="field-list">
            {fields.length === 0 ? (
              <div className="field-empty">暂无自定义字段，点击上方按钮添加</div>
            ) : (
              fields.map((field) => (
                <div key={field.id} className="field-item">
                  <div className="field-info">
                    <span className="field-name">{field.name}</span>
                    <span className="field-type-badge">
                      {FIELD_TYPE_OPTIONS.find((o) => o.value === field.field_type)?.label || field.field_type}
                    </span>
                    {field.required && <span className="field-required-badge">必填</span>}
                  </div>
                  <div className="field-actions">
                    <button className="btn btn-outline btn-xs" onClick={() => handleEditField(field)}>
                      编辑
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDeleteField(field.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingField(null); }} title={editingField?.id ? '编辑字段' : '添加字段'}>
        <div className="form-group">
          <label>字段名称</label>
          <input
            type="text"
            value={editingField?.name || ''}
            onChange={(e) => setEditingField((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="例如：负责人、标签、预计工时..."
            required
          />
        </div>
        <div className="form-group">
          <label>字段类型</label>
          <select
            value={editingField?.field_type || 'text'}
            onChange={(e) => setEditingField((prev) => ({ ...prev, field_type: e.target.value }))}
          >
            {FIELD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={editingField?.required || false}
              onChange={(e) => setEditingField((prev) => ({ ...prev, required: e.target.checked }))}
            />
            必填字段
          </label>
        </div>
        {(editingField?.field_type === 'select' || editingField?.field_type === 'multiselect') && (
          <div className="form-group">
            <label>选项</label>
            {editingField?.options?.map((opt, index) => (
              <div key={index} className="option-input-row">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  placeholder={`选项 ${index + 1}`}
                />
                <button type="button" className="btn btn-danger btn-xs" onClick={() => handleRemoveOption(index)}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={handleAddOption}>
              + 添加选项
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => { setIsModalOpen(false); setEditingField(null); }}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSaveField}>
            保存
          </button>
        </div>
      </Modal>
    </>
  );
}
