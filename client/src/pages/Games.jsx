import React from 'react';
import { Routes, Route } from 'react-router-dom';
import GameList from './GameList';
import TournamentView from './TournamentView';

export default function Games() {
  return (
    <Routes>
      <Route path="/" element={<GameList />} />
      <Route path=":id/*" element={<TournamentView />} />
    </Routes>
  );
}
