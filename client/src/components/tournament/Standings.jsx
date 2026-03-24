import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { useToast } from '../ToastProvider';

export default function Standings({ tournament, players }) {
  const { addToast } = useToast();
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const printRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  useEffect(() => {
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

    fetchStandings();
  }, [tournament.id, token, addToast]);

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
        throw new Error("You did not submit a decklist to export!");
      }

      window.location.href = `/api/decklists/${myDeck.id}/image`;
      
      // Allow a brief moment for the browser to trigger download
      setTimeout(() => setExporting(false), 2000);
      
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to generate image', 'error');
      setExporting(false);
    }
  };

  const getRankColor = (rank) => {
    if (rank === 1) return '#fbbf24'; // Gold
    if (rank === 2) return '#94a3b8'; // Silver
    if (rank === 3) return '#b45309'; // Bronze
    return 'var(--text-primary)';
  };

  if (loading) return <div className="row justify-center py-8"><div className="spinner" /></div>;

  return (
    <div className="col gap-6" style={{ alignItems: 'center', minHeight: '60vh' }}>
      <div className="col gap-4 align-center text-center w-full" style={{ maxWidth: '800px' }}>
        <h2>Results</h2>
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Generating...' : 'Export Deck & Record Graphic'}
        </button>
      </div>

      {/* Target Container for HTML2Canvas */}
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
        {/* Subtle decorative background for export */}
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
    </div>
  );
}
