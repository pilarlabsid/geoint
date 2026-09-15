import { useEffect, useState } from 'react';
import { loadAllLayers } from './utils/dataCache';
import { LAYERS_CONFIG } from './config/layers';

const LAYER_SIZES = {
  wiup:     2.3,   // MB estimate
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

  useEffect(() => {
    const items = LAYERS_CONFIG.map(l => ({ id: l.id, url: l.url }));

    loadAllLayers(items, (prog) => setProgress({ ...prog }))
      .then(urlMap => {
        setDone(true);
        setTimeout(() => onComplete(urlMap), 400); // brief pause so 100% is visible
      })
      .catch(err => {
        console.error('[DataLoader]', err);
        setError(err.message);
        // On error still continue — pass empty map so app can still render
        setTimeout(() => onComplete({}), 1500);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate aggregate progress
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
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      color: '#e2e8f0',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(rgba(59,130,246,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.8) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Logo */}
      <div style={{ position: 'relative', marginBottom: '40px', textAlign: 'center' }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
        </svg>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', background: 'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          GEOINT
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase' }}>
          Geospatial Intelligence Systems
        </p>
      </div>

      {/* Overall progress bar */}
      <div style={{ width: 'min(420px, 90vw)', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            {done ? '✅ Data siap!' : error ? '⚠️ Beberapa data gagal dimuat' : 'Memuat data peta...'}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>{overallPct}%</span>
        </div>

        {/* Track */}
        <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${overallPct}%`,
            borderRadius: '99px',
            background: done
              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
              : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            transition: 'width 0.3s ease, background 0.4s ease',
            boxShadow: done ? '0 0 12px #22c55e80' : '0 0 12px #3b82f680',
          }} />
        </div>
      </div>

      {/* Per-layer status */}
      <div style={{ width: 'min(420px, 90vw)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {layers.map(layer => {
          const p = progress[layer.id];
          const pct = p != null ? Math.round(p * 100) : 0;
          const isLoaded = pct === 100;
          const isLoading = p != null && pct < 100;

          return (
            <div key={layer.id} style={{
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${isLoaded ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '10px', padding: '10px 14px',
              transition: 'border-color 0.4s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isLoading ? '6px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>{LAYER_ICONS[layer.type] || '📦'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: isLoaded ? '#4ade80' : '#cbd5e1' }}>
                    {layer.name}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: isLoaded ? '#4ade80' : '#64748b', fontWeight: 600 }}>
                  {isLoaded ? '✓ Selesai' : p === null ? '⏳ Memuat...' : isLoading ? `${pct}%` : '⏳ Menunggu...'}
                </span>
              </div>

              {/* Per-layer progress bar (only while loading) */}
              {isLoading && (
                <div style={{ height: '3px', borderRadius: '99px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                    borderRadius: '99px',
                    transition: 'width 0.2s ease',
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: '28px', fontSize: '11px', color: '#334155', textAlign: 'center' }}>
        {done ? 'Data tersimpan di cache — kunjungan berikutnya akan lebih cepat!' : 'Data akan tersimpan di cache browser untuk akses lebih cepat berikutnya.'}
      </p>
    </div>
  );
}
