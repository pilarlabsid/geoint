import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, ImageOverlay, useMap } from 'react-leaflet';
import {
  MapPin, Info, ZoomIn, ZoomOut,
  Search, CheckCircle, XCircle, Loader2, Navigation, Layers,
  ChevronLeft, ChevronRight, PanelLeftClose,
} from 'lucide-react';
import L from 'leaflet';
import KmzLayer from './KmzLayer';
import SmoothZoomControl from './SmoothZoomControl';
import Map3DView from './Map3DView';
import DataLoader from './DataLoader';
import { LAYERS_CONFIG } from './config/layers';
import './index.css';

/* ─────────────────────────────────
   Point-in-Polygon (Ray Casting)
───────────────────────────────── */
function raycast(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
function pipRings(x, y, rings) {
  if (!raycast(x, y, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) if (raycast(x, y, rings[h])) return false;
  return true;
}
function isPointInFeature(lat, lng, feat) {
  const g = feat?.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') return pipRings(lng, lat, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => pipRings(lng, lat, p));
  return false;
}

/* ─────────────────────────────────
   Search Marker (inside MapContainer)
───────────────────────────────── */
function SearchMarker({ coord }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    if (!map) return;
    if (ref.current) { map.removeLayer(ref.current); ref.current = null; }
    if (!coord) return;
    const icon = L.divIcon({
      className: '',
      html: `<div class="coord-marker"><div class="coord-marker-ring"></div></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    });
    ref.current = L.marker([coord.lat, coord.lng], { icon }).addTo(map);
    map.flyTo([coord.lat, coord.lng], Math.max(map.getZoom(), 11), { animate: true, duration: 1.2 });
    return () => { if (ref.current) { map.removeLayer(ref.current); ref.current = null; } };
  }, [map, coord]);
  return null;
}

/* ─────────────────────────────────
   Map Camera Tracker (2D)
───────────────────────────────── */
function MapCameraTracker({ isActive, onCameraMove }) {
  const map = useMap();
  useEffect(() => {
    if (!isActive) return;
    const onMoveEnd = () => {
      const c = map.getCenter();
      onCameraMove([c.lat, c.lng], map.getZoom());
    };
    map.on('moveend', onMoveEnd);
    return () => map.off('moveend', onMoveEnd);
  }, [map, isActive, onCameraMove]);
  return null;
}

/* ─────────────────────────────────
   Field renderers
───────────────────────────────── */
function FieldValue({ value }) {
  if (!value || value === '') return <span className="empty-value">—</span>;
  const str = String(value);
  if (/<[a-z][\s\S]*>/i.test(str))
    return <div className="info-item-value html-content" dangerouslySetInnerHTML={{ __html: str }} />;
  return <div className="info-item-value">{str}</div>;
}
function formatKey(key) {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
}

/* ─────────────────────────────────
   Main App
───────────────────────────────── */
export default function App() {
  const [dataUrls, setDataUrls] = useState({}); // Populated progressively by DataLoader
  const [selectedFeature, setSelectedFeature] = useState(null);
  const hasDefaultKmz = LAYERS_CONFIG.some(l => l.type === 'kmz' && l.defaultVisible);
  const [isLayersLoaded, setIsLayersLoaded] = useState(!hasDefaultKmz);
  const [basemap, setBasemap] = useState('satellite');
  const [isLayerOpen, setIsLayerOpen] = useState(false);
  const [featuresByLayer, setFeaturesByLayer] = useState({});
  const [layerBoundsMap, setLayerBoundsMap] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  /* 2D / 3D Mode */
  const [mapMode, setMapMode] = useState('2d');
  const [hasLoaded3D, setHasLoaded3D] = useState(false);

  const getInitialStateFromHash = () => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace('#', '');
      const parts = hash.split('/');
      if (parts.length === 3) {
        const z = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        if (!isNaN(z) && !isNaN(lat) && !isNaN(lng)) {
          return { center: [lat, lng], zoom: z };
        }
      }
    }
    return { center: [-2.5, 118.0], zoom: 5 }; // Seluruh Indonesia
  };

  const initialView = useMemo(() => getInitialStateFromHash(), []);
  const [mapCenter, setMapCenter] = useState(initialView.center);
  const [mapZoom, setMapZoom] = useState(initialView.zoom);
  const [fitBounds3D, setFitBounds3D] = useState(null);

  const updateHash = useCallback((center, zoom) => {
    const z = Math.round(zoom);
    const lat = center[0].toFixed(5);
    const lng = center[1].toFixed(5);
    const newHash = `#${z}/${lat}/${lng}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, null, newHash);
    }
  }, []);

  const handleCameraMove = useCallback((c, z) => {
    setMapCenter(c);
    setMapZoom(z);
    updateHash(c, z);
  }, [updateHash]);

  const [visibleLayers, setVisibleLayers] = useState(() =>
    LAYERS_CONFIG.filter(l => l.defaultVisible).map(l => l.id)
  );

  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [searchCoord, setSearchCoord] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const mapRef = useRef(null);
  const layerBtnRef = useRef(null);

  /* Safety fallback for loading overlay */
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLayersLoaded(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  /* Mode switch handler */
  const handleToggleMode = useCallback((mode) => {
    if (mode === mapMode) return;
    if (mode === '3d') {
      setHasLoaded3D(true);
    } else {
      // Switching to 2D: force sync view
      if (mapRef.current) {
        mapRef.current.setView(mapCenter, mapZoom, { animate: false });
      }
    }
    setMapMode(mode);
  }, [mapMode, mapCenter, mapZoom]);

  /* Zoom handlers */
  const zoomIn = useCallback(() => mapRef.current?.zoomIn(0.5, { animate: true }), []);
  const zoomOut = useCallback(() => mapRef.current?.zoomOut(0.5, { animate: true }), []);
  const handleZoomToLayer = useCallback((bounds) => {
    if (mapMode === '2d') {
      if (mapRef.current) mapRef.current.fitBounds(bounds, { animate: true, maxZoom: 18 });
    } else {
      setFitBounds3D({ bounds, timestamp: Date.now() });
    }
  }, [mapMode]);

  /* Close layer dropdown on outside click */
  useEffect(() => {
    const fn = e => { if (layerBtnRef.current && !layerBtnRef.current.contains(e.target)) setIsLayerOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const handleFeatureClick = useCallback(props => {
    setSelectedFeature(props);
    setSearchResult(null);
  }, []);

  const handleFeaturesLoaded = useCallback((layerId, feats) => {
    setFeaturesByLayer(prev => ({ ...prev, [layerId]: feats }));
  }, []);

  const handleLayerLoadStart = useCallback((layerId) => {
    // legacy
  }, []);

  const handleLayerLoadEnd = useCallback((layerId) => {
    // legacy
  }, []);

  const handleBoundsLoaded = useCallback((layerId, bounds) => {
    setLayerBoundsMap(prev => ({ ...prev, [layerId]: bounds }));
  }, []);

  const activeVectorFeatures = useMemo(() => {
    return visibleLayers.flatMap(id => featuresByLayer[id] || []);
  }, [visibleLayers, featuresByLayer]);

  const handleCoordSearch = useCallback(async () => {
    const lat = parseFloat(latInput.replace(',', '.'));
    const lng = parseFloat(lngInput.replace(',', '.'));
    if (isNaN(lat) || isNaN(lng)) { setSearchError('Masukkan koordinat desimal yang valid'); return; }
    if (lat < -90 || lat > 90) { setSearchError('Latitude harus antara -90 dan 90'); return; }
    if (lng < -180 || lng > 180) { setSearchError('Longitude harus antara -180 dan 180'); return; }

    setSearchError(''); setIsSearching(true);
    setSearchCoord({ lat, lng }); setSelectedFeature(null);

    const matchedFeatures = activeVectorFeatures.filter(f => isPointInFeature(lat, lng, f));
    const firstMatched = matchedFeatures.length > 0 ? matchedFeatures[0] : null;

    let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'Accept-Language': 'id' } });
      const d = await r.json();
      if (d.display_name) address = d.display_name;
    } catch { /* fallback */ }

    setSearchResult({ matches: matchedFeatures, address, lat, lng });
    if (firstMatched) setSelectedFeature(firstMatched.properties);
    setIsSearching(false);
  }, [latInput, lngInput, activeVectorFeatures]);

  const handleClearSearch = useCallback(() => {
    setSearchCoord(null); setSearchResult(null);
    setLatInput(''); setLngInput(''); setSearchError(''); setSelectedFeature(null);
  }, []);

  const skipKeys = new Set([
    // Internal leaflet-kmz
    'styleUrl', 'styleHash', 'styleMapHash',
    // KMZ style properties (tidak relevan untuk user)
    'stroke', 'stroke-opacity', 'stroke-width',
    'fill', 'fill-opacity',
  ]);


  const basemaps = {
    satellite: { 
      name: 'Satelit', 
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 
      attribution: 'Tiles &copy; Esri', 
      maxNativeZoom: 18, 
      maxZoom: 22 
    },
    topo: { 
      name: 'Topografi & Kontur', 
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', 
      attribution: 'Tiles &copy; Esri', 
      maxNativeZoom: 19, 
      maxZoom: 22 
    },
    hillshade: { 
      name: 'Relief Elevasi', 
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', 
      attribution: 'Tiles &copy; Esri', 
      maxNativeZoom: 18, 
      maxZoom: 22 
    },
    opentopo: { 
      name: 'OpenTopoMap', 
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', 
      attribution: '&copy; OpenTopoMap', 
      subdomains: 'abc', 
      maxNativeZoom: 17, 
      maxZoom: 22 
    },
    dark: { 
      name: 'Dark', 
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', 
      attribution: 'Tiles &copy; Esri', 
      maxNativeZoom: 16, 
      maxZoom: 22 
    },
    osm: { 
      name: 'Street', 
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 
      attribution: '&copy; OpenStreetMap contributors', 
      maxNativeZoom: 19, 
      maxZoom: 22 
    },
  };

  // Inject cache URLs into layer configs. Wait for DataLoader to provide the URL.
  const layersWithCache = useMemo(() => {
    return LAYERS_CONFIG.map(layer => ({
      ...layer,
      url: dataUrls[layer.id] || null // null means not downloaded yet
    }));
  }, [dataUrls]);

  return (
    <div className="app-container">

      {/* ── Map ── */}
      <div className="map-container">
        {/* 2D Leaflet View */}
        <div style={{ display: mapMode === '2d' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <MapContainer
            center={mapCenter} zoom={mapZoom}
            maxZoom={22}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
            scrollWheelZoom={false}
            smoothWheelZoom={true}
            smoothSensitivity={1}
            zoomSnap={0} zoomDelta={0.5}
            zoomAnimation={true} zoomAnimationThreshold={999}
            ref={mapRef}
          >
            <TileLayer key={basemap} {...basemaps[basemap]} />
            {layersWithCache.map(layer => {
              if (!layer.url) return null; // Wait until DataLoader provides the URL

              if (layer.type === 'image') {
                if (!visibleLayers.includes(layer.id)) return null;
                return (
                  <ImageOverlay
                    key={layer.id}
                    url={layer.url}
                    bounds={layer.bounds}
                    opacity={1}
                    zIndex={998}
                    eventHandlers={{
                      load: () => handleLayerLoadEnd(layer.id),
                      error: () => handleLayerLoadEnd(layer.id),
                    }}
                  />
                );
              } else if (layer.type === 'kmz') {
                return (
                  <KmzLayer
                    key={layer.id}
                    url={layer.url}
                    visible={visibleLayers.includes(layer.id)}
                    onFeatureClick={handleFeatureClick}
                    setKmzLoaded={setIsLayersLoaded}
                    onFeaturesLoaded={(feats) => handleFeaturesLoaded(layer.id, feats)}
                    onBoundsLoaded={(bounds) => handleBoundsLoaded(layer.id, bounds)}
                  />
                );
              }
              return null;
            })}
            <SmoothZoomControl />
            <SearchMarker coord={searchCoord} />
            <MapCameraTracker isActive={mapMode === '2d'} onCameraMove={handleCameraMove} />
          </MapContainer>
        </div>

        {/* 3D MapLibre View */}
        {hasLoaded3D && (
          <div style={{ display: mapMode === '3d' ? 'block' : 'none', width: '100%', height: '100%' }}>
            <Map3DView
              center={mapCenter}
              zoom={mapZoom}
              basemap={basemap}
              basemapsConfig={basemaps}
              visibleLayers={visibleLayers}
              layersConfig={layersWithCache}
              featuresByLayer={featuresByLayer}
              fitBoundsRequest={fitBounds3D}
              onFeatureClick={handleFeatureClick}
              onCameraMove={(c, z) => {
                if (mapMode === '3d') handleCameraMove(c, z);
              }}
            />
          </div>
        )}

        {/* ── 2D / 3D Mode Switcher ── */}
        <div className="mode-toggle-wrap">
          <div className="mode-toggle-pill">
            <button
              id="btn-mode-2d"
              className={`mode-pill-btn ${mapMode === '2d' ? 'active' : ''}`}
              onClick={() => handleToggleMode('2d')}
              title="Mode 2D (Peta Datar)"
            >
              2D
            </button>
            <button
              id="btn-mode-3d"
              className={`mode-pill-btn ${mapMode === '3d' ? 'active' : ''}`}
              onClick={() => handleToggleMode('3d')}
              title="Mode 3D (Relief Elevasi & Terrain)"
            >
              3D
            </button>
          </div>
        </div>

        {/* Zoom buttons (2D Mode) */}
        {mapMode === '2d' && (
          <div className="zoom-controls">
            <button className="zoom-btn" id="zoom-in" onClick={zoomIn} title="Zoom In">  <ZoomIn size={16} /></button>
            <div className="zoom-divider" />
            <button className="zoom-btn" id="zoom-out" onClick={zoomOut} title="Zoom Out"> <ZoomOut size={16} /></button>
          </div>
        )}

        {/* ── DataLoader Widget ── */}
        <DataLoader onLayerReady={(id, url) => setDataUrls(p => ({ ...p, [id]: url }))} onComplete={() => {}} />

        {/* Layer toggle */}
        <div className="layer-toggle-wrap" ref={layerBtnRef}>
          <button id="btn-layer-toggle" className={`layer-icon-btn ${isLayerOpen ? 'active' : ''}`} onClick={() => setIsLayerOpen(v => !v)} title="Pilih Basemap">
            <Layers size={17} />
          </button>
          {isLayerOpen && (
            <div className="layer-dropdown">
              <p className="layer-dropdown-title">Basemap</p>
              {Object.entries(basemaps).map(([key, data]) => (
                <button key={key} className={`layer-option ${basemap === key ? 'active' : ''}`} onClick={() => { setBasemap(key); setIsLayerOpen(false); }}>
                  <span className={`layer-dot layer-dot-${key}`} />
                  {data.name}
                  {basemap === key && <span className="layer-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* ── Floating open-sidebar button (visible when sidebar is closed) ── */}
      {!isSidebarOpen && (
        <button
          id="btn-open-sidebar"
          className="sidebar-open-btn"
          onClick={() => setIsSidebarOpen(true)}
          title="Buka panel"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* ── Sidebar ── */}
      <div className={`sidebar ${isSidebarOpen ? '' : 'sidebar-collapsed'}`} onWheel={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
              </svg>
            </div>
            <h1>GEOINT</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="sidebar-subtitle">Geospatial Intelligence Systems</p>
            <button
              id="btn-toggle-sidebar"
              className="sidebar-toggle-btn"
              onClick={() => setIsSidebarOpen(false)}
              title="Tutup panel"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>

        <div className="sidebar-body">

          {/* Coordinate Search */}
          <div className="sidebar-section">
            <div className="section-label">
              <Search size={12} />
              Cek Koordinat
            </div>

            <div className="coord-inputs">
              <div className="coord-field">
                <label htmlFor="lat-input">Latitude</label>
                <input id="lat-input" className="coord-input" type="text" placeholder="-2.548926"
                  value={latInput} onChange={e => setLatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCoordSearch()} />
              </div>
              <div className="coord-field">
                <label htmlFor="lng-input">Longitude</label>
                <input id="lng-input" className="coord-input" type="text" placeholder="115.012345"
                  value={lngInput} onChange={e => setLngInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCoordSearch()} />
              </div>
            </div>

            {searchError && <p className="search-error">{searchError}</p>}

            <div className="search-actions">
              <button id="btn-cek-koordinat" className="btn-search" onClick={handleCoordSearch} disabled={isSearching}>
                {isSearching
                  ? <><Loader2 size={13} className="spin-icon" /> Memeriksa...</>
                  : <><Navigation size={13} /> Cek Lokasi</>}
              </button>
              {searchResult && (
                <button id="btn-clear-search" className="btn-clear" onClick={handleClearSearch} title="Hapus">✕</button>
              )}
            </div>

            {searchResult && (
              <div className={`search-result ${searchResult.matches.length > 0 ? 'in-iup' : 'out-iup'}`}>
                <div className="search-result-status">
                  {searchResult.matches.length > 0
                    ? <><CheckCircle size={14} className="icon-green" /> Ditemukan {searchResult.matches.length} objek</>
                    : <><Info size={14} className="icon-red" /> Tidak ada objek ditemukan</>}
                </div>
                <div className="search-result-coord">
                  {searchResult.lat.toFixed(6)}, {searchResult.lng.toFixed(6)}
                </div>
                <div className="search-result-address">{searchResult.address}</div>
              </div>
            )}
          </div>

          {/* Layer List */}
          <div className="sidebar-section">
            <div className="section-label">
              <Layers size={12} />
              Katalog Data
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {layersWithCache.map(layer => {
                const targetBounds = layer.bounds || layerBoundsMap[layer.id];
                return (
                  <div key={layer.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: '#1e293b', borderRadius: '6px', border: '1px solid #334155' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={visibleLayers.includes(layer.id)}
                        onChange={(e) => {
                          if (e.target.checked) setVisibleLayers([...visibleLayers, layer.id]);
                          else setVisibleLayers(visibleLayers.filter(id => id !== layer.id));
                        }}
                        style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
                      />
                      {layer.name}
                    </label>
                    {targetBounds && (
                      <button
                        onClick={() => handleZoomToLayer(targetBounds)}
                        style={{ background: '#2563eb', border: 'none', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: '500', transition: 'background 0.2s' }}
                        onMouseOver={(e) => e.target.style.background = '#3b82f6'}
                        onMouseOut={(e) => e.target.style.background = '#2563eb'}
                        title={`Zoom ke ${layer.name}`}
                      >
                        Zoom
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feature Info */}
          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="section-label">
              <Info size={12} />
              Informasi Objek
            </div>

            {selectedFeature ? (
              <div className="info-section">
                {Object.entries(selectedFeature)
                  .filter(([k]) => !skipKeys.has(k))
                  .map(([k, v]) => (
                    <div className="info-item" key={k}>
                      <div className="info-item-label">{formatKey(k)}</div>
                      <FieldValue value={v} />
                    </div>
                  ))}
              </div>
            ) : (
              <div className="empty-state">
                <MapPin size={32} strokeWidth={1.5} />
                <p>Klik objek pada peta untuk melihat detail informasi, atau gunakan pencarian koordinat di atas.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
