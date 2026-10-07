import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-kmz';

export default function KmzLayer({ 
  url, 
  visible = true, 
  onFeatureClick, 
  setKmzLoaded, 
  onFeaturesLoaded,
  onBoundsLoaded,
  categoryColors,
  categoryProperty,
  labelProperty,
  preferredKml,
}) {
  const map = useMap();
  const loadedLayerRef = useRef(null);

  const visibleRef = useRef(visible);
  const onFeatureClickRef = useRef(onFeatureClick);
  const setKmzLoadedRef = useRef(setKmzLoaded);
  const onFeaturesLoadedRef = useRef(onFeaturesLoaded);
  const onBoundsLoadedRef = useRef(onBoundsLoaded);
  const categoryColorsRef = useRef(categoryColors);
  const categoryPropertyRef = useRef(categoryProperty);
  const labelPropertyRef = useRef(labelProperty);

  useEffect(() => { visibleRef.current = visible; }, [visible]);
  useEffect(() => { onFeatureClickRef.current = onFeatureClick; }, [onFeatureClick]);
  useEffect(() => { setKmzLoadedRef.current = setKmzLoaded; }, [setKmzLoaded]);
  useEffect(() => { onFeaturesLoadedRef.current = onFeaturesLoaded; }, [onFeaturesLoaded]);
  useEffect(() => { onBoundsLoadedRef.current = onBoundsLoaded; }, [onBoundsLoaded]);
  useEffect(() => { categoryColorsRef.current = categoryColors; }, [categoryColors]);
  useEffect(() => { categoryPropertyRef.current = categoryProperty; }, [categoryProperty]);
  useEffect(() => { labelPropertyRef.current = labelProperty; }, [labelProperty]);

  useEffect(() => {
    if (!map) return;
    let isMounted = true;

    const kmzParser = L.kmzLayer();
    if (preferredKml) {
      kmzParser.parse = function (data, props) {
        const zip = window.JSZip;
        if (!zip) {
          this.fire('error', new Error('KMZ parser is missing JSZip'));
          return;
        }

        zip.loadAsync(data)
          .then(archive => {
            const kml = archive.file(preferredKml);
            if (!kml) throw new Error(`KML file not found in KMZ: ${preferredKml}`);
            return kml.async('string');
          })
          .then(kml => this._parseKML(kml, props))
          .catch(error => this.fire('error', error));
      };
    }

    kmzParser.on('load', function (e) {
      if (!isMounted) return;

      const layer = e.layer;
      loadedLayerRef.current = layer;

      // Add to map only if currently visible
      if (visibleRef.current) {
        layer.addTo(map);
      }

      // Collect GeoJSON features for point-in-polygon queries
      const features = [];
      layer.eachLayer((childLayer) => {
        const props = childLayer.feature?.properties ?? {};

        const label =
          props[labelPropertyRef.current] ||
          props.name || props.Name || props.NAME ||
          props.nama || props.NAMA ||
          props['Pemegang Izin'] ||
          'IUP';
        const categoryKey = categoryPropertyRef.current;
        const category = String((categoryKey && props[categoryKey]) || props.name || props.Name || props.NAME || props.nama || props.NAMA || '').trim();
        const categoryColor = categoryColorsRef.current?.[category];

        if (categoryColor && childLayer.setStyle) {
          childLayer.setStyle({
            color: categoryColor,
            fillColor: categoryColor,
            fillOpacity: 0.72,
            opacity: 0.95,
            weight: 1,
          });
        }

        if (childLayer.getPopup())   childLayer.unbindPopup();
        if (childLayer.getTooltip()) childLayer.unbindTooltip();

        childLayer.bindTooltip(label, {
          className: 'kmz-tooltip',
          sticky: true,
          offset: [14, 0],
          direction: 'right',
        });

        const origStyle = {
          weight:      childLayer.options.weight    ?? 1,
          fillOpacity: childLayer.options.fillOpacity ?? 0.2,
          opacity:     childLayer.options.opacity   ?? 1,
        };

        childLayer.on('mouseover', () => {
          childLayer.setStyle({ weight: 2.5, fillOpacity: 0.38, opacity: 1 });
          childLayer.bringToFront();
        });

        childLayer.on('mouseout', () => {
          childLayer.setStyle(origStyle);
        });

        childLayer.on('click', (ev) => {
          if (onFeatureClickRef.current) {
            onFeatureClickRef.current(props);
          }
          L.DomEvent.stopPropagation(ev);
        });

        if (childLayer.feature) {
          const props = childLayer.feature.properties;
          childLayer.feature.properties = {
            ...props,
            _label: label,
            _fillColor: categoryColor || props.fill || childLayer.options.fillColor || childLayer.options.color || '#38bdf8',
            _color: categoryColor || props.stroke || childLayer.options.color || '#0284c7',
            _fillOpacity: categoryColor ? 0.72 : 0.3,
          };
          features.push(childLayer.feature);
        }
      });

      if (onFeaturesLoadedRef.current) {
        onFeaturesLoadedRef.current(features);
      }

      try {
        const bounds = layer.getBounds();
        if (onBoundsLoadedRef.current) {
          onBoundsLoadedRef.current(bounds);
        }
      } catch (err) {
        console.warn('Could not extract KMZ layer bounds', err);
      }

      if (setKmzLoadedRef.current) setKmzLoadedRef.current(true);
    });

    kmzParser.on('error', function (err) {
      console.error('Error loading KMZ:', err);
      if (setKmzLoadedRef.current) setKmzLoadedRef.current(true);
    });

    kmzParser.load(url);

    return () => {
      isMounted = false;
      if (loadedLayerRef.current && map) {
        try {
          if (map.hasLayer(loadedLayerRef.current)) {
            map.removeLayer(loadedLayerRef.current);
          }
        } catch (err) {
          console.warn('Error removing KMZ layer on unmount:', err);
        }
        loadedLayerRef.current = null;
      }
    };
  }, [map, url, preferredKml]);

  // Synchronize visibility changes without reloading KMZ
  useEffect(() => {
    if (!map || !loadedLayerRef.current) return;

    if (visible) {
      if (!map.hasLayer(loadedLayerRef.current)) {
        map.addLayer(loadedLayerRef.current);
      }
    } else {
      if (map.hasLayer(loadedLayerRef.current)) {
        map.removeLayer(loadedLayerRef.current);
      }
    }
  }, [map, visible]);

  return null;
}
