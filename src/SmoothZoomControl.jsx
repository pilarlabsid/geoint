import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import '@luomus/leaflet-smooth-wheel-zoom';

/**
 * SmoothZoomControl
 * Menggunakan @luomus/leaflet-smooth-wheel-zoom untuk zoom wheel yang halus.
 * Desync sebelumnya sudah diperbaiki:
 *  - preferCanvas dihapus → SVG layer ikut CSS zoom animation
 *  - CSS transition override dihapus → Leaflet kontrol timing sendiri
 */
export default function SmoothZoomControl() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Nonaktifkan native scroll wheel zoom
    map.scrollWheelZoom.disable();

    // Aktifkan smooth wheel zoom plugin
    if (map.smoothWheelZoom) {
      map.smoothWheelZoom.enable();
    }
  }, [map]);

  return null;
}
