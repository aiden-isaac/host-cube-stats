import React, { useState } from 'react';

export default function Lifetracker() {
  const [player1Life, setPlayer1Life] = useState(20);
  const [player2Life, setPlayer2Life] = useState(20);

  // Helper utility to flash backgrounds slightly on tap
  const handleTap = (player, change, e) => {
    if (player === 1) setPlayer1Life(prev => prev + change);
    if (player === 2) setPlayer2Life(prev => prev + change);
    
    // Optional click ripple/flash effect could go here
    const el = e.currentTarget;
    const originalBg = el.style.backgroundColor;
    el.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    setTimeout(() => {
      el.style.backgroundColor = originalBg;
    }, 100);
  };

  const PlayerSection = ({ life, playerNum, isUpsideDown }) => (
    <div style={{
      flex: 1,
      position: 'relative',
      transform: isUpsideDown ? 'rotate(180deg)' : 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: playerNum === 1 ? 'var(--surface-color)' : 'rgba(15,23,42,1)',
      borderBottom: isUpsideDown ? 'none' : '2px solid var(--primary)',
      borderTop: isUpsideDown ? '2px solid var(--primary)' : 'none',
      userSelect: 'none',
      overflow: 'hidden'
    }}>
      {/* Invisible Left Half (-) */}
      <div 
        onClick={(e) => handleTap(playerNum, -1, e)}
        style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: '50%',
          cursor: 'pointer', zIndex: 10, transition: 'background-color 0.1s'
        }}
      />
      
      {/* Invisible Right Half (+) */}
      <div 
        onClick={(e) => handleTap(playerNum, 1, e)}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%',
          cursor: 'pointer', zIndex: 10, transition: 'background-color 0.1s'
        }}
      />

      {/* Center Number */}
      <div style={{
        fontSize: '12rem',
        fontWeight: 800,
        color: 'var(--text-primary)',
        textShadow: '0 0 30px rgba(0,0,0,0.5)',
        zIndex: 5,
        pointerEvents: 'none',
        fontVariantNumeric: 'tabular-nums'
      }}>
        {life}
      </div>

      {/* Visual Indicator icons (+ / -) faintly visible in the background */}
      <div style={{ position: 'absolute', left: '10%', fontSize: '4rem', opacity: 0.05, pointerEvents: 'none' }}>-</div>
      <div style={{ position: 'absolute', right: '10%', fontSize: '4rem', opacity: 0.05, pointerEvents: 'none' }}>+</div>
    </div>
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000',
      zIndex: 9999 // Cover entire screen including nav if desired, or keep it inside app shell
    }}>
      {/* Reset Button Corner */}
      <button 
        onClick={() => { setPlayer1Life(20); setPlayer2Life(20); }}
        style={{
          position: 'absolute', top: '50%', left: '0', transform: 'translateY(-50%)',
          background: 'var(--primary)', border: 'none', borderRadius: '0 10px 10px 0',
          padding: '0.5rem 1rem', zIndex: 100, cursor: 'pointer', color: '#fff',
          fontWeight: 'bold', boxShadow: '0 0 10px rgba(0,0,0,0.5)'
        }}
      >
        ↺
      </button>

      <PlayerSection life={player2Life} playerNum={2} isUpsideDown={true} />
      <PlayerSection life={player1Life} playerNum={1} isUpsideDown={false} />
    </div>
  );
}
