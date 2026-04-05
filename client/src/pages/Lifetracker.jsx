import React, { useState, useEffect, useRef } from 'react';

const DELTA_FADE_MS = 900;
const DELTA_CLEAR_MS = 1400;

export default function Lifetracker() {
  const [player1Life, setPlayer1Life] = useState(20);
  const [player2Life, setPlayer2Life] = useState(20);
  const [lifeDelta, setLifeDelta] = useState({
    1: { value: null, fading: false },
    2: { value: null, fading: false }
  });

  const deltaTimers = useRef({ 1: {}, 2: {} });
  const [activeMatch, setActiveMatch] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const fetchActiveMatch = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch('/api/matches/active', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.match) {
          setActiveMatch(data.match);
        }
      } catch (err) {
        console.error('Failed to fetch active match:', err);
      }
    };
    fetchActiveMatch();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(deltaTimers.current).forEach(playerTimers => {
        Object.values(playerTimers).forEach(timerId => clearTimeout(timerId));
      });
    };
  }, []);

  const showLifeDelta = (player, change) => {
    const playerTimers = deltaTimers.current[player] || {};
    Object.values(playerTimers).forEach(timerId => clearTimeout(timerId));

    setLifeDelta(prev => ({
      ...prev,
      [player]: { value: change, fading: false }
    }));

    deltaTimers.current[player] = {
      fade: setTimeout(() => {
        setLifeDelta(prev => ({
          ...prev,
          [player]: prev[player].value === change
            ? { ...prev[player], fading: true }
            : prev[player]
        }));
      }, DELTA_FADE_MS),
      clear: setTimeout(() => {
        setLifeDelta(prev => ({
          ...prev,
          [player]: prev[player].value === change
            ? { value: null, fading: false }
            : prev[player]
        }));
      }, DELTA_CLEAR_MS)
    };
  };

  // Helper utility to flash backgrounds slightly on tap
  const handleTap = (player, change, e) => {
    if (player === 1) setPlayer1Life(prev => prev + change);
    if (player === 2) setPlayer2Life(prev => prev + change);
    showLifeDelta(player, change);
    
    const el = e.currentTarget;
    const originalBg = el.style.backgroundColor;
    el.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    setTimeout(() => {
      el.style.backgroundColor = originalBg;
    }, 100);
  };

  const getAvatar = (url, name) => {
    if (url) return url;
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1e293b" /><text x="50%" y="50%" fill="white" font-size="20" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const PlayerSection = ({ life, playerNum, isUpsideDown }) => {
    const blurBg = localStorage.getItem('lifetrackerBlur') === 'true';
    const delta = lifeDelta[playerNum];
    const deltaLabel = delta?.value ? `${delta.value > 0 ? '+' : ''}${delta.value}` : null;
    let bgImage = 'none';
    let bgColor = playerNum === 1 ? 'var(--surface-color)' : 'rgba(15,23,42,1)';
    
    if (activeMatch) {
      const isMePlayer1 = activeMatch.player1_id === user.id;
      if (playerNum === 1) {
        const myAvatar = isMePlayer1 ? activeMatch.player1_avatar : activeMatch.player2_avatar;
        const myName = isMePlayer1 ? activeMatch.player1_display : activeMatch.player2_display;
        bgImage = `url("${getAvatar(myAvatar, myName)}")`;
      } else {
        const oppAvatar = isMePlayer1 ? activeMatch.player2_avatar : activeMatch.player1_avatar;
        const oppName = isMePlayer1 ? activeMatch.player2_display : activeMatch.player1_display;
        bgImage = `url("${getAvatar(oppAvatar, oppName)}")`;
      }
    }

    return (
      <div style={{
        flex: 1,
        position: 'relative',
        transform: isUpsideDown ? 'rotate(180deg)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderBottom: isUpsideDown ? 'none' : '2px solid var(--primary)',
        borderTop: isUpsideDown ? '2px solid var(--primary)' : 'none',
        userSelect: 'none',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: bgImage !== 'none' ? (blurBg ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.6)') : 'transparent',
          backdropFilter: bgImage !== 'none' && blurBg ? 'blur(10px)' : 'none',
          WebkitBackdropFilter: bgImage !== 'none' && blurBg ? 'blur(10px)' : 'none',
          pointerEvents: 'none',
          zIndex: 1
        }} />

        <div 
          onClick={(e) => handleTap(playerNum, -1, e)}
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: '50%',
            cursor: 'pointer', zIndex: 10, transition: 'background-color 0.1s'
          }}
        />
        
        <div 
          onClick={(e) => handleTap(playerNum, 1, e)}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%',
            cursor: 'pointer', zIndex: 10, transition: 'background-color 0.1s'
          }}
        />

        <div style={{
          fontSize: 'clamp(8rem, 30vw, 16rem)',
          fontWeight: 800,
          color: 'white',
          WebkitTextStroke: '3px rgba(0,0,0,0.8)',
          textShadow: '0 0 30px rgba(0,0,0,0.8)',
          zIndex: 5,
          pointerEvents: 'none',
          fontVariantNumeric: 'tabular-nums'
        }}>
          {life}
        </div>

        {deltaLabel && (
          <div style={{
            position: 'absolute',
            top: '18%',
            left: '50%',
            transform: `translate(-50%, ${delta.fading ? '-1rem' : '0'})`,
            fontSize: 'clamp(2rem, 8vw, 3.5rem)',
            fontWeight: 800,
            color: delta.value > 0 ? '#34d399' : '#f87171',
            textShadow: '0 0 16px rgba(0,0,0,0.85)',
            opacity: delta.fading ? 0 : 1,
            transition: 'opacity 0.45s ease, transform 0.45s ease',
            zIndex: 6,
            pointerEvents: 'none',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {deltaLabel}
          </div>
        )}

        <div style={{ position: 'absolute', left: '10%', fontSize: '4rem', opacity: 0.1, zIndex: 2, pointerEvents: 'none', textShadow: '0 0 10px rgba(0,0,0,0.8)' }}>-</div>
        <div style={{ position: 'absolute', right: '10%', fontSize: '4rem', opacity: 0.1, zIndex: 2, pointerEvents: 'none', textShadow: '0 0 10px rgba(0,0,0,0.8)' }}>+</div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000',
      zIndex: 9999
    }}>
      <button 
        onClick={() => {
          setPlayer1Life(20);
          setPlayer2Life(20);
          setLifeDelta({
            1: { value: null, fading: false },
            2: { value: null, fading: false }
          });
        }}
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
