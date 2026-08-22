import { useState, useCallback } from 'react';
import api from '../utils/api';

/**
 * useGeoLocation — GPS detection + reverse geocoding via backend multi-tier provider
 */
export function useGeoLocation() {
  const [location, setLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const detect = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return null;
    }

    setIsLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude: lat, longitude: lng, accuracy } = position.coords;

          let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          let state = '';
          let district = '';
          let pincode = '';

          // Reverse geocode via secure backend
          try {
            const res = await api.get('/location/reverse', {
              params: { lat, lng }
            });
            if (res.data?.success && res.data?.data) {
              const d = res.data.data;
              address = d.address || address;
              state = d.state || '';
              district = d.district || d.city || '';
              pincode = d.pincode || '';
            }
          } catch {
            // Geocoding failed — use raw coords
          }

          const result = { lat, lng, address, state: state.toLowerCase(), district: district.toLowerCase(), pincode, accuracy };
          setLocation(result);
          setIsLoading(false);
          resolve(result);
        },
        (err) => {
          const messages = {
            1: 'Location access denied. Please allow location permission or enter manually.',
            2: 'Position unavailable. Please enter location manually.',
            3: 'Location request timed out. Please try again.',
          };
          const msg = messages[err.code] || 'Unable to detect location.';
          setError(msg);
          setIsLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  const clear = useCallback(() => {
    setLocation(null);
    setError(null);
  }, []);

  return { location, isLoading, error, detect, clear };
}

export default useGeoLocation;
