import React, { useState, useEffect } from 'react';
import { useToast } from '../components/ToastProvider';

export default function CubeList() {
  const [cards, setCards] = useState([]);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('current');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Settings & Overrides State
  const [editingVersionName, setEditingVersionName] = useState('');
  const [overrides, setOverrides] = useState({});
  const basicLandNames = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMethod, setSortMethod] = useState('name');
  const [cardStats, setCardStats] = useState({});

  // Card Edit State
  const [editingCard, setEditingCard] = useState(null);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [scryfallLoading, setScryfallLoading] = useState(false);
  const [scryfallPrints, setScryfallPrints] = useState([]);
  
  // New Version Form State
  const [updateMode, setUpdateMode] = useState('add_replace');
  
  const loadPending = (key) => {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  };
  const [pendingAdds, setPendingAdds] = useState(loadPending('cubePendingAdds'));
  const [pendingRemoves, setPendingRemoves] = useState(loadPending('cubePendingRemoves'));
  const [addInput, setAddInput] = useState('');
  const [removeInput, setRemoveInput] = useState('');
  const [addingCard, setAddingCard] = useState(false);

  const handleAddCard = async () => {
    const input = addInput.trim();
    if (!input) return;

    setAddingCard(true);
    try {
      const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(input)}`);
      const data = await res.json();

      if (data.object === 'error') {
        throw new Error(`Card not found: ${input}`);
      }

      const matchedName = data.name;
      
      if (!pendingAdds.includes(matchedName)) {
        setPendingAdds(prev => [...prev, matchedName]);
        if (input.toLowerCase() !== matchedName.toLowerCase()) {
          addToast(`Matched "${input}" to "${matchedName}"`, 'info');
        }
      } else {
        addToast(`"${matchedName}" is already pending to be added.`, 'info');
      }
      setAddInput('');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAddingCard(false);
    }
  };
  
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCardList, setNewCardList] = useState('');

  const { addToast } = useToast();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isHost = user.role === 'host';

  useEffect(() => {
    localStorage.setItem('cubePendingAdds', JSON.stringify(pendingAdds));
    localStorage.setItem('cubePendingRemoves', JSON.stringify(pendingRemoves));
  }, [pendingAdds, pendingRemoves]);

  useEffect(() => {
    fetchVersions();
    const savedVer = localStorage.getItem('selectedCubeVersion') || 'current';
    fetchCubeData(savedVer);
  }, []);

  const fetchVersions = async () => {
    try {
      const res = await fetch('/api/cube/versions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setVersions(data.versions || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCubeData = async (versionId) => {
    setLoading(true);
    try {
      const endpoint = versionId === 'current' ? '/api/cube/current' : `/api/cube/version/${versionId}`;
      const res = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch cube');
      
      setCards(data.cards || []);
      if (data.version) {
        const verId = data.version.id.toString();
        setSelectedVersion(verId);
        localStorage.setItem('selectedCubeVersion', verId);
        
        // Fetch stats
        try {
          const statsRes = await fetch(`/api/cube/version/${verId}/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const statsData = await statsRes.json();
          if (statsRes.ok) {
            setCardStats(statsData.stats || {});
          }
        } catch (err) {
          console.error('Failed to load stats', err);
        }
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVersionChange = (e) => {
    const val = e.target.value;
    setSelectedVersion(val);
    localStorage.setItem('selectedCubeVersion', val);
    fetchCubeData(val);
  };

  const handleCreateVersion = async (e) => {
    e.preventDefault();
    setCreating(true);

    const payload = {
      name: newName,
      startDate: newDate,
    };

    if (updateMode === 'full_import') {
      payload.cardNames = newCardList.split('\n').map(l => l.trim()).filter(Boolean);
    } else {
      payload.adds = pendingAdds;
      payload.removes = pendingRemoves;
    }

    try {
      const res = await fetch('/api/cube/version', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update cube');

      addToast('Cube updated successfully!', 'success');
      setShowModal(false);
      setNewName('');
      setNewCardList('');
      setPendingAdds([]);
      setPendingRemoves([]);
      localStorage.removeItem('cubePendingAdds');
      localStorage.removeItem('cubePendingRemoves');
      
      // Refresh data
      fetchVersions();
      fetchCubeData('current');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const fetchScryfallPrints = async (cardName) => {
    setScryfallLoading(true);
    setScryfallPrints([]);
    try {
      const res = await fetch(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released&dir=desc`);
      const data = await res.json();
      if (data.data) {
        const prints = data.data.map(c => {
          if (c.image_uris) return c.image_uris.normal;
          if (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) return c.card_faces[0].image_uris.normal;
          return null;
        }).filter(Boolean);
        setScryfallPrints([...new Set(prints)]);
      }
    } catch (err) {
      console.error('Failed to fetch Scryfall prints', err);
    } finally {
      setScryfallLoading(false);
    }
  };

  const fetchOverrides = async () => {
    try {
      const res = await fetch(`/api/cube/overrides?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setOverrides(data.overrides || {});
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportText = () => {
    const counts = {};
    filteredCards.forEach(c => {
      counts[c.card_name] = (counts[c.card_name] || 0) + 1;
    });
    const exportStr = Object.entries(counts).map(([name, count]) => `${count} ${name}`).join('\n');
    const blob = new Blob([exportStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const versionObj = versions.find(v => v.id.toString() === selectedVersion);
    const vname = versionObj ? versionObj.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'cube';
    a.download = `${vname}_list.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCopy = () => {
    const counts = {};
    filteredCards.forEach(c => {
      counts[c.card_name] = (counts[c.card_name] || 0) + 1;
    });
    const exportStr = Object.entries(counts).map(([name, count]) => `${count} ${name}`).join('\n');
    navigator.clipboard.writeText(exportStr);
    addToast('Cube list copied to clipboard!', 'success');
  };

  const handleOpenSettings = () => {
    const currentVer = versions.find(v => v.id.toString() === selectedVersion);
    setEditingVersionName(currentVer ? currentVer.name : '');
    fetchOverrides();
    setShowSettingsModal(true);
  };

  const handleUpdateVersionName = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/cube/version/${selectedVersion}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: editingVersionName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update version');
      addToast('Version updated successfully!', 'success');
      fetchVersions();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteVersion = async () => {
    if (!window.confirm('Are you sure you want to delete this cube version? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/cube/version/${selectedVersion}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete version');
      addToast('Version deleted successfully!', 'success');
      setShowSettingsModal(false);
      localStorage.removeItem('selectedCubeVersion');
      await fetchVersions();
      await fetchCubeData('current');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEditCardSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/cube/image-override', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cardName: editingCard.card_name,
          imageUrl: newImageUrl
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save override');

      addToast('Card artwork overwritten successfully!', 'success');
      setEditingCard(null);
      await fetchCubeData(selectedVersion); // refresh
      await fetchOverrides(); // unconditionally refresh overrides

    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const filteredCards = cards.filter(card => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      card.card_name.toLowerCase().includes(term) ||
      (card.type_line && card.type_line.toLowerCase().includes(term))
    );
  }).sort((a, b) => {
    if (sortMethod === 'name') return a.card_name.localeCompare(b.card_name);
    if (sortMethod === 'mv') return (a.cmc || 0) - (b.cmc || 0) || a.card_name.localeCompare(b.card_name);
    
    const statsA = cardStats[a.card_name] || { inclusionRate: 0, winRate: 0 };
    const statsB = cardStats[b.card_name] || { inclusionRate: 0, winRate: 0 };
    
    if (sortMethod === 'inclusion') return parseFloat(statsB.inclusionRate) - parseFloat(statsA.inclusionRate) || a.card_name.localeCompare(b.card_name);
    if (sortMethod === 'winrate') return parseFloat(statsB.winRate) - parseFloat(statsA.winRate) || a.card_name.localeCompare(b.card_name);
    
    return 0;
  });

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Cube List Gallery</h2>

        <div className="page-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Search cards..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ padding: '0.6rem 1rem', minWidth: '200px' }}
          />

          <select
            className="input-field"
            value={sortMethod}
            onChange={(e) => setSortMethod(e.target.value)}
            style={{ padding: '0.6rem 1rem' }}
          >
            <option value="name">Sort by Name</option>
            <option value="mv">Sort by Mana Value</option>
            <option value="inclusion">Sort by Inclusion %</option>
            <option value="winrate">Sort by Win Rate %</option>
          </select>

          <select 
            className="input-field" 
            value={selectedVersion} 
            onChange={handleVersionChange}
            style={{ padding: '0.6rem 1rem' }}
          >
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.card_count} cards)
              </option>
            ))}
            {versions.length === 0 && <option value="current">Current Version</option>}
          </select>

          <div className="row gap-2">
            <button className="btn btn-secondary" onClick={handleExportCopy} disabled={filteredCards.length === 0}>
              Copy List
            </button>
            <button className="btn btn-secondary" onClick={handleExportText} disabled={filteredCards.length === 0}>
              Export .txt
            </button>
          </div>

          {isHost && (
            <div className="row gap-2">
              <button className="btn btn-secondary" onClick={handleOpenSettings} disabled={!selectedVersion}>
                Cube Settings
              </button>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                Update Cube
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="badge badge-info mb-6">{filteredCards.length} Cards Loaded</div>

      {loading ? (
        <div className="row justify-center" style={{ height: '200px' }}>
          <div className="spinner" />
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="glass-box text-center" style={{ padding: '4rem 0', marginTop: '2rem' }}>
          <h3 className="text-muted">No cards found matching your search.</h3>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '1rem'
        }}>
          {filteredCards.map(card => {
            const stats = cardStats[card.card_name];
            return (
              <div key={card.id} className="glass-box" style={{ padding: '0.5rem', textAlign: 'center' }}>
                <img 
                  src={card.override_image_url || card.image_url || 'https://cards.scryfall.io/large/back/a/a/aae0b138-03fd-4418-868f-aa822d665b1c.jpg'} 
                  alt={card.card_name} 
                  className={isHost ? 'editable-card' : ''}
                  onClick={() => {
                    if (isHost) {
                      setEditingCard(card);
                      setNewImageUrl(card.override_image_url || card.image_url || '');
                      fetchScryfallPrints(card.card_name);
                    }
                  }}
                  style={{ 
                    width: '100%', 
                    borderRadius: 'inherit', 
                    display: 'block', 
                    cursor: isHost ? 'pointer' : 'default',
                    transition: 'transform 0.2s',
                    ':hover': isHost ? { transform: 'scale(1.05)' } : {}
                  }}
                  loading="lazy"
                />
                <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {card.card_name}
                </p>
                {stats && (
                  <div className="row justify-center gap-4 mt-2" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <div title="Inclusion Rate (Maindeck)"><strong style={{ color: 'var(--primary)' }}>INC:</strong> {stats.inclusionRate}%</div>
                    <div title="Game Win Rate (When Maindecked)"><strong style={{ color: 'var(--success)' }}>WR:</strong> {stats.winRate}%</div>
                  </div>
                )}
              </div>
            );
          })}          {cards.length === 0 && <p>No cards found in this version.</p>}
        </div>
      )}

      {/* Host Modal for Creating a new Version */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-box" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="row justify-between align-center mb-4">
              <h3 style={{ margin: 0 }}>Update Cube Version</h3>
              <button 
                className="btn btn-ghost" 
                onClick={() => setShowModal(false)}
                style={{ padding: '0.2rem 0.5rem' }}
              >✕</button>
            </div>

            <div className="row gap-2 mb-4">
              <button 
                className={`btn ${updateMode === 'add_replace' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setUpdateMode('add_replace')}
              >Add/Replace Card</button>
              <button 
                className={`btn ${updateMode === 'full_import' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setUpdateMode('full_import')}
              >Full Import</button>
            </div>

            <form onSubmit={handleCreateVersion}>
              <div className="form-group">
                <label>Version Name</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  required 
                  placeholder="e.g. Lorwyn Eclipsed"
                />
              </div>

              <div className="form-group">
                <label>Start Date</label>
                <input 
                  type="date" 
                  value={newDate} 
                  onChange={e => setNewDate(e.target.value)} 
                  required 
                />
              </div>

              {updateMode === 'full_import' ? (
                <div className="form-group">
                  <label>Card List (One per line)</label>
                  <textarea 
                    rows="10" 
                    value={newCardList} 
                    onChange={e => setNewCardList(e.target.value)}
                    required
                    placeholder="Lightning Bolt\nBrainstorm\nCounterspell"
                  />
                </div>
              ) : (
                <>
                  <div className="form-group row gap-2 align-end">
                    <div style={{ flex: 1 }}>
                      <label>Add Card Name</label>
                      <input 
                        type="text" 
                        value={addInput} 
                        onChange={e => setAddInput(e.target.value)} 
                        placeholder="e.g. Black Lotus"
                        disabled={addingCard}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCard();
                          }
                        }}
                      />
                    </div>
                    <button type="button" className="btn btn-secondary" disabled={addingCard} onClick={handleAddCard}>
                      {addingCard ? '...' : 'Add'}
                    </button>
                  </div>
                  <div className="form-group row gap-2 align-end">
                    <div style={{ flex: 1 }}>
                      <label>Remove Card</label>
                      <input 
                        type="text" 
                        list="current-cube-cards"
                        value={removeInput} 
                        onChange={e => setRemoveInput(e.target.value)} 
                        placeholder="Type to search current cube..."
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (removeInput.trim()) {
                              setPendingRemoves([...pendingRemoves, removeInput.trim()]);
                              setRemoveInput('');
                            }
                          }
                        }}
                      />
                      <datalist id="current-cube-cards">
                        {cards.map(c => <option key={c.id} value={c.card_name} />)}
                      </datalist>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      if (removeInput.trim()) {
                        setPendingRemoves([...pendingRemoves, removeInput.trim()]);
                        setRemoveInput('');
                      }
                    }}>Remove</button>
                  </div>

                  {(pendingAdds.length > 0 || pendingRemoves.length > 0) && (
                    <div className="glass-box mb-4" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0' }}>Pending Changes</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                        {pendingAdds.map((c, i) => (
                          <li key={'add-'+i} style={{ color: 'var(--success)', marginBottom: '0.2rem' }}>
                            + {c} <button type="button" className="btn btn-ghost text-danger" style={{ padding: '0 4px', height: 'auto', minHeight: 0 }} onClick={() => setPendingAdds(pendingAdds.filter((_, idx) => idx !== i))}>✕</button>
                          </li>
                        ))}
                        {pendingRemoves.map((c, i) => (
                          <li key={'rem-'+i} style={{ color: 'var(--danger)', marginBottom: '0.2rem' }}>
                            - {c} <button type="button" className="btn btn-ghost text-danger" style={{ padding: '0 4px', height: 'auto', minHeight: 0 }} onClick={() => setPendingRemoves(pendingRemoves.filter((_, idx) => idx !== i))}>✕</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <div className="row gap-2 mt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ flex: 1 }}>
                  {creating ? 'Creating & Fetching Artwork...' : 'Update Cube'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Host Modal for Editing Card Artwork */}
      {editingCard && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-box" style={{ width: '90%', maxWidth: '400px' }}>
            <div className="row justify-between align-center mb-4">
              <h3 style={{ margin: 0 }}>Edit Artwork: {editingCard.card_name}</h3>
              <button 
                className="btn btn-ghost" 
                onClick={() => setEditingCard(null)}
                style={{ padding: '0.2rem 0.5rem' }}
              >✕</button>
            </div>

            {scryfallLoading ? (
               <div className="row justify-center py-4"><div className="spinner" /></div>
            ) : scryfallPrints.length > 0 ? (
               <div style={{
                 display: 'grid',
                 gridTemplateColumns: 'repeat(3, 1fr)',
                 gap: '0.5rem',
                 maxHeight: '400px',
                 overflowY: 'auto',
                 marginBottom: '1rem',
                 padding: '0.5rem',
                 background: 'rgba(0,0,0,0.2)',
                 borderRadius: '8px'
               }}>
                 {scryfallPrints.map((url, i) => (
                   <img 
                     key={i} 
                     src={url} 
                     alt="Printing option" 
                     onClick={() => setNewImageUrl(url)}
                     style={{ 
                       width: '100%', 
                       cursor: 'pointer',
                       borderRadius: '4px',
                       border: newImageUrl === url ? '3px solid var(--primary-color)' : '3px solid transparent'
                     }} 
                   />
                 ))}
               </div>
            ) : null}

            <form onSubmit={handleEditCardSubmit}>
              <div className="form-group">
                <label>Custom Image URL (Or click a version above)</label>
                <input 
                  type="url" 
                  value={newImageUrl} 
                  onChange={e => setNewImageUrl(e.target.value)} 
                  required 
                  placeholder="https://cards.scryfall.io/..."
                />
              </div>

              <div className="row gap-2 mt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingCard(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Override</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Host Modal for Cube Settings */}
      {showSettingsModal && !editingCard && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-box" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="row justify-between align-center mb-4">
              <h3 style={{ margin: 0 }}>Cube Settings</h3>
              <button 
                className="btn btn-ghost" 
                onClick={() => setShowSettingsModal(false)}
              >✕</button>
            </div>

            <form onSubmit={handleUpdateVersionName} className="mb-6">
              <div className="form-group row gap-2 align-end">
                <div style={{ flex: 1 }}>
                  <label>Edit Current Version Name</label>
                  <input 
                    type="text" 
                    value={editingVersionName} 
                    onChange={e => setEditingVersionName(e.target.value)} 
                    required 
                  />
                </div>
                <button type="submit" className="btn btn-primary">Rename</button>
              </div>
            </form>

            <div className="mb-6" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
               <h4 style={{ color: 'var(--danger)', margin: '0 0 0.5rem 0' }}>Danger Zone</h4>
               <button type="button" className="btn" style={{ width: '100%', background: 'rgba(255,50,50,0.2)', color: 'var(--danger)' }} onClick={handleDeleteVersion}>Delete This Version</button>
            </div>

            <h4 className="mb-2">Global Basic Land Artwork</h4>
            <p className="text-secondary mb-4" style={{ fontSize: '0.9rem' }}>
              Select the default artwork for basic lands. This will apply to all decklists.
            </p>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '1rem'
            }}>
              {basicLandNames.map(landName => {
                const defaultUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(landName)}&format=image`;
                const displayUrl = overrides[landName] || defaultUrl;

                return (
                  <div key={landName} className="glass-box" style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <img 
                      src={displayUrl} 
                      alt={landName} 
                      className="editable-card"
                      onClick={() => {
                        setEditingCard({ card_name: landName, override_image_url: overrides[landName] });
                        setNewImageUrl(displayUrl);
                        fetchScryfallPrints(landName);
                      }}
                      style={{ 
                        width: '100%', 
                        borderRadius: 'inherit', 
                        display: 'block',
                        cursor: 'pointer',
                        transition: 'transform 0.2s'
                      }}
                      loading="lazy"
                    />
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {landName}
                    </p>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
