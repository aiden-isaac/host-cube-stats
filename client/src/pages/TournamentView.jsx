import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useToast } from '../components/ToastProvider';
import Lobby from '../components/tournament/Lobby';
import DraftTimer from '../components/tournament/DraftTimer';
import Deckbuilder from '../components/tournament/Deckbuilder';
import Matchups from '../components/tournament/Matchups';
import Standings from '../components/tournament/Standings';

export default function TournamentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isHost = user.role === 'host';

  const fetchTournamentData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tournament');
      
      setTournament(data.tournament);
      setPlayers(data.players || []);
      setMatches(data.matches || []);
    } catch (err) {
      addToast(err.message, 'error');
      navigate('/games'); // kick out if not found / no access
    } finally {
      setLoading(false);
    }
  }, [id, token, addToast, navigate]);

  useEffect(() => {
    fetchTournamentData();

    // Setup Socket
    const newSocket = io('/tournament', {
      transports: ['websocket', 'polling'] // Try WS first, fallback to polling
    });
    
    newSocket.on('connect', () => {
      newSocket.emit('join', id);
    });

    newSocket.on('tournament:refresh', () => {
      // Something changed (player joined, status changed, etc), fetch latest DB state
      fetchTournamentData();
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('leave', id);
      newSocket.disconnect();
    };
  }, [id, fetchTournamentData]);

  if (loading) return <div className="row justify-center mt-8"><div className="spinner" /></div>;
  if (!tournament) return null;

  return (
    <div className="container" style={{ paddingTop: 0 }}>
      {tournament.status === 'lobby' && (
        <Lobby 
          tournament={tournament} 
          players={players} 
          isHost={isHost} 
          user={user}
        />
      )}
      {tournament.status === 'drafting' && (
        <DraftTimer 
          tournament={tournament} 
          isHost={isHost} 
          socket={socket} 
        />
      )}
      {tournament.status === 'deckbuilding' && (
        <Deckbuilder 
          tournament={tournament} 
          players={players} 
          isHost={isHost} 
          user={user} 
        />
      )}
      {tournament.status === 'playing' && (
        <Matchups 
          tournament={tournament} 
          matches={matches} 
          isHost={isHost} 
          user={user} 
          socket={socket} 
        />
      )}
      {tournament.status === 'complete' && (
        <Standings 
          tournament={tournament} 
          players={players}
          matches={matches}
          isHost={isHost}
          onRefresh={fetchTournamentData}
        />
      )}
    </div>
  );
}
