import React, { useState } from 'react';
import { useToast } from '../ToastProvider';

export default function Matchups({ tournament, matches, isHost, user, socket }) {
  const { addToast } = useToast();
  const token = localStorage.getItem('token');
  
  const currentRound = tournament.current_round || 0;
  const currentMatches = matches.filter(m => m.round_number === currentRound);
  const myMatch = currentMatches.find(m => m.player1_id === user.id || m.player2_id === user.id);
  
  const allComplete = currentRound > 0 && currentMatches.every(m => m.status === 'complete');
  const isFinalRound = tournament.total_rounds && currentRound >= tournament.total_rounds;

  const [generating, setGenerating] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Simple Result submission state
  const [myWins, setMyWins] = useState('');
  const [oppWins, setOppWins] = useState('');

  const handleGeneratePairings = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/matches/tournaments/${tournament.id}/pairings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate pairings');
      addToast(`Round ${data.round} Pairings Generated!`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const submitMatchResult = async (e) => {
    e.preventDefault();
    if (!myMatch) return;

    const isP1 = myMatch.player1_id === user.id;
    const p1Wins = parseInt(myWins) || 0;
    const p2Wins = parseInt(oppWins) || 0;

    const payload = {
      player1Wins: isP1 ? p1Wins : p2Wins,
      player2Wins: isP1 ? p2Wins : p1Wins,
      draws: 0 // As requested, no draws
    };

    try {
      const res = await fetch(`/api/matches/${myMatch.id}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit result');
      addToast('Match result submitted!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleFinishTournament = async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'complete' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to end tournament');
      addToast('Tournament Complete! Viewing Standings...', 'success');
    } catch (err) {
      addToast(err.message, 'error');
      setFinishing(false);
    }
  };

  return (
    <div className="col gap-6" style={{ minHeight: '60vh' }}>
      
      {/* Overview/Pairings Table */}
      <div className="glass-box">
        <div className="col gap-4 align-center text-center mb-6">
          <h2 style={{ margin: 0 }}>Round {currentRound > 0 ? currentRound : 1} Pairings</h2>
          
          {isHost && (
            <div className="row gap-2 justify-center" style={{ flexWrap: 'wrap' }}>
              {currentRound === 0 ? (
                <button className="btn btn-primary" onClick={handleGeneratePairings} disabled={generating}>
                  {generating ? 'Pairing...' : 'Generate Round 1 Pairings'}
                </button>
              ) : allComplete ? (
                isFinalRound ? (
                  <button className="btn btn-success" onClick={handleFinishTournament} disabled={finishing} style={{ background: 'var(--success)', color: 'white' }}>
                    {finishing ? 'Finishing...' : 'End Tournament & View Standings'}
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleGeneratePairings} disabled={generating}>
                    {generating ? 'Pairing...' : `Generate Round ${currentRound + 1}`}
                  </button>
                )
              ) : null}
            </div>
          )}
        </div>

        {currentRound === 0 ? (
          <p className="text-muted text-center py-6">Waiting for the host to generate the first round of pairings.</p>
        ) : (
          <div className="col gap-2">
            {currentMatches.map(m => (
              <div key={m.id} className="row justify-between align-center" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: m.player1_wins > m.player2_wins ? 'var(--primary)' : 'inherit' }}>
                  {m.player1_display} {m.status === 'complete' && `(${m.player1_wins})`}
                </div>
                
                <div style={{ flex: '0 0 80px', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>
                  {m.status === 'complete' ? (m.draws > 0 ? `${m.draws} Draws` : 'VS') : 'VS'}
                </div>
                
                <div style={{ flex: 1, textAlign: 'left', fontWeight: m.player2_id ? 600 : 400, color: m.player2_wins > m.player1_wins ? 'var(--primary)' : 'inherit' }}>
                  {m.player2_id ? `${m.status === 'complete' ? `(${m.player2_wins}) ` : ''}${m.player2_display}` : '(BYE)'}
                </div>
                
                <div style={{ width: '80px', textAlign: 'right' }}>
                  {m.status === 'complete' ? <span className="badge badge-success">Done</span> : <span className="badge">Playing</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Simplified Result Submission Form below Pairings */}
      {myMatch && myMatch.status !== 'complete' && myMatch.player2_id !== null && (
        <div className="glass-box text-center" style={{ background: 'rgba(15,23,42,0.85)', padding: '2rem' }}>
          <h3 className="mb-4 text-gradient">Report Match Result</h3>
          <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>Submit the final outcome of your match.</p>

          <form onSubmit={submitMatchResult} className="col align-center gap-6 w-full">
            <div className="row justify-center align-center w-full" style={{ gap: '1rem', flexWrap: 'nowrap' }}>
              <div className="col text-center" style={{ flex: 1, maxWidth: '120px' }}>
                <label style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.5rem', whiteSpace: 'nowrap' }}>My Wins</label>
                <input 
                  type="number" 
                  min="0" max="2" 
                  placeholder="0"
                  value={myWins} 
                  onChange={e => setMyWins(e.target.value === '' ? '' : parseInt(e.target.value))} 
                  className="input-field text-center" 
                  style={{ fontSize: '2rem', padding: '1rem', height: 'auto', width: '100%' }}
                />
              </div>
              
              <div style={{ fontSize: '2rem', fontWeight: 700, opacity: 0.3 }}>-</div>
              
              <div className="col text-center" style={{ flex: 1, maxWidth: '120px' }}>
                <label style={{ color: 'var(--info)', fontWeight: 600, marginBottom: '0.5rem', whiteSpace: 'nowrap' }}>Opp Wins</label>
                <input 
                  type="number" 
                  min="0" max="2" 
                  placeholder="0"
                  value={oppWins} 
                  onChange={e => setOppWins(e.target.value === '' ? '' : parseInt(e.target.value))} 
                  className="input-field text-center" 
                  style={{ fontSize: '2rem', padding: '1rem', height: 'auto', width: '100%' }}
                />
              </div>
            </div>

            <div className="w-full mt-2">
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 3rem', fontSize: '1.2rem' }}>
                Save Result
              </button>
            </div>
          </form>
        </div>
      )}

      {myMatch && myMatch.status === 'complete' && (
        <div className="glass-box text-center" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--success)' }}>
          <h3>Match Over</h3>
          <p>Waiting for other players to conclude Round {currentRound}...</p>
        </div>
      )}

    </div>
  );
}
