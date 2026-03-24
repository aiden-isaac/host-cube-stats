import React, { useState, useEffect } from 'react';
import { useToast } from '../components/ToastProvider';

export default function Settings() {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    setDisplayName(user.displayName || '');
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ displayName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      // Update local storage
      localStorage.setItem('user', JSON.stringify({ ...user, displayName }));
      addToast('Profile updated successfully', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-box" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Settings</h2>
      
      <form onSubmit={handleSaveProfile}>
        <div className="form-group">
          <label>Username (Read-only)</label>
          <input type="text" value={user.username || ''} disabled style={{ opacity: 0.7 }} />
        </div>

        <div className="form-group">
          <label>Display Name</label>
          <input 
            type="text" 
            value={displayName} 
            onChange={e => setDisplayName(e.target.value)} 
            placeholder="How others see you"
          />
        </div>

        <button type="submit" className="btn btn-primary mt-4" disabled={loading}>
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
