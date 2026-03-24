import React, { useState } from 'react';
import { useToast } from '../ToastProvider';

export default function Lobby({ tournament, players, isHost, user }) {
  const { addToast } = useToast();
  const [starting, setStarting] = useState(false);
  const token = localStorage.getItem('token');

  const handleStartDraft = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ status: 'drafting' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start tournament');
      
      // The socket will trigger a refresh across all clients.
      addToast('Draft started!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
      setStarting(false);
    }
  };

  // Provide realistic placeholder avatars if none
  const getAvatar = (url, name) => {
    if (url) return url;
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" fill="%231e293b" /><text x="50%" y="50%" fill="white" font-size="20" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
  };

  return (
    <div className="glass-box">
      <div className="row justify-between align-center mb-6">
        <div>
          <h2 style={{ margin: 0, color: 'var(--primary)' }}>{tournament.name}</h2>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Format: {tournament.format.toUpperCase()} | Players: {players.length} / {tournament.max_players}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>JOIN CODE</p>
          <div className="badge badge-info" style={{ fontSize: '1.2rem', padding: '0.4rem 1rem', letterSpacing: '0.1em' }}>
            {tournament.join_code}
          </div>
        </div>
      </div>

      <h3 style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        Lobby ({players.length}/{tournament.max_players})
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {players.map(p => (
          <div key={p.id} className="row gap-2" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)' }}>
            <img 
              src={getAvatar(p.avatar_url, p.display_name)} 
              alt={p.display_name} 
              style={{ width: '30px', height: '30px', borderRadius: '50%' }} 
            />
            <span style={{ fontWeight: p.user_id === user.id ? 700 : 500, color: p.user_id === user.id ? 'var(--primary)' : 'inherit' }}>
              {p.display_name} {p.user_id === user.id && '(You)'}
            </span>
          </div>
        ))}
        
        {/* Empty Seats */}
        {Array.from({ length: tournament.max_players - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className="row gap-2" style={{ background: 'transparent', border: '1px dashed var(--surface-border)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', opacity: 0.5 }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <span>Waiting...</span>
          </div>
        ))}
      </div>

      {isHost ? (
        <div className="text-center">
          <button 
            className="btn btn-primary" 
            onClick={handleStartDraft} 
            disabled={starting || players.length < 2}
            style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}
          >
            {starting ? 'Starting...' : 'Start Draft'}
          </button>
          {players.length < 2 && <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>Waiting for more players to join...</p>}
        </div>
      ) : (
        <div className="text-center" style={{ padding: '1rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-sm)' }}>
          <div className="spinner" style={{ width: '20px', height: '20px', margin: '0 auto 10px auto', borderColor: 'rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)' }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Waiting for host to start the draft...</p>
        </div>
      )}
    </div>
  );
}
