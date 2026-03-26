import React, { useState, useEffect } from 'react';
import { useToast } from '../components/ToastProvider';

export default function Decklists() {
  const { addToast } = useToast();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isHost = user.role === 'host';

  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState('');
  const [decklists, setDecklists] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit Modal State
  const [editingDeck, setEditingDeck] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await fetch('/api/tournaments?status=past', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.tournaments?.length > 0) {
          setTournaments(data.tournaments);
          setSelectedTournament(data.tournaments[0].id);
        }
      } catch (err) {
        // Silently fail if no internet/server
      } finally {
        setLoading(false);
      }
    };
    fetchTournaments();
  }, [token]);

  useEffect(() => {
    if (!selectedTournament) return;
    const fetchDecks = async () => {
      try {
        const res = await fetch(`/api/decklists/tournaments/${selectedTournament}/decklists`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) setDecklists(data.decklists || []);
      } catch (err) {
        addToast('Failed to load decklists', 'error');
      }
    };
    fetchDecks();
  }, [selectedTournament, token, addToast]);

  const handleDownload = (id, title) => {
    // We can just open the native route which responds with Content-Disposition: attachment
    window.location.href = `/api/decklists/${id}/image`;
  };

  const handleDeleteDecklist = async (id) => {
    if (!window.confirm('Are you sure you want to delete this decklist?')) return;
    try {
      const res = await fetch(`/api/decklists/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete decklist');
      
      addToast('Decklist deleted!', 'success');
      setDecklists(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const openEditModal = (deck) => {
    setEditingDeck(deck);
    setEditTitle(deck.deck_title);
    
    // Reconstruct text format
    const main = deck.cards.filter(c => !c.is_sideboard).map(c => `${c.quantity}x ${c.card_name}`).join('\n');
    const side = deck.cards.filter(c => c.is_sideboard).map(c => `${c.quantity}x ${c.card_name}`).join('\n');
    setEditText(`${main}\n\nSideboard\n${side}`);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/decklists/${editingDeck.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ deckTitle: editTitle, decklistText: editText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to edit decklist');
      
      addToast('Decklist updated!', 'success');
      setEditingDeck(null);
      
      // Refresh decklists
      const refreshRes = await fetch(`/api/decklists/tournaments/${selectedTournament}/decklists`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const refreshData = await refreshRes.json();
      if (refreshRes.ok) setDecklists(refreshData.decklists || []);
      
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="row justify-center py-8"><div className="spinner" /></div>;

  return (
    <div className="col gap-6" style={{ minHeight: '70vh' }}>
      <div className="row justify-between align-center" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <h2>Historical Decklists</h2>
        
        {tournaments.length > 0 && (
          <select 
            className="input-field" 
            value={selectedTournament} 
            onChange={e => setSelectedTournament(e.target.value)}
            style={{ minWidth: '250px' }}
          >
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({new Date(t.created_at).toLocaleDateString()})</option>
            ))}
          </select>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="glass-box text-center opacity-70">
          <p>No past tournaments found. Play some matches first!</p>
        </div>
      ) : decklists.length === 0 ? (
        <div className="glass-box text-center opacity-70">
          <p>This tournament doesn't have any submitted decklists.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {decklists.map(deck => {
            const main = deck.cards.filter(c => !c.is_sideboard);
            const side = deck.cards.filter(c => c.is_sideboard);
            
            return (
              <div key={deck.id} className="glass-box" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                <div className="row justify-between align-center mb-4">
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem 0', color: 'var(--primary)' }}>{deck.deck_title}</h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Played by: <span style={{ color: 'var(--text-primary)' }}>{deck.display_name}</span>
                      <br />
                      Submitted: {new Date(deck.submitted_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="row gap-4 flex-1 mb-4" style={{ fontSize: '0.9rem' }}>
                  <div className="col flex-1">
                    <strong style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.2rem', marginBottom: '0.5rem' }}>
                      Maindeck ({main.reduce((acc, c) => acc + c.quantity, 0)})
                    </strong>
                    {main.map(c => (
                      <div key={c.id} className="row justify-between">
                        <span>{c.quantity}x {c.card_name}</span>
                      </div>
                    ))}
                  </div>

                  {side.length > 0 && (
                    <div className="col" style={{ flex: 0.8 }}>
                      <strong style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.2rem', marginBottom: '0.5rem' }}>
                        Sideboard ({side.reduce((acc, c) => acc + c.quantity, 0)})
                      </strong>
                      {side.map(c => (
                        <div key={c.id} className="row justify-between">
                          <span style={{ color: 'var(--text-secondary)' }}>{c.quantity}x {c.card_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="row gap-2 mt-auto pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <button className="btn btn-secondary flex-1" onClick={() => handleDownload(deck.id, deck.deck_title)}>
                    Download Visual
                  </button>
                  {isHost && (
                    <>
                      <button className="btn btn-ghost" onClick={() => openEditModal(deck)}>Edit</button>
                      <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteDecklist(deck.id)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingDeck && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-box" style={{ width: '90%', maxWidth: '500px' }}>
            <h3 className="mb-4">Edit Decklist: {editingDeck.display_name}</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Deck Title</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Decklist Content (MTGO Format)</label>
                <textarea rows={10} value={editText} onChange={e => setEditText(e.target.value)} required style={{ fontFamily: 'monospace' }} />
              </div>
              <div className="row gap-4 mt-6">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingDeck(null)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
