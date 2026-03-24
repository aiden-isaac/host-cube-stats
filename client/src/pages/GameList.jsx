import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';

export default function GameList() {
  const [tournaments, setTournaments] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  
  // Join State
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  // Create Tournament State (Host)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tName, setTName] = useState('');
  const [tPlayers, setTPlayers] = useState(8);
  const [draftTimer, setDraftTimer] = useState(false);
  const [matchTimer, setMatchTimer] = useState(false);
  
  const navigate = useNavigate();
  const { addToast } = useToast();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isHost = user.role === 'host';

  useEffect(() => {
    fetchTournaments(filter);
  }, [filter]);

  const fetchTournaments = async (statusFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments?status=${statusFilter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setTournaments(data.tournaments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (joinCode.length !== 6) return addToast('Code must be 6 characters', 'warning');
    
    setJoining(true);
    try {
      const res = await fetch('/api/tournaments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ joinCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      
      addToast('Successfully joined!', 'success');
      navigate(`/games/${data.tournamentId}`);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: tName,
          maxPlayers: tPlayers,
          draftTimerEnabled: draftTimer,
          draftTimerSeconds: draftTimer ? 60 : 0,
          matchTimerEnabled: matchTimer,
          matchTimerMinutes: matchTimer ? 50 : 0
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      
      addToast('Tournament created!', 'success');
      setShowCreateModal(false);
      navigate(`/games/${data.tournament.id}`);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Games & Tournaments</h2>
        <div className="page-controls">
          <form onSubmit={handleJoin} style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
            <input 
              type="text" 
              placeholder="Join Code (6 chars)" 
              value={joinCode} 
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ flex: 1, textTransform: 'uppercase' }}
            />
            <button type="submit" className="btn btn-secondary" disabled={joining || joinCode.length !== 6}>
              Join
            </button>
          </form>
          
          {isHost && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} style={{ whiteSpace: 'nowrap' }}>
              + Initialize Draft
            </button>
          )}
        </div>
      </div>

      <div className="row gap-4 mb-6">
        <button 
          className={`btn ${filter === 'active' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('active')}
        >Active Games</button>
        <button 
          className={`btn ${filter === 'past' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('past')}
        >Past Games</button>
      </div>

      {loading ? (
        <div className="row justify-center mt-8"><div className="spinner" /></div>
      ) : tournaments.length === 0 ? (
        <div className="glass-box text-center opacity-70">
          <p>No {filter} tournaments found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {tournaments.map(t => (
            <div key={t.id} className="glass-box" style={{ cursor: 'pointer', transition: 'var(--transition)' }} onClick={() => navigate(`/games/${t.id}`)}>
              <div className="row justify-between mb-2">
                <span className={`badge ${t.status === 'complete' ? 'badge-success' : 'badge-info'}`}>
                  {t.status.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </div>
              <h3 style={{ margin: '0.5rem 0' }}>{t.name}</h3>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Host: <span style={{ color: 'var(--primary)' }}>{t.host_name}</span><br/>
                Players: {t.player_count} / {t.max_players}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Create Tournament Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-box" style={{ width: '90%', maxWidth: '450px' }}>
            <div className="row justify-between align-center mb-4">
              <h3 style={{ margin: 0 }}>Initialize Draft</h3>
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)} style={{ padding: '0.2rem 0.5rem' }}>✕</button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Tournament Name</label>
                <input type="text" value={tName} onChange={e => setTName(e.target.value)} required placeholder="Friday Night Cube" />
              </div>
              
              <div className="form-group">
                <label>Max Players</label>
                <select value={tPlayers} onChange={e => setTPlayers(parseInt(e.target.value))}>
                  <option value={2}>2 Players</option>
                  <option value={3}>3 Players</option>
                  <option value={4}>4 Players</option>
                  <option value={5}>5 Players</option>
                  <option value={6}>6 Players</option>
                  <option value={7}>7 Players</option>
                  <option value={8}>8 Players</option>
                </select>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                <label className="toggle-wrapper" style={{ flex: 1 }}>
                  <input type="checkbox" checked={draftTimer} onChange={e => setDraftTimer(e.target.checked)} />
                  <span>60s Draft Timer</span>
                </label>
                <label className="toggle-wrapper" style={{ flex: 1 }}>
                  <input type="checkbox" checked={matchTimer} onChange={e => setMatchTimer(e.target.checked)} />
                  <span>50m Match Timer</span>
                </label>
              </div>

              <div className="row gap-2 mt-6">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating}>
                  {creating ? 'Starting...' : 'Create Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
