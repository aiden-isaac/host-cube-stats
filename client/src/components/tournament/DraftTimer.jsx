import React, { useState, useEffect } from 'react';
import { useToast } from '../ToastProvider';

export default function DraftTimer({ tournament, isHost, socket }) {
  const { addToast } = useToast();
  const [timeLeft, setTimeLeft] = useState(null);
  const [running, setRunning] = useState(false);
  
  // Host controls
  const [customSeconds, setCustomSeconds] = useState(50);
  const [advancing, setAdvancing] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!socket) return;

    socket.on('timer:sync', ({ remainingSeconds, type }) => {
      if (type === 'draft') {
        setTimeLeft(remainingSeconds);
        setRunning(true);
      }
    });

    socket.on('timer:start', ({ type, seconds }) => {
      if (type === 'draft') {
        setTimeLeft(seconds);
        setRunning(true);
      }
    });

    socket.on('timer:tick', ({ remainingSeconds, type }) => {
      if (type === 'draft') {
        setTimeLeft(remainingSeconds);
      }
    });

    socket.on('timer:complete', ({ type }) => {
      if (type === 'draft') {
        setTimeLeft(0);
        setRunning(false);
        // Play an alarm sound or flash screen if desired
      }
    });

    socket.on('timer:stopped', () => {
      setTimeLeft(null);
      setRunning(false);
    });

    return () => {
      socket.off('timer:sync');
      socket.off('timer:start');
      socket.off('timer:tick');
      socket.off('timer:complete');
      socket.off('timer:stopped');
    };
  }, [socket]);

  const handleStartTimer = (sec) => {
    if (!socket) return;
    socket.emit('timer:start', { tournamentId: tournament.id, type: 'draft', seconds: sec });
  };

  const handleStopTimer = () => {
    if (!socket) return;
    socket.emit('timer:stop', { tournamentId: tournament.id });
  };

  const handleFinishDraft = async () => {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ status: 'deckbuilding' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to advance to deckbuilding');
      
      addToast('Moving to Deckbuilding phase...', 'success');
      // The socket 'tournament:refresh' will naturally redirect everyone.
    } catch (err) {
      addToast(err.message, 'error');
      setAdvancing(false);
    }
  };

  // Format MM:SS
  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isWarning = timeLeft !== null && timeLeft <= 10 && timeLeft > 0;
  const isZero = timeLeft === 0;

  return (
    <div className="glass-box text-center col justify-center" style={{ minHeight: '60vh' }}>
      <h2 style={{ color: 'var(--text-secondary)' }}>Drafting Phase</h2>
      <p>Pass your packs around the table.</p>

      <div style={{
        fontSize: '8rem',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        margin: '2rem 0',
        color: isZero ? 'var(--danger)' : isWarning ? 'var(--primary)' : 'var(--text-primary)',
        textShadow: isZero || isWarning ? '0 0 40px currentColor' : 'none',
        transition: 'color 0.3s'
      }}>
        {formatTime(timeLeft)}
      </div>

      {isHost ? (
        <div style={{ maxWidth: '400px', margin: '0 auto', width: '100%', padding: '1.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ marginBottom: '1rem' }}>Host Controls</h4>
          
          <div className="row gap-2 justify-center" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button className="btn btn-ghost" onClick={() => handleStartTimer(60)}>60s</button>
            <button className="btn btn-ghost" onClick={() => handleStartTimer(50)}>50s</button>
            <button className="btn btn-ghost" onClick={() => handleStartTimer(40)}>40s</button>
            <button className="btn btn-ghost" onClick={() => handleStartTimer(30)}>30s</button>
          </div>
          
          <div className="row gap-4 justify-center" style={{ marginBottom: '2rem' }}>
             <input 
               type="number" 
               className="input-field" 
               value={customSeconds} 
               onChange={e => setCustomSeconds(parseInt(e.target.value) || 0)}
               style={{ width: '80px', padding: '0.5rem' }}
             />
             <button disabled={running} className="btn btn-primary" onClick={() => handleStartTimer(customSeconds)}>Custom Start</button>
             {running && <button className="btn btn-secondary" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleStopTimer}>Stop</button>}
          </div>

          <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.5rem' }}>
             <button 
               className="btn btn-secondary w-full" 
               style={{ border: '1px solid var(--primary)', color: 'var(--primary)' }}
               disabled={advancing}
               onClick={handleFinishDraft}
             >
               {advancing ? 'Loading...' : 'Finish Draft & Move to Builder'}
             </button>
          </div>
        </div>
      ) : (
        <p style={{ marginTop: '2rem', color: 'var(--text-muted)' }}>
          Wait for the Host to manage the timer or advance the round.
        </p>
      )}
    </div>
  );
}
