import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      addToast(isLogin ? 'Logged in successfully' : 'Registration complete!', 'success');
      navigate('/games');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const [bgImage, setBgImage] = useState("https://api.scryfall.com/cards/fdn/140?format=image&version=art_crop");

  React.useEffect(() => {
    let intervalId;
    fetch('/api/cube/current')
      .then(r => r.json())
      .then(data => {
        if (data.cards && data.cards.length > 0) {
          const updateBg = () => {
            const randomCard = data.cards[Math.floor(Math.random() * data.cards.length)];
            
            let artUrl = randomCard.art_crop_url;
            if (randomCard.override_image_url) {
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

            if (artUrl) setBgImage(artUrl);
          };
          updateBg();
          intervalId = setInterval(updateBg, 30000);
        }
      })
      .catch(err => console.error('Failed to load dynamic backgrounds', err));

    return () => clearInterval(intervalId);
  }, []);

  return (
    <>
      <div className="dynamic-bg" style={{ backgroundImage: `url('${bgImage}')` }} />
      <div className="dynamic-bg-overlay" />
      
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="glass-box" style={{ width: '100%', maxWidth: '400px' }}>
          <div className="text-center mb-6">
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/logo.png" alt="Cube Stats Logo" style={{ height: '80px' }} />
              <img src="/text.png" alt="Cube Stats" style={{ height: '40px', marginLeft: '16px' }} />
            </h1>
            <p style={{ marginTop: '1rem' }}>{isLogin ? 'Welcome back, planeswalker.' : 'Create your account to start drafting.'}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="Jace Beleren"
              />
            </div>
            
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {isLogin && (
              <div className="form-group">
                <label className="toggle-wrapper">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me for 30 days</span>
                </label>
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full mt-4" disabled={loading}>
              {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
            </button>
          </form>

          <div className="text-center mt-6">
            <button 
              className="btn btn-ghost" 
              onClick={() => setIsLogin(!isLogin)}
              type="button"
            >
              {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
