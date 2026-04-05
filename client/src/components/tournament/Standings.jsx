import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { useToast } from '../ToastProvider';

export default function Standings({ tournament, players, matches = [], isHost = false, onRefresh }) {
  const { addToast } = useToast();
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [editValues, setEditValues] = useState({ player1Wins: '', player2Wins: '', draws: 0 });
  const [savingEdit, setSavingEdit] = useState(false);
  const printRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  const fetchStandings = async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/standings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch standings');
      setStandings(data.standings || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStandings();
  }, [tournament.id, token]);

  const handleExport = async () => {
    setExporting(true);
    addToast('Generating Graphic Composite...', 'info');

    try {
      const res = await fetch(`/api/decklists/tournaments/${tournament.id}/decklists`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      const myDeck = data.decklists?.find(d => d.user_id === user.id);
      
      if (!myDeck) {
        throw new Error('You did not submit a decklist to export!');
      }

      window.location.href = `/api/decklists/${myDeck.id}/image`;
      setTimeout(() => setExporting(false), 2000);
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to generate image', 'error');
      setExporting(false);
    }
  };

  const isByeMatch = (match) => match.player2_id == null;

  const beginEdit = (match) => {
    if (isByeMatch(match)) {
      addToast('BYE matches are fixed at 2-0 and cannot be corrected.', 'error');
      return;
    }

    setEditingMatchId(match.id);
    setEditValues({
      player1Wins: match.player1_wins,
      player2Wins: match.player2_wins,
      draws: match.draws || 0
    });
  };

  const cancelEdit = () => {
    setEditingMatchId(null);
    setEditValues({ player1Wins: '', player2Wins: '', draws: 0 });
  };

  const saveEdit = async (matchId) => {
    setSavingEdit(true);
    try {
      const payload = {
        player1Wins: Number(editValues.player1Wins),
        player2Wins: Number(editValues.player2Wins),
        draws: Number(editValues.draws || 0)
      };

      const res = await fetch(`/api/matches/${matchId}/result`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to correct result');

      addToast('Match result corrected.', 'success');
      cancelEdit();
      await fetchStandings();
      if (onRefresh) await onRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const getRankColor = (rank) => {
    if (rank === 1) return '#fbbf24';
    if (rank === 2) return '#94a3b8';
    if (rank === 3) return '#b45309';
    return 'var(--text-primary)';
  };

  const completedMatches = matches
    .filter(match => match.status === 'complete')
    .sort((a, b) => a.round_number - b.round_number || a.id - b.id);

  if (loading) return <div className="row justify-center py-8"><div className="spinner" /></div>;

  return (
    <div className="col gap-6" style={{ alignItems: 'center', minHeight: '60vh' }}>
      <div className="col gap-4 align-center text-center w-full" style={{ maxWidth: '800px' }}>
        <h2>Results</h2>
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Generating...' : 'Export Deck & Record Graphic'}
        </button>
      </div>

      <div 
        ref={printRef} 
        style={{ 
          width: '100%', 
          maxWidth: '800px', 
          background: 'linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(30,41,59,1) 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          boxShadow: 'var(--card-shadow)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '10px', background: 'linear-gradient(90deg, var(--primary), var(--secondary))' }} />
        
        <div className="text-center mb-6">
          <h1 className="text-gradient" style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem' }}>{tournament.name}</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Final Standings • {players.length} Players</p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem' }}>Rank</th>
                <th style={{ padding: '1rem' }}>Player</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Points</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Record</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>OMW%</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, idx) => (
                <tr 
                  key={s.userId} 
                  style={{ 
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                  }}
                >
                  <td style={{ padding: '1rem', fontWeight: 700, fontSize: '1.2rem', color: getRankColor(s.rank) }}>
                    #{s.rank}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 600 }}>
                    {s.displayName}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, color: 'var(--info)' }}>
                    {s.matchPoints}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {s.matchWins}-{s.matchLosses}{s.matchDraws > 0 ? `-${s.matchDraws}` : ''}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace', opacity: 0.8 }}>
                    {s.omwPercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-center mt-8" style={{ fontSize: '0.8rem', opacity: 0.5 }}>
          Generated by Cube Stats
        </div>
      </div>

      {isHost && completedMatches.length > 0 && (
        <div className="glass-box w-full" style={{ maxWidth: '800px' }}>
          <div className="col gap-2 mb-4">
            <h3 style={{ margin: 0 }}>Completed Match Corrections</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Host-only post-tournament result fixes. Updating a score recomputes standings from the stored match history.
            </p>
          </div>

          <div className="col gap-3">
            {completedMatches.map(match => {
              const isEditing = editingMatchId === match.id;
              const byeMatch = isByeMatch(match);
              return (
                <div
                  key={match.id}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}
                >
                  <div className="row justify-between align-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Round {match.round_number}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        {match.player1_display} {match.player1_wins}-{match.player2_wins} {match.player2_display || 'BYE'}
                        {match.draws > 0 ? ` • ${match.draws} draws` : ''}
                      </div>
                      {byeMatch && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                          BYE results are locked to the automatic 2-0 win.
                        </div>
                      )}
                    </div>
                    {!isEditing && !byeMatch && (
                      <button className="btn" onClick={() => beginEdit(match)}>
                        Correct Result
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <div className="col gap-3 mt-4">
                      <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
                        <label className="col gap-1" style={{ flex: 1, minWidth: '140px' }}>
                          <span>{match.player1_display} Wins</span>
                          <input
                            type="number"
                            min="0"
                            value={editValues.player1Wins}
                            onChange={(e) => setEditValues(prev => ({ ...prev, player1Wins: e.target.value }))}
                            className="input-field"
                          />
                        </label>
                        <label className="col gap-1" style={{ flex: 1, minWidth: '140px' }}>
                          <span>{match.player2_display} Wins</span>
                          <input
                            type="number"
                            min="0"
                            value={editValues.player2Wins}
                            onChange={(e) => setEditValues(prev => ({ ...prev, player2Wins: e.target.value }))}
                            className="input-field"
                          />
                        </label>
                        <label className="col gap-1" style={{ width: '120px' }}>
                          <span>Draws</span>
                          <input
                            type="number"
                            min="0"
                            value={editValues.draws}
                            onChange={(e) => setEditValues(prev => ({ ...prev, draws: e.target.value }))}
                            className="input-field"
                          />
                        </label>
                      </div>

                      <div className="row gap-2" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn" onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
                        <button className="btn btn-primary" onClick={() => saveEdit(match.id)} disabled={savingEdit}>
                          {savingEdit ? 'Saving...' : 'Save Correction'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
