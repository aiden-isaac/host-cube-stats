import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '../components/ToastProvider';
import './CardScanner.css';

/**
 * CardScanner — Full-screen modal for photo-based decklist scanning.
 * 
 * Props:
 *   tournamentId: number — current tournament ID
 *   onComplete: (decklistText: string) => void — called with MTGO-format text on confirm
 *   onClose: () => void — called when modal is dismissed
 */
export default function CardScanner({ tournamentId, onComplete, onClose }) {
    const { addToast } = useToast();
    const token = localStorage.getItem('token');
    const fileInputRef = useRef(null);

    // States: idle → uploading → processing → review
    const [scanState, setScanState] = useState('idle');
    const [scanResult, setScanResult] = useState(null);

    // Review state
    const [editedMatches, setEditedMatches] = useState(new Map()); // id → { matchedName?, deleted? }
    const [manualAdds, setManualAdds] = useState([]);
    const [activeView, setActiveView] = useState('list'); // 'list' | 'image'

    // Manual add input
    const [manualInput, setManualInput] = useState('');
    const [autocompleteResults, setAutocompleteResults] = useState([]);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const debounceRef = useRef(null);

    // Full image view refs
    const imageRef = useRef(null);
    const canvasRef = useRef(null);

    // Handle file selection
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanState('uploading');

        try {
            const formData = new FormData();
            formData.append('photo', file);

            setScanState('processing');

            const res = await fetch('/api/scanner/scan', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Scan failed');

            setScanResult(data);
            setScanState('review');

            // Initialize edit state
            setEditedMatches(new Map());
            setManualAdds([]);

            if (data.matches.length === 0) {
                addToast('No cards detected. Try better lighting or a closer photo.', 'warning');
            } else {
                addToast(`Detected ${data.matches.length} cards in ${(data.stats.processingTimeMs / 1000).toFixed(1)}s`, 'success');
            }
        } catch (err) {
            console.error('Scan error:', err);
            addToast(err.message || 'Scan failed', 'error');
            setScanState('idle');
        }
    };

    // Edit a matched name
    const handleEditName = (id, newName) => {
        setEditedMatches(prev => {
            const next = new Map(prev);
            const existing = next.get(id) || {};
            next.set(id, { ...existing, matchedName: newName });
            return next;
        });
    };

    // Delete a row
    const handleDeleteRow = (id) => {
        setEditedMatches(prev => {
            const next = new Map(prev);
            const existing = next.get(id) || {};
            next.set(id, { ...existing, deleted: !existing.deleted });
            return next;
        });
    };

    // Manual add autocomplete (Scryfall)
    useEffect(() => {
        if (!manualInput || manualInput.length < 2) {
            setAutocompleteResults([]);
            setShowAutocomplete(false);
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(manualInput)}`
                );
                const data = await res.json();
                if (data.data) {
                    setAutocompleteResults(data.data.slice(0, 8));
                    setShowAutocomplete(true);
                }
            } catch (err) {
                // Silently fail autocomplete
            }
        }, 150);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [manualInput]);

    // Add a manual card
    const handleAddManual = (name) => {
        if (name && !manualAdds.includes(name)) {
            setManualAdds(prev => [...prev, name]);
            addToast(`Added: ${name}`, 'success');
        }
        setManualInput('');
        setShowAutocomplete(false);
    };

    // Remove a manual add
    const handleRemoveManual = (index) => {
        setManualAdds(prev => prev.filter((_, i) => i !== index));
    };

    // Draw bounding boxes on the full image view
    const drawBoundingBoxes = useCallback(() => {
        if (!canvasRef.current || !imageRef.current || !scanResult) return;

        const img = imageRef.current;
        const canvas = canvasRef.current;

        // Wait for image to load
        if (!img.naturalWidth) return;

        const scaleX = img.clientWidth / scanResult.imageWidth;
        const scaleY = img.clientHeight / scanResult.imageHeight;

        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw matched boxes
        for (const match of scanResult.matches) {
            const edit = editedMatches.get(match.id);
            if (edit?.deleted) continue;

            const color = match.confidence >= 70 ? '#10b981'
                : match.confidence >= 50 ? '#eab308'
                : '#ef4444';

            const { x, y, w, h } = match.bbox;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);

            // Semi-transparent fill
            ctx.fillStyle = color + '20';
            ctx.fillRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);

            // Label
            const label = edit?.matchedName || match.matchedName;
            ctx.font = '12px Inter, sans-serif';
            ctx.fillStyle = color;
            const textY = y * scaleY - 4;
            ctx.fillText(label, x * scaleX, textY > 12 ? textY : y * scaleY + h * scaleY + 14);
        }

        // Draw unmatched boxes (red)
        for (const um of scanResult.unmatched) {
            if (um.reason === 'keyword_blocklist' || um.reason === 'noise_pattern' || um.reason === 'too_short') continue;
            const { x, y, w, h } = um.bbox;
            ctx.strokeStyle = '#ef444480';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
            ctx.setLineDash([]);
        }
    }, [scanResult, editedMatches]);

    // Redraw boxes when switching to image view or when edits change
    useEffect(() => {
        if (activeView === 'image') {
            // Small delay for paint
            const timer = setTimeout(drawBoundingBoxes, 100);
            return () => clearTimeout(timer);
        }
    }, [activeView, drawBoundingBoxes]);

    // Build final decklist text
    const buildDecklistText = () => {
        const cardCounts = new Map(); // name → count

        // Add matched cards (non-deleted)
        if (scanResult) {
            for (const match of scanResult.matches) {
                const edit = editedMatches.get(match.id);
                if (edit?.deleted) continue;

                const name = edit?.matchedName || match.matchedName;
                if (name) {
                    cardCounts.set(name, (cardCounts.get(name) || 0) + 1);
                }
            }
        }

        // Add manual adds
        for (const name of manualAdds) {
            cardCounts.set(name, (cardCounts.get(name) || 0) + 1);
        }

        // Build MTGO-format text
        return Array.from(cardCounts.entries())
            .map(([name, count]) => `${count} ${name}`)
            .join('\n');
    };

    const totalCards = () => {
        let count = 0;
        if (scanResult) {
            for (const match of scanResult.matches) {
                const edit = editedMatches.get(match.id);
                if (!edit?.deleted) count++;
            }
        }
        count += manualAdds.length;
        return count;
    };

    // Confirm and submit
    const handleConfirm = () => {
        const text = buildDecklistText();
        if (!text.trim()) {
            addToast('No cards in the decklist!', 'warning');
            return;
        }
        onComplete(text);
    };

    // Get confidence class for a match
    const getConfidenceClass = (confidence) => {
        if (confidence >= 70) return 'confidence-high';
        if (confidence >= 50) return 'confidence-medium';
        return 'confidence-low';
    };

    return (
        <div className="scanner-overlay">
            <div className="scanner-container">
                {/* Header */}
                <div className="scanner-header">
                    <h3>📷 Scan Deck from Photo</h3>
                    <button className="scanner-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Idle: Upload zone */}
                {scanState === 'idle' && (
                    <div
                        className="scanner-upload-zone"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="upload-icon">📸</div>
                        <div>
                            <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                Take a photo or select an image
                            </p>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                Fan your cards so only the <strong>name bar</strong> of each card is visible
                            </p>
                        </div>
                        <button className="btn btn-primary">Choose Photo</button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            onChange={handleFileSelect}
                        />
                    </div>
                )}

                {/* Processing */}
                {(scanState === 'uploading' || scanState === 'processing') && (
                    <div className="scanner-processing">
                        <div className="spinner" />
                        <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>
                            {scanState === 'uploading' ? 'Uploading photo...' : 'Scanning cards...'}
                        </p>
                        <p>This may take a few seconds on the Pi</p>
                    </div>
                )}

                {/* Review mode */}
                {scanState === 'review' && scanResult && (
                    <>
                        {/* Controls bar */}
                        <div className="row justify-between align-center gap-4 mb-4" style={{ flexWrap: 'wrap' }}>
                            <div className="scanner-view-toggle">
                                <button
                                    className={activeView === 'list' ? 'active' : ''}
                                    onClick={() => setActiveView('list')}
                                >
                                    Name List
                                </button>
                                <button
                                    className={activeView === 'image' ? 'active' : ''}
                                    onClick={() => setActiveView('image')}
                                >
                                    Full Image
                                </button>
                            </div>

                            <div className="scanner-stats">
                                <span><span className="stat-dot green" /> {scanResult.stats.matched} matched</span>
                                <span><span className="stat-dot yellow" /> {scanResult.stats.filtered} filtered</span>
                                <span><span className="stat-dot red" /> {scanResult.stats.unmatched} unmatched</span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                    {(scanResult.stats.processingTimeMs / 1000).toFixed(1)}s
                                </span>
                            </div>
                        </div>

                        {/* Name List View */}
                        {activeView === 'list' && (
                            <div className="scanner-name-list">
                                {scanResult.matches.map((match) => {
                                    const edit = editedMatches.get(match.id);
                                    const isDeleted = edit?.deleted;
                                    const displayName = edit?.matchedName ?? match.matchedName;

                                    return (
                                        <div
                                            key={match.id}
                                            className={`scanner-row ${getConfidenceClass(match.confidence)} ${isDeleted ? 'deleted' : ''}`}
                                        >
                                            {/* Crop image */}
                                            {match.cropDataUrl && (
                                                <img
                                                    className="scanner-crop"
                                                    src={match.cropDataUrl}
                                                    alt={match.ocrText}
                                                />
                                            )}

                                            {/* Editable name */}
                                            <div className="scanner-row-name">
                                                <input
                                                    type="text"
                                                    value={displayName}
                                                    onChange={(e) => handleEditName(match.id, e.target.value)}
                                                    disabled={isDeleted}
                                                />
                                            </div>

                                            {/* Meta: corrected badge + delete */}
                                            <div className="scanner-row-meta">
                                                {match.editDistance > 0 && (
                                                    <span className="corrected-badge" title={`OCR: "${match.ocrText}"`}>
                                                        corrected
                                                    </span>
                                                )}
                                                <button
                                                    className="scanner-delete-btn"
                                                    onClick={() => handleDeleteRow(match.id)}
                                                    title={isDeleted ? 'Restore' : 'Remove'}
                                                >
                                                    {isDeleted ? '↩' : '×'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Manual adds */}
                                {manualAdds.map((name, idx) => (
                                    <div key={`manual-${idx}`} className="scanner-row confidence-high">
                                        <div className="scanner-row-name">
                                            <input type="text" value={name} disabled />
                                        </div>
                                        <div className="scanner-row-meta">
                                            <span className="corrected-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                                                manual
                                            </span>
                                            <button
                                                className="scanner-delete-btn"
                                                onClick={() => handleRemoveManual(idx)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Manual add input */}
                                <div className="scanner-manual-add">
                                    <input
                                        type="text"
                                        value={manualInput}
                                        onChange={(e) => setManualInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && manualInput.trim()) {
                                                handleAddManual(manualInput.trim());
                                            }
                                        }}
                                        onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
                                        onFocus={() => autocompleteResults.length > 0 && setShowAutocomplete(true)}
                                        placeholder="Add card manually..."
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => handleAddManual(manualInput.trim())}
                                        disabled={!manualInput.trim()}
                                    >
                                        Add
                                    </button>

                                    {showAutocomplete && autocompleteResults.length > 0 && (
                                        <div className="scanner-autocomplete">
                                            {autocompleteResults.map((name) => (
                                                <div
                                                    key={name}
                                                    className="scanner-autocomplete-item"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        handleAddManual(name);
                                                    }}
                                                >
                                                    {name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Full Image View */}
                        {activeView === 'image' && (
                            <div className="scanner-image-view">
                                <img
                                    ref={imageRef}
                                    src={scanResult.imagePath}
                                    alt="Scanned cards"
                                    onLoad={drawBoundingBoxes}
                                    crossOrigin="anonymous"
                                />
                                <canvas ref={canvasRef} />
                            </div>
                        )}

                        {/* Footer */}
                        <div className="scanner-footer">
                            <button className="btn btn-secondary" onClick={() => {
                                setScanState('idle');
                                setScanResult(null);
                            }}>
                                Re-scan
                            </button>
                            <button className="btn btn-primary" onClick={handleConfirm}>
                                Confirm Decklist ({totalCards()} cards)
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
