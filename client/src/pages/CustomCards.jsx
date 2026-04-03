import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../components/ToastProvider';

export default function CustomCards() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const fileInputRef = useRef(null);

  const { addToast } = useToast();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isHost = user.role === 'host';

  const fetchCards = async () => {
    try {
      const res = await fetch('/api/custom-cards', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCards(data.cards || []);
      } else {
        throw new Error(data.error || 'Failed to fetch custom cards');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!newCardName.trim()) {
      return addToast('Card name is required', 'error');
    }
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      return addToast('Please select an image file', 'error');
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('card_name', newCardName.trim());
      formData.append('image', file);

      const res = await fetch('/api/custom-cards', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload custom card');

      addToast('Custom card added successfully!', 'success');
      setNewCardName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchCards();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete custom card "${name}"?`)) return;
    try {
      const res = await fetch(`/api/custom-cards/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete custom card');
      addToast('Custom card deleted!', 'success');
      fetchCards();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Custom Card Gallery</h2>
      </div>

      {isHost && (
        <div className="glass-box mb-6" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0' }}>Add Custom Card</h3>
          <form onSubmit={handleUpload} className="row gap-4 align-end flex-wrap">
            <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
              <label>Card Name</label>
              <input 
                type="text" 
                value={newCardName}
                onChange={e => setNewCardName(e.target.value)}
                placeholder="e.g. My Custom Boss"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
              <label>Image (JPG/PNG/WEBP)</label>
              <input 
                type="file" 
                ref={fileInputRef}
                accept=".jpg,.jpeg,.png,.webp"
                required
                className="input-field"
                style={{ padding: '0.4rem' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Card'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="row justify-center py-6"><div className="spinner" /></div>
      ) : cards.length === 0 ? (
        <div className="glass-box text-center" style={{ padding: '4rem 0' }}>
          <h3 className="text-muted">No custom cards uploaded yet.</h3>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '1.5rem'
        }}>
          {cards.map(card => (
            <div key={card.id} className="glass-box" style={{ padding: '0.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
              <img 
                src={card.image_url} 
                alt={card.card_name} 
                style={{ 
                  width: '100%', 
                  borderRadius: 'inherit', 
                  display: 'block'
                }}
                loading="lazy"
              />
              <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>
                {card.card_name}
              </p>
              {isHost && (
                <button 
                  className="btn btn-ghost text-danger mt-2" 
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                  onClick={() => handleDelete(card.id, card.card_name)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
