import React, { useState } from 'react';
import { useHRMS } from '../../context/HRMSContext';
import { AlertTriangle, Info, Plus } from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export const NotificationCenter: React.FC = () => {
  const { notifications, markNotificationRead, addNotification } = useHRMS();
  const [filter, setFilter] = useState<'All' | 'Urgent' | 'Important' | 'Normal'>('All');
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'Urgent' | 'Important' | 'Normal'>('Normal');

  const filtered = notifications.filter(n => filter === 'All' || n.priority === filter);

  const handlePostAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    addNotification({
      title,
      message,
      priority,
      category: 'Announcement'
    });
    setShowAnnounceModal(false);
    setTitle('');
    setMessage('');
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Global Notification Center</h1>
          <p className="page-subtitle">Company announcements, leave status alerts, task assignments, and payroll updates</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowAnnounceModal(true)}>
            <Plus size={16} /> Post Announcement
          </button>
        </div>
      </div>

      {/* Priority Filters */}
      <div className="tab-container" style={{ marginBottom: '20px' }}>
        {(['All', 'Urgent', 'Important', 'Normal'] as const).map(p => (
          <button
            key={p}
            className={`tab-btn ${filter === p ? 'active' : ''}`}
            onClick={() => setFilter(p)}
          >
            {p} Notifications ({p === 'All' ? notifications.length : notifications.filter(n => n.priority === p).length})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No notifications in this priority category.
          </div>
        ) : (
          filtered.map(n => (
            <div
              key={n.id}
              className="card"
              onClick={() => markNotificationRead(n.id)}
              style={{
                marginBottom: 0,
                padding: '16px 20px',
                borderLeft: `4px solid ${n.priority === 'Urgent' ? 'var(--accent-rose)' : n.priority === 'Important' ? 'var(--accent-amber)' : 'var(--primary-500)'}`,
                backgroundColor: n.read ? '#ffffff' : '#f8fafc',
                cursor: n.read ? 'default' : 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {n.priority === 'Urgent' ? <AlertTriangle size={20} color="var(--accent-rose)" /> : <Info size={20} color="var(--primary-600)" />}
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{n.title}</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{n.message}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`priority-pill ${n.priority.toLowerCase()}`}>{n.priority}</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {formatDateDDMMYYYY(n.createdAt || new Date())}
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); markNotificationRead(n.id); }}
                      style={{ marginTop: '6px', padding: '3px 8px', fontSize: '0.7rem' }}
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Post Announcement Modal */}
      {showAnnounceModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Broadcast Announcement</h2>
              <button onClick={() => setShowAnnounceModal(false)}>✕</button>
            </div>
            <form onSubmit={handlePostAnnouncement}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Title <span style={{ color: '#EF4444' }}>*</span></label>
                  <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Office Holiday Notice" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-control" value={priority} onChange={e => setPriority(e.target.value as any)}>
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Message Content</label>
                  <textarea className="form-control" rows={3} value={message} onChange={e => setMessage(e.target.value)} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAnnounceModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Broadcast to All Users</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
