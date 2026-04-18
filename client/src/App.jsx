import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ToastProvider';
import AppShell from './components/AppShell';

// Lazy load or import directly. For now direct imports
import Login from './pages/Login';
import Games from './pages/Games';
import Leaderboard from './pages/Leaderboard';
import Decklists from './pages/Decklists';
import CubeList from './pages/CubeList';
import CustomCards from './pages/CustomCards';
import Settings from './pages/Settings';
import Lifetracker from './pages/Lifetracker';

function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/games" replace />} />
            <Route path="games/*" element={<Games />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="decklists" element={<Decklists />} />
            <Route path="lifetracker" element={<Lifetracker />} />
            <Route path="cube" element={<CubeList />} />
            <Route path="custom-cards" element={<CustomCards />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
