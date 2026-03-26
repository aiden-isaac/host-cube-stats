import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { Gamepad2, Trophy, Layers, Image as ImageIcon, Settings, LogOut, Activity } from 'lucide-react';

export default function AppShell() {
  const navigate = useNavigate();

  // Basic check for auth
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const [bgImage, setBgImage] = useState("https://api.scryfall.com/cards/fdn/140?format=image&version=art_crop");
  const [artistName, setArtistName] = useState("Unknown");

  useEffect(() => {
    let intervalId;
    fetch('/api/cube/current', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.cards && data.cards.length > 0) {
          const updateBg = () => {
            const randomCard = data.cards[Math.floor(Math.random() * data.cards.length)];
            
            let artUrl = randomCard.art_crop_url;
            if (randomCard.override_image_url) {
              // Try to convert the override URL to an art crop URL if it's from Scryfall
              if (randomCard.override_image_url.includes('/normal/')) {
                artUrl = randomCard.override_image_url.replace('/normal/', '/art_crop/');
              } else if (randomCard.override_image_url.includes('/large/')) {
                artUrl = randomCard.override_image_url.replace('/large/', '/art_crop/');
              } else if (randomCard.override_image_url.includes('/small/')) {
                artUrl = randomCard.override_image_url.replace('/small/', '/art_crop/');
              } else {
                artUrl = randomCard.override_image_url;
              }
            }

            if (artUrl) {
              setBgImage(artUrl);
              setArtistName(randomCard.artist || "Unknown");
            }
          };
          updateBg();
          intervalId = setInterval(updateBg, 30000);
        }
      })
      .catch(err => console.error('Failed to load dynamic backgrounds', err));

    return () => clearInterval(intervalId);
  }, [token]);

  return (
    <>
      {/* Background Layers */}
      <div className="dynamic-bg" style={{ backgroundImage: `url('${bgImage}')` }} />
      <div className="dynamic-bg-overlay" />

      {/* Top Header / Navigation */}
      <header className="app-header">
        <div className="title-area">
          <h2 style={{ margin: 0 }}>
            <img src="/logo.jpg" alt="Cube Stats" style={{ height: '40px' }} />
          </h2>
        </div>

        <nav className="nav-links">
          <NavLink to="/games" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Gamepad2 size={18} /> <span style={{ marginLeft: 8 }}>Games</span>
          </NavLink>
          <NavLink to="/leaderboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Trophy size={18} /> <span style={{ marginLeft: 8 }}>Leaderboard</span>
          </NavLink>
          <NavLink to="/decklists" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Layers size={18} /> <span style={{ marginLeft: 8 }}>Decklists</span>
          </NavLink>
          <NavLink to="/lifetracker" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Activity size={18} /> <span style={{ marginLeft: 8 }}>Life Tracker</span>
          </NavLink>
          <NavLink to="/cube" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <ImageIcon size={18} /> <span style={{ marginLeft: 8 }}>Cube List</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={18} /> <span style={{ marginLeft: 8 }}>Settings</span>
          </NavLink>
        </nav>

        <div className="logout-area">
          <button onClick={handleLogout} className="btn btn-ghost">
            <LogOut size={18} /> <span className="hide-on-mobile" style={{ marginLeft: 8 }}>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container" style={{ flex: 1, padding: '2rem' }}>
        <Outlet />
      </main>

      {/* Legal Footer */}
      <footer style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.6, fontSize: '0.8rem' }}>
        <p>Cube Stats is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. &copy;Wizards of the Coast LLC.</p>
        <p style={{ marginTop: '0.5rem' }}>Artist Credit: <span id="artist-credit-name">{artistName}</span></p>
      </footer>
    </>
  );
}
