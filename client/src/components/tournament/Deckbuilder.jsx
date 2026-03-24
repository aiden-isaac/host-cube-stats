import React, { useState } from 'react';
import { useToast } from '../ToastProvider';

export default function Deckbuilder({ tournament, players, isHost, user }) {
  const { addToast } = useToast();
  const [deckTitle, setDeckTitle] = useState(`${user.username}'s Deck`);
  const [decklistText, setDecklistText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  
  const token = localStorage.getItem('token');
  const myPlayer = players.find(p => p.user_id === user.id);
  const hasSubmitted = myPlayer?.decklist_submitted === 1;

  const handleSubmitDeck = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/decklists/tournaments/${tournament.id}/decklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ deckTitle, decklistText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit decklist');
      
      addToast(`Deck submitted! (${data.cardCount} main / ${data.sideboardCount} side)`, 'success');
      // The socket 'tournament:refresh' will naturally update the component to show standard lobby.
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartMatches = async () => {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'playing' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start matches');
      
      addToast('Tournament has begun!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
      setAdvancing(false);
    }
  };

  return (
    <div className="glass-box col gap-6" style={{ minHeight: '70vh' }}>
      <div className="text-center">
        <h2 className="text-gradient">Deckbuilding Phase</h2>
        <p>Build your deck from your drafted pool and submit the final list.</p>
      </div>

      <div className="row justify-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '2rem' }}>
        
        {/* Left Side: Submission Form */}
        <div style={{ flex: '1 1 300px' }}>
          {hasSubmitted ? (
            <div className="glass-box text-center" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--success)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h3>Deck Submitted!</h3>
              <p>Waiting for other players to finish...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitDeck}>
              <div className="form-group">
                <label>Deck Name</label>
                <input 
                  type="text" 
                  value={deckTitle}
                  onChange={e => setDeckTitle(e.target.value)}
                  placeholder="e.g. Blue/Red Spells"
                  required
                />
              </div>

              <div className="form-group">
                <label>Decklist (MTGO / Arena Format)</label>
                <textarea 
                  rows={15} 
                  value={decklistText}
                  onChange={e => setDecklistText(e.target.value)}
                  placeholder="1x Black Lotus&#10;4x Lightning Bolt&#10;&#10;Sideboard&#10;1x Pyroblast"
                  required
                />
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>
                  Put sideboard cards beneath a "Sideboard" line.
                </p>
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Final Deck'}
              </button>
            </form>
          )}
        </div>

        {/* Right Side: Player Status List & Host Controls */}
        <div style={{ flex: '1 1 300px', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
            Submission Status
          </h3>
          
          <div className="col gap-2 mb-6">
            {players.map(p => (
              <div key={p.id} className="row justify-between align-center" style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span>{p.display_name}</span>
                {p.decklist_submitted === 1 ? (
                  <span className="badge badge-success">Ready</span>
                ) : (
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>Building...</span>
                )}
              </div>
            ))}
          </div>

          {isHost && (
            <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                As Host, you can force advance the tournament even if not everyone has submitted.
              </p>
              <button 
                className="btn btn-primary w-full" 
                onClick={handleStartMatches}
                disabled={advancing}
              >
                {advancing ? 'Starting...' : 'Begin Round 1'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
