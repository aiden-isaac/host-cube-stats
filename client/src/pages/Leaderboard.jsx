import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import ReactCrop, { makeAspectCrop, centerCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useToast } from '../components/ToastProvider';

export default function Leaderboard() {
  const { addToast } = useToast();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const statsRef = useRef(null);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const fileInputRef = useRef(null);
  const imgRef = useRef(null);
  const [upImg, setUpImg] = useState(null);
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  
  // Modals state
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Gallery state
  const [cubeCards, setCubeCards] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCards, setLoadingCards] = useState(false);

  const onSelectFile = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setUpImg(reader.result));
      reader.readAsDataURL(e.target.files[0]);
      setShowCropModal(true);
      setShowSourceModal(false);
    }
  };

  const openGalleryModal = async () => {
    setShowGalleryModal(true);
    setShowSourceModal(false);
    if (cubeCards.length === 0) {
      setLoadingCards(true);
      try {
        const savedVer = localStorage.getItem('selectedCubeVersion') || 'current';
        const endpoint = savedVer === 'current' ? '/api/cube/current' : `/api/cube/version/${savedVer}`;
        const res = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch cube');
        setCubeCards(data.cards || []);
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setLoadingCards(false);
      }
    }
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    const cropData = centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height);
    setCrop(cropData);
  };

  const handleUploadAvatar = async () => {
    if (!completedCrop || !imgRef.current) return;
    setUploadingAvatar(true);
    try {
      const canvas = document.createElement('canvas');
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
      canvas.width = completedCrop.width;
      canvas.height = completedCrop.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        imgRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0, 0, completedCrop.width, completedCrop.height
      );

      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Canvas is empty');
        const formData = new FormData();
        formData.append('avatar', blob, 'avatar.png');

        const res = await fetch('/api/auth/avatar', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const updatedUser = { ...user, avatar_url: data.avatarUrl };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        window.location.reload();
      }, 'image/png');

    } catch (err) {
      addToast(err.message || 'Failed to upload avatar', 'error');
      setUploadingAvatar(false);
    }
  };

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/matches/leaderboard', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch leaderboard');
        setLeaderboard(data.leaderboard || []);
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [token, addToast]);

  const handleExportStats = async () => {
    if (!statsRef.current) return;
    setExporting(true);
    addToast('Generating personal stat card...', 'info');

    try {
      const canvas = await html2canvas(statsRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false
      });

      const image = canvas.toDataURL('image/png', 1.0);
      const fileName = `${user.username}_cube_stats.png`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = image;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast('Stats saved successfully!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to generate image', 'error');
    } finally {
      setExporting(false);
    }
  };

  const myStats = leaderboard.find(p => p.id === user.id) || {
    tournaments: 0, match_wins: 0, match_losses: 0, match_draws: 0,
    game_wins: 0, game_losses: 0, matchWinRate: 0, gameWinRate: 0
  };

  const myRank = leaderboard.findIndex(p => p.id === user.id) + 1;

  if (loading) return <div className="row justify-center py-8"><div className="spinner" /></div>;

  return (
    <div className="col gap-8">
      
      {/* Personal Stats Export Card */}
      <div className="col gap-4 align-center w-full">
        <div className="col align-center text-center w-full" style={{ maxWidth: '700px', gap: '0.5rem' }}>
          <h2>My Performance</h2>
          <button className="btn btn-secondary" onClick={handleExportStats} disabled={exporting}>
            {exporting ? 'Generating...' : 'Export Stat Card'}
          </button>
        </div>

        <div 
          ref={statsRef}
          className="glass-box col align-center" 
          style={{ 
            width: '100%', 
            maxWidth: '700px', 
            background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* MTG Motif Top Border */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '6px', background: 'var(--primary)' }} />
          
          <div className="row align-center gap-6 w-full" style={{ marginBottom: '2rem' }}>
            <div 
              onClick={() => setShowSourceModal(true)}
              style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', cursor: 'pointer', position: 'relative' }}
              title="Click to edit Avatar"
            >
              <input type="file" accept="image/*" ref={fileInputRef} onChange={onSelectFile} style={{ display: 'none' }} />
              {user.avatar_url ? <img src={user.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : user.display_name?.charAt(0).toUpperCase()}
            </div>
            <div className="col">
              <h2 style={{ margin: 0, color: 'var(--primary)' }}>{user.display_name}</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                {myRank > 0 ? `Global Rank: #${myRank}` : 'Unranked'}
              </p>
            </div>
            
            <div className="col ml-auto text-center" style={{ padding: '0 2rem' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{myStats.tournaments}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Events</div>
            </div>
          </div>

          <div className="w-full text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="col flex-1">
              <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--info)' }}>
                {myStats.match_wins}-{myStats.match_losses}{myStats.match_draws > 0 ? `-${myStats.match_draws}` : ''}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>MATCH RECORD</div>
            </div>
            
            <div className="col flex-1">
              <div style={{ fontSize: '1.8rem', fontWeight: 600 }}>
                {(myStats.matchWinRate * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>MATCH WIN RATE</div>
            </div>

            <div className="col flex-1">
              <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {myStats.game_wins}-{myStats.game_losses}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>GAME RECORD</div>
            </div>
            
            <div className="col flex-1">
              <div style={{ fontSize: '1.8rem', fontWeight: 600 }}>
                {(myStats.gameWinRate * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>GAME WIN RATE</div>
            </div>
          </div>

          {myStats.mostUsedCard && (
            <div className="w-full text-center mt-6 p-4" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>MOST DRAFTED CARD</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--primary)' }}>{myStats.mostUsedCard}</div>
            </div>
          )}

          <div className="w-full text-center mt-6" style={{ fontSize: '0.7rem', opacity: 0.4 }}>
            Powered by Cube Stats v2
          </div>
        </div>
      </div>

      {/* Global Leaderboard Table */}
      <hr style={{ border: 0, borderBottom: '1px dashed var(--surface-border)', margin: '1rem 0' }} />

      <div>
        <h2>Global Hall of Fame</h2>
        <div className="glass-box" style={{ overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem' }}>Rank</th>
                <th style={{ padding: '1rem' }}>Player</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Events</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Matches</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Win %</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((p, idx) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                  <td style={{ padding: '1rem', fontWeight: 700, color: idx < 3 ? 'var(--primary)' : 'inherit' }}>
                    #{idx + 1}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                      {p.avatar_url ? <img src={p.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : p.display_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {p.display_name} {p.id === user.id && <span className="badge badge-info ml-2" style={{ display: 'inline-block' }}>You</span>}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {p.tournaments}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {p.match_wins}-{p.match_losses}{p.match_draws > 0 ? `-${p.match_draws}` : ''}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                    {(p.matchWinRate * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center" style={{ padding: '2rem', opacity: 0.5 }}>No logged matches yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Source Selection Modal */}
      {showSourceModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="glass-box col gap-4" style={{ maxWidth: '90%', width: '400px' }}>
            <h3 className="mb-2">Update Avatar</h3>
            <button className="btn btn-primary w-full py-4 text-lg" onClick={() => { setShowSourceModal(false); fileInputRef.current?.click(); }}>
              Upload Custom Image
            </button>
            <button className="btn btn-secondary w-full py-4 text-lg" onClick={openGalleryModal}>
              Choose from Cube Gallery
            </button>
            <button className="btn btn-ghost mt-4" onClick={() => setShowSourceModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Cube Gallery Modal */}
      {showGalleryModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="glass-box col" style={{ maxWidth: '90%', width: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="row justify-between align-center mb-4">
              <h3>Select a Card</h3>
              <button className="btn btn-ghost" onClick={() => setShowGalleryModal(false)}>Close</button>
            </div>
            <input 
              type="text" 
              className="input mb-4 w-full" 
              placeholder="Search cards..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              {loadingCards ? (
                <div className="spinner mx-auto mt-8" />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
                  {cubeCards.filter(c => c.card_name.toLowerCase().includes(searchQuery.toLowerCase())).map(card => {
                    let displayUrl = card.art_crop_url;
                    if (card.override_image_url) {
                      displayUrl = card.override_image_url;
                      if (displayUrl.includes('scryfall.io/normal/')) displayUrl = displayUrl.replace('/normal/', '/art_crop/');
                      else if (displayUrl.includes('scryfall.io/large/')) displayUrl = displayUrl.replace('/large/', '/art_crop/');
                      else if (displayUrl.includes('api.scryfall.com/cards/named')) displayUrl += '&version=art_crop';
                    }
                    return (
                      <div 
                        key={card.id} 
                        className="glass-box"
                        style={{ padding: '0.5rem', textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => {
                          setUpImg(displayUrl);
                          setShowGalleryModal(false);
                          setShowCropModal(true);
                        }}
                      >
                        <img 
                          src={displayUrl} 
                          alt={card.card_name} 
                          style={{ 
                            width: '100%', 
                            borderRadius: 'inherit', 
                            display: 'block',
                            transition: 'transform 0.2s' 
                          }} 
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                          crossOrigin="anonymous" 
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              {!loadingCards && cubeCards.length === 0 && (
                <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '2rem' }}>No cards found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Avatar Crop Modal */}
      {showCropModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="glass-box" style={{ maxWidth: '90%', width: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 className="mb-4">Crop Avatar</h3>
            {upImg ? (
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                onComplete={c => setCompletedCrop(c)}
                aspect={1}
                circularCrop
              >
                <img src={upImg} onLoad={onImageLoad} ref={imgRef} style={{ maxHeight: '50vh' }} crossOrigin="anonymous" />
              </ReactCrop>
            ) : <div className="spinner" />}
            
            <div className="row gap-4 mt-6">
              <button className="btn btn-ghost flex-1" onClick={() => { setShowCropModal(false); setUpImg(null); if (fileInputRef.current) fileInputRef.current.value=''; }} disabled={uploadingAvatar}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={handleUploadAvatar} disabled={uploadingAvatar}>
                {uploadingAvatar ? 'Uploading...' : 'Save Avatar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}