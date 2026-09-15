import React, { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, Popup, config } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Mouse } from 'lucide-react';

if (workerUrl && config) {
  config.WORKER_URL = workerUrl;
}

/**
 * Convert Leaflet [[south, west], [north, east]] bounds
 * to MapLibre image source coordinates:
 * [ [top-left-lng, top-left-lat], [top-right-lng, top-right-lat],
 *   [bottom-right-lng, bottom-right-lat], [bottom-left-lng, bottom-left-lat] ]
 */
function boundsToCoordinates(bounds) {
  const [south, west] = bounds[0];
  const [north, east] = bounds[1];
  return [
    [west, north], // Top-Left
    [east, north], // Top-Right
    [east, south], // Bottom-Right
    [west, south]  // Bottom-Left
  ];
}

export default function Map3DView({
  center = [-8.414, 112.726],
  zoom = 15,
  basemap = 'satellite',
  basemapsConfig,
  visibleLayers = [],
  layersConfig = [],
  featuresByLayer = {},
  fitBoundsRequest,
  onFeatureClick,
  onCameraMove
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Keep callback refs updated to avoid re-initializing map
  const onFeatureClickRef = useRef(onFeatureClick);
  const onCameraMoveRef = useRef(onCameraMove);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => { onFeatureClickRef.current = onFeatureClick; }, [onFeatureClick]);
  useEffect(() => { onCameraMoveRef.current = onCameraMove; }, [onCameraMove]);



  // Initial Map Setup
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialBasemapUrl = basemapsConfig?.[basemap]?.url || 
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'basemap-source': {
            type: 'raster',
            tiles: [initialBasemapUrl.replace('{s}', 'a')],
            tileSize: 256,
            maxzoom: 17 // Limit source maxzoom to prevent "map data not available" tiles; MapLibre will stretch these tiles for higher zoom levels.
          },
          'terrain-dem': {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            encoding: 'terrarium',
            tileSize: 256
          },
          'terrain-dem-hillshade': {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            encoding: 'terrarium',
            tileSize: 256
          }
        },
        layers: [
          {
            id: 'basemap-layer',
            type: 'raster',
            source: 'basemap-source'
          },
          {
            id: 'hillshade-layer',
            type: 'hillshade',
            source: 'terrain-dem-hillshade',
            paint: {
              'hillshade-exaggeration': 0.6,
              'hillshade-shadow-color': '#020617',
              'hillshade-highlight-color': '#ffffff',
              'hillshade-accent-color': '#0284c7'
            }
          }
        ],
        terrain: {
          source: 'terrain-dem',
          exaggeration: 1.6
        },
        sky: {
          'sky-color': '#0f172a',
          'horizon-color': '#1e293b',
          'fog-color': '#0f172a'
        }
      },
      center: [center[1], center[0]], // MapLibre takes [lng, lat]
      zoom: zoom,
      pitch: 62, // 3D perspective tilt
      bearing: -25, // Initial angle
      maxPitch: 85,
      maxZoom: 19, // Restrict total map zoom
      attributionControl: false
    });

    // Add navigation controls (compass + pitch control + zoom)
    map.addControl(new NavigationControl({
      visualizePitch: true,
      showCompass: true,
      showZoom: true
    }), 'bottom-right');

    map.on('moveend', () => {
      const c = map.getCenter();
      const z = map.getZoom();
      if (onCameraMoveRef.current) {
        onCameraMoveRef.current([c.lat, c.lng], z);
      }
    });

    map.on('load', () => {
      setIsMapLoaded(true);

      // 1. Add Image layers from layersConfig
      layersConfig.forEach(l => {
        if (l.type === 'image' && l.bounds) {
          const coords = boundsToCoordinates(l.bounds);
          map.addSource(`img-source-${l.id}`, {
            type: 'image',
            url: l.url,
            coordinates: coords
          });
          map.addLayer({
            id: `img-layer-${l.id}`,
            type: 'raster',
            source: `img-source-${l.id}`,
            layout: {
              visibility: visibleLayers.includes(l.id) ? 'visible' : 'none'
            }
          });
        }
      });

      // 2. Add Vector (GeoJSON) layer for KMZ features
      // Initially empty, updated by the useEffect below
      map.addSource('vector-features-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'vector-fill-layer',
        type: 'fill',
        source: 'vector-features-source',
        paint: {
          'fill-color': ['coalesce', ['get', '_fillColor'], '#38bdf8'],
          'fill-opacity': 0.3
        }
      });

      map.addLayer({
        id: 'vector-line-layer',
        type: 'line',
        source: 'vector-features-source',
        paint: {
          'line-color': ['coalesce', ['get', '_color'], '#0284c7'],
          'line-width': 2.5
        }
      });

      // Click on vector features
      map.on('click', 'vector-fill-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          if (onFeatureClickRef.current) {
            onFeatureClickRef.current(props);
          }
        }
      });

      // Tooltip popup instance
      const tooltipPopup = new Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'kmz-tooltip-3d' // We can reuse standard CSS or custom class
      });

      map.on('mouseenter', 'vector-fill-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        if (e.features.length > 0) {
          const name = e.features[0].properties._label;
          if (name) {
            tooltipPopup.setLngLat(e.lngLat)
              .setHTML(`<div style="background: rgba(15, 23, 42, 0.9); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 6px rgba(0,0,0,0.3);">${name}</div>`)
              .addTo(map);
          }
        }
      });

      map.on('mousemove', 'vector-fill-layer', (e) => {
        if (tooltipPopup.isOpen()) {
          tooltipPopup.setLngLat(e.lngLat);
        }
      });

      map.on('mouseleave', 'vector-fill-layer', () => {
        map.getCanvas().style.cursor = '';
        tooltipPopup.remove();
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setIsMapLoaded(false);
    };
  }, []); // Run once on mount

  // Update Basemap when basemap prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('basemap-source');
    const newUrl = basemapsConfig?.[basemap]?.url;
    if (source && newUrl) {
      source.setTiles([newUrl.replace('{s}', 'a')]);
    }
  }, [basemap, basemapsConfig, isMapLoaded]);

  // Update image layers visibility and add missing layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    layersConfig.forEach(l => {
      if (l.type === 'image' && l.bounds) {
        const layerId = `img-layer-${l.id}`;
        const sourceId = `img-source-${l.id}`;

        // Add source if not exists
        if (!map.getSource(sourceId)) {
          if (!l.url) return; // Wait until URL is available from DataLoader cache

          map.addSource(sourceId, {
            type: 'image',
            url: l.url,
            coordinates: boundsToCoordinates(l.bounds)
          });
        }

        // Add layer if not exists
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: {
              visibility: visibleLayers.includes(l.id) ? 'visible' : 'none'
            }
          });
        } else {
          // Update visibility if layer already exists
          map.setLayoutProperty(
            layerId,
            'visibility',
            visibleLayers.includes(l.id) ? 'visible' : 'none'
          );
        }
      }
    });
  }, [visibleLayers, layersConfig, isMapLoaded]);

  // Update vector features data when featuresByLayer or visibleLayers changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('vector-features-source');
    if (source) {
      const activeFeatures = visibleLayers.flatMap(id => featuresByLayer[id] || []);
      source.setData({
        type: 'FeatureCollection',
        features: activeFeatures
      });
    }
  }, [featuresByLayer, visibleLayers, isMapLoaded]);

  // Handle fitBounds request
  useEffect(() => {
    if (!fitBoundsRequest?.bounds || !mapRef.current) return;
    
    const b = fitBoundsRequest.bounds;
    let swLat, swLng, neLat, neLng;
    
    if (Array.isArray(b)) {
      [[swLat, swLng], [neLat, neLng]] = b;
    } else if (typeof b.getSouthWest === 'function') {
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      swLat = sw.lat; swLng = sw.lng;
      neLat = ne.lat; neLng = ne.lng;
    } else {
      return;
    }

    mapRef.current.fitBounds(
      [[swLng, swLat], [neLng, neLat]],
      { maxZoom: 18, pitch: 60 }
    );
  }, [fitBoundsRequest]);

  // Sync camera from external changes (e.g., switching from 2D mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const current = map.getCenter();
    const currentZoom = map.getZoom();

    const dLat = Math.abs(current.lat - center[0]);
    const dLng = Math.abs(current.lng - center[1]);
    const dZoom = Math.abs(currentZoom - zoom);

    // Only jump if difference is significant (prevents infinite loop with onCameraMove)
    if (dLat > 0.0001 || dLng > 0.0001 || dZoom > 0.1) {
      map.jumpTo({ center: [center[1], center[0]], zoom });
    }
  }, [center, zoom]);

  // Handle Custom Rotate Mode via Ctrl/Cmd + Left Click Drag
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startBearing = 0;
    let startPitch = 0;

    const onMouseDown = (e) => {
      // Check for Left click + (Ctrl or Cmd)
      if (e.originalEvent.button === 0 && (e.originalEvent.ctrlKey || e.originalEvent.metaKey)) {
        map.dragPan.disable(); // Prevent map from panning
        isDragging = true;
        startX = e.originalEvent.clientX;
        startY = e.originalEvent.clientY;
        startBearing = map.getBearing();
        startPitch = map.getPitch();
        map.getCanvas().style.cursor = 'grabbing';
      }
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.originalEvent.clientX - startX;
      const dy = e.originalEvent.clientY - startY;

      map.setBearing(startBearing + dx * 0.5);
      map.setPitch(Math.max(0, Math.min(85, startPitch - dy * 0.5)));
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        map.getCanvas().style.cursor = '';
        map.dragPan.enable();
      }
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('mouseout', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('mouseout', onMouseUp);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', outline: 'none' }} 
      />
      {/* 3D Hint overlay */}
      <div 
        className="hint-3d-badge" 
        style={{ 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center', 
          pointerEvents: 'auto',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          color: '#e2e8f0',
          padding: '8px 14px',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '12px',
          fontWeight: '500',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
        title="Tahan Ctrl + Geser mouse untuk memutar 3D"
      >
        <Mouse size={16} color="#38bdf8" />
        <span style={{ letterSpacing: '0.3px' }}>Ctrl + Drag</span>
      </div>
    </div>
  );
}
