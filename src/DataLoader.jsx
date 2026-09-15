import { useEffect, useState } from 'react';
import { loadAllLayers } from './utils/dataCache';
import { LAYERS_CONFIG } from './config/layers';

const LAYER_SIZES = {
  wiup:     2.3,
  sendiki1: 32,
  sendiki2: 26,
  sendiki3: 19,
};

const LAYER_ICONS = {
  kmz:   '📍',
  image: '🛰️',
};

export default function DataLoader({ onComplete }) {
  const [progress, setProgress] = useState({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const items = LAYERS_CONFIG.map(l => ({ id: l.id, url: l.url }));

    loadAllLayers(items, (prog) => setProgress({ ...prog }))
      .then(urlMap => {
        setDone(true);
        setTimeout(() => onComplete(urlMap), 100);
        // Auto-hide the popup 4 seconds after finishing
        setTimeout(() => setVisible(false), 4000);
      })
      .catch(err => {
        console.error('[DataLoader]', err);
        setError(err.message);
        setTimeout(() => onComplete({}), 100);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const layers = LAYERS_CONFIG;
  let totalMB = 0;
  let loadedMB = 0;
  layers.forEach(l => {
    const size = LAYER_SIZES[l.id] || 5;
    totalMB += size;
    const p = progress[l.id];
    loadedMB += size * (p != null ? p : 0);
  });
  const overallPct = Math.min(100, Math.round((loadedMB / totalMB) * 100));

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      width: '320px',
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      fontFamily: "'Inter', sans-serif",
      color: '#e2e8f0',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
    }}>
      {/* Header */}
      <div 
        style={{ 
          padding: '12px 16px', 
          borderBottom: minimized ? 'none' : '1px solid rgba(255,255,255,0.08)',
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          background: done ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
        }}
        onClick={() => setMinimized(!minimized)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {done ? (
            <span style={{ color: '#4ade80' }}>✅</span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" style={{ animation: 'spin 1.5s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
          )}
          <span style={{ fontSize: '13px', fontWeight: 600 }}>
            {done ? 'Semua data siap' : 'Mengunduh data...'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!done && <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 'bold' }}>{overallPct}%</span>}
          <span style={{ color: '#94a3b8', fontSize: '16px', lineHeight: 1 }}>{minimized ? '+' : '−'}</span>
        </div>
      </div>

      {/* Progress Track (Top border when minimized) */}
      {minimized && !done && (
        <div style={{ height: '2px', background: 'rgba(255,255,255,0.1)' }}>
          <div style={{ height: '100%', width: `${overallPct}%`, background: '#3b82f6', transition: 'width 0.3s' }} />
        </div>
      )}

      {/* Body */}
      {!minimized && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {layers.map(layer => {
            const p = progress[layer.id];
            const pct = p != null ? Math.round(p * 100) : 0;
            const isLoaded = pct === 100;
            const isLoading = p != null && pct < 100;

            return (
              <div key={layer.id} style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px',
                padding: '8px 10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isLoading ? '6px' : '0' }}>
                  <span style={{ fontSize: '12px', color: isLoaded ? '#cbd5e1' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                    {LAYER_ICONS[layer.type]} {layer.name}
                  </span>
                  <span style={{ fontSize: '11px', color: isLoaded ? '#4ade80' : '#64748b' }}>
                    {isLoaded ? 'Selesai' : p === null ? '⏳' : `${pct}%`}
                  </span>
                </div>
                {isLoading && (
                  <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6', transition: 'width 0.2s' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
