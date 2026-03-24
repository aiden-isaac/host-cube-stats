import React, { useState, useEffect } from 'react';
import { useToast } from '../ToastProvider';

export default function Deckbuilder({ tournament, players, isHost, user }) {
  const { addToast } = useToast();
  const [deckTitle, setDeckTitle] = useState(`${user.username}'s Deck`);
  const [decklistText, setDecklistText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // Suggestions state
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [basicLands, setBasicLands] = useState(null);
  const [tokens, setTokens] = useState([]);

  const token = localStorage.getItem('token');
  const myPlayer = players.find(p => p.user_id === user.id);
  const hasSubmitted = myPlayer?.decklist_submitted === 1;

  const handleSuggestBasics = async () => {
    if (!decklistText.trim()) {
      addToast('Please paste your drafted cards first.', 'warning');
      return;
    }
    setSuggestionsLoading(true);
    try {
      // 1. Parse decklist text
      const lines = decklistText.split('\n');
      const maindeck = [];
      let inSideboard = false;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.toLowerCase() === 'sideboard') {
          inSideboard = true;
          continue;
        }
        if (!inSideboard) {
          const match = trimmed.match(/^(\d+)x?\s+(.+)$/i);
          if (match) {
            maindeck.push({ card_name: match[2], quantity: parseInt(match[1]) });
          } else {
            maindeck.push({ card_name: trimmed, quantity: 1 });
          }
        }
      }

      if (maindeck.length === 0) return;

      const totalMaindeckCount = maindeck.reduce((sum, c) => sum + c.quantity, 0);
      const landsNeeded = Math.max(0, 40 - totalMaindeckCount);

      // 2. Fetch card data from Scryfall
      const scryfallPayload = {
        identifiers: maindeck.map(c => ({ name: c.card_name }))
      };

      const scryfallRes = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scryfallPayload)
      });

      const scryfallData = await scryfallRes.json();
      if (!scryfallData.data) return;

      // 3. Calculate Devotion / Basic Lands
      const devotion = { W: 0, U: 0, B: 0, R: 0, G: 0 };
      const tokenMap = new Map();

      for (const card of scryfallData.data) {
        const deckCard = maindeck.find(c => c.card_name.toLowerCase() === card.name.toLowerCase());
        const qty = deckCard ? deckCard.quantity : 1;

        // Count pips
        const manaCost = card.mana_cost || '';
        const pips = manaCost.match(/\{([WUBRG])\}/g) || [];
        pips.forEach(pip => {
          const color = pip.replace(/[{}]/g, '');
          if (devotion[color] !== undefined) devotion[color] += qty;
        });

        // Collect Tokens
        if (card.all_parts) {
          card.all_parts.forEach(part => {
            if (part.component === 'token') {
              const tokenKey = part.name;
              if (!tokenMap.has(tokenKey)) {
                tokenMap.set(tokenKey, { name: part.name, uri: part.uri });
              }
            }
          });
        }
      }

      // Calculate Basic Lands distribution
      let suggestedLands = { Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 };
      const totalPips = Object.values(devotion).reduce((a, b) => a + b, 0);

      if (totalPips > 0 && landsNeeded > 0) {
        suggestedLands.Plains = Math.round((devotion.W / totalPips) * landsNeeded);
        suggestedLands.Island = Math.round((devotion.U / totalPips) * landsNeeded);
        suggestedLands.Swamp = Math.round((devotion.B / totalPips) * landsNeeded);
        suggestedLands.Mountain = Math.round((devotion.R / totalPips) * landsNeeded);

        const sumSoFar = suggestedLands.Plains + suggestedLands.Island + suggestedLands.Swamp + suggestedLands.Mountain;
        suggestedLands.Forest = Math.max(0, landsNeeded - sumSoFar);
      }

      // Fetch token images from Scryfall using their URIs
      const fetchedTokens = [];
      for (const token of tokenMap.values()) {
        if (token.uri) {
          try {
            const tokenRes = await fetch(token.uri);
            const tokenData = await tokenRes.json();
            if (tokenData.image_uris) {
               fetchedTokens.push({ name: tokenData.name, imageUrl: tokenData.image_uris.normal });
            } else if (tokenData.card_faces && tokenData.card_faces[0].image_uris) {
               fetchedTokens.push({ name: tokenData.name, imageUrl: tokenData.card_faces[0].image_uris.normal });
            }
          } catch (e) {
             console.error("Failed to fetch token image", e);
          }
        }
      }
      setTokens(fetchedTokens);
      
      // Auto-add basics to text if landsNeeded > 0
      if (landsNeeded > 0) {
        let basicsText = "";
        if (suggestedLands.Plains > 0) basicsText += `${suggestedLands.Plains} Plains\n`;
        if (suggestedLands.Island > 0) basicsText += `${suggestedLands.Island} Island\n`;
        if (suggestedLands.Swamp > 0) basicsText += `${suggestedLands.Swamp} Swamp\n`;
        if (suggestedLands.Mountain > 0) basicsText += `${suggestedLands.Mountain} Mountain\n`;
        if (suggestedLands.Forest > 0) basicsText += `${suggestedLands.Forest} Forest\n`;
        
        let newText = decklistText.trim();
        
        if (newText.toLowerCase().includes("sideboard")) {
           const parts = newText.split(/sideboard/i);
           newText = parts[0].trim() + "\n" + basicsText.trim() + "\n\nSideboard\n" + parts[1].trim();
        } else {
           newText = newText + "\n" + basicsText.trim();
        }
        
        setDecklistText(newText);
        addToast(`Added ${landsNeeded} suggested basic lands.`, 'success');
      } else {
        addToast("Deck is already 40 or more cards. Generated tokens.", 'info');
      }

    } catch (err) {
      console.error('Failed to generate suggestions:', err);
      addToast('Failed to parse and fetch suggestions.', 'error');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleSubmitDeck = async (e) => {
    e.preventDefault();    setSubmitting(true);
    try {
      const res = await fetch(`/api/decklists/tournaments/${tournament.id}/decklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ deckTitle, decklistText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit decklist');
      
      addToast(`Deck submitted! (${data.cardCount} main / ${data.sideboardCount} side)`, 'success');
      // The socket 'tournament:refresh' will naturally update the component to show standard lobby.
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartMatches = async () => {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'playing' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start matches');
      
      addToast('Tournament has begun!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
      setAdvancing(false);
    }
  };

  return (
    <div className="glass-box col gap-6" style={{ minHeight: '70vh' }}>
      <div className="text-center">
        <h2 className="text-gradient">Deckbuilding Phase</h2>
        <p>Build your deck from your drafted pool and submit the final list.</p>
      </div>

      <div className="row justify-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '2rem' }}>
        
        {/* Left Side: Submission Form */}
        <div style={{ flex: '1 1 300px' }}>
          {hasSubmitted ? (
            <div className="glass-box text-center col gap-4" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--success)' }}>
              <div>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                <h3>Deck Submitted!</h3>
                <p>Waiting for other players to finish...</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitDeck}>
              <div className="form-group">
                <label>Deck Name</label>
                <input 
                  type="text" 
                  value={deckTitle}
                  onChange={e => setDeckTitle(e.target.value)}
                  placeholder="e.g. Blue/Red Spells"
                  required
                />
              </div>

              <div className="form-group">
                <label>Decklist (MTGO / Arena Format)</label>
                <textarea 
                  rows={15} 
                  value={decklistText}
                  onChange={e => setDecklistText(e.target.value)}
                  placeholder="1x Black Lotus&#10;4x Lightning Bolt&#10;&#10;Sideboard&#10;1x Pyroblast"
                  required
                />
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>
                  Put sideboard cards beneath a "Sideboard" line.
                </p>
              </div>
              
              <div className="row gap-4 mb-4">
                <button type="button" className="btn btn-secondary w-full" onClick={handleSuggestBasics} disabled={suggestionsLoading}>
                  {suggestionsLoading ? 'Calculating...' : 'Suggest Basics & Find Tokens'}
                </button>
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Final Deck'}
              </button>
            </form>
          )}
          
          {tokens.length > 0 && (
            <div className="glass-box mt-6" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Tokens Needed</h4>
              <div className="row justify-center gap-4" style={{ flexWrap: 'wrap' }}>
                {tokens.map(token => (
                  <div key={token.name} className="col align-center text-center" style={{ width: '120px' }}>
                    <img 
                      src={token.imageUrl || 'https://cards.scryfall.io/large/back/a/a/aae0b138-03fd-4418-868f-aa822d665b1c.jpg'} 
                      alt={token.name} 
                      style={{ width: '100%', borderRadius: '4.75% / 3.5%', display: 'block', marginBottom: '0.5rem' }} 
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{token.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Player Status List & Host Controls */}
        <div style={{ flex: '1 1 300px', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
            Submission Status
          </h3>
          
          <div className="col gap-2 mb-6">
            {players.map(p => (
              <div key={p.id} className="row justify-between align-center" style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span>{p.display_name}</span>
                {p.decklist_submitted === 1 ? (
                  <span className="badge badge-success">Ready</span>
                ) : (
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>Building...</span>
                )}
              </div>
            ))}
          </div>

          {isHost && (
            <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                As Host, you can force advance the tournament even if not everyone has submitted.
              </p>
              <button 
                className="btn btn-primary w-full" 
                onClick={handleStartMatches}
                disabled={advancing}
              >
                {advancing ? 'Starting...' : 'Begin Round 1'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
