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

  useEffect(() => {
    if (hasSubmitted) {
      fetchDecklistAndGenerateSuggestions();
    }
  }, [hasSubmitted]);

  const fetchDecklistAndGenerateSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      // 1. Fetch user's decklist from the tournament
      const res = await fetch(`/api/decklists/tournaments/${tournament.id}/decklists`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch decklists');

      const myDeck = data.decklists.find(d => d.user_id === user.id);
      if (!myDeck || !myDeck.cards) return;

      // Filter maindeck only
      const maindeck = myDeck.cards.filter(c => !c.is_sideboard);
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
                tokenMap.set(tokenKey, { name: part.name, count: 0, uri: part.uri });
              }
              // Add enough tokens proportional to quantity (heuristically just 1 per qty, though cards can make multiple)
              tokenMap.get(tokenKey).count += qty; 
            }
          });
        }
      }

      // Calculate Basic Lands distribution
      const totalPips = Object.values(devotion).reduce((a, b) => a + b, 0);
      let suggestedLands = { Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 };

      if (totalPips > 0 && landsNeeded > 0) {
        let remainingLands = landsNeeded;

        suggestedLands.Plains = Math.round((devotion.W / totalPips) * landsNeeded);
        suggestedLands.Island = Math.round((devotion.U / totalPips) * landsNeeded);
        suggestedLands.Swamp = Math.round((devotion.B / totalPips) * landsNeeded);
        suggestedLands.Mountain = Math.round((devotion.R / totalPips) * landsNeeded);

        // Ensure exact amount by dumping remainder into Forest or adjusting
        const sumSoFar = suggestedLands.Plains + suggestedLands.Island + suggestedLands.Swamp + suggestedLands.Mountain;
        suggestedLands.Forest = Math.max(0, landsNeeded - sumSoFar);
      }

      setBasicLands(suggestedLands);
      setTokens(Array.from(tokenMap.values()));

    } catch (err) {
      console.error('Failed to generate suggestions:', err);
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

              {suggestionsLoading ? (
                <div className="spinner mt-4" style={{ margin: '0 auto' }} />
              ) : (
                <>
                  {basicLands && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                      <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Suggested Basic Lands</h4>
                      <div className="row justify-center gap-4" style={{ flexWrap: 'wrap' }}>
                        {Object.entries(basicLands).map(([land, count]) => count > 0 && (
                          <div key={land} className="badge" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
                            {count} {land}
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.6 }}>Based on your maindeck devotion.</p>
                    </div>
                  )}

                  {tokens.length > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                      <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tokens Needed</h4>
                      <div className="row justify-center gap-2" style={{ flexWrap: 'wrap' }}>
                        {tokens.map(token => (
                          <div key={token.name} className="badge badge-info" style={{ fontSize: '0.9rem' }}>
                            {token.count}x {token.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
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

              <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Final Deck'}
              </button>
            </form>
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
