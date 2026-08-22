/**
 * Location Controller
 * Provides robust reverse geocoding and IP geolocation with multi-tier failover.
 */

const { logger } = require('../middleware/errorHandler');

/**
 * Reverse Geocode coordinates to structured address
 * Supports Nominatim (OSM), BigDataCloud, Google Maps, and Mapbox
 */
const reverseGeocode = async (req, res) => {
  const lat = parseFloat(req.query.lat || req.query.latitude || req.body?.lat || req.body?.latitude);
  const lng = parseFloat(req.query.lng || req.query.lon || req.query.longitude || req.body?.lng || req.body?.longitude);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      success: false,
      message: 'Invalid latitude or longitude coordinates provided.',
    });
  }

  // 1. Check optional Google Maps Geocoding API if configured
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const gRes = await fetch(googleUrl, { signal: AbortSignal.timeout(4000) });
      if (gRes.ok) {
        const gData = await gRes.json();
        if (gData.status === 'OK' && gData.results?.length > 0) {
          const firstResult = gData.results[0];
          let state = '';
          let district = '';
          let city = '';
          let pincode = '';
          let road = '';

          for (const comp of firstResult.address_components) {
            if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
            if (comp.types.includes('administrative_area_level_2')) district = comp.long_name;
            if (comp.types.includes('locality')) city = comp.long_name;
            if (comp.types.includes('postal_code')) pincode = comp.long_name;
            if (comp.types.includes('route')) road = comp.long_name;
          }

          return res.json({
            success: true,
            provider: 'google',
            data: {
              lat,
              lng,
              address: firstResult.formatted_address || '',
              road,
              city: city || district,
              district: district || city,
              state,
              pincode,
              country: 'India',
              raw: firstResult
            }
          });
        }
      }
    } catch (gErr) {
      logger.warn(`Google Geocoding failed: ${gErr.message}`);
    }
  }

  // 2. Check OpenStreetMap Nominatim with proper User-Agent and headers
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=en`;
    const osmRes = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'JanShaktiGrievancePortal/1.0.0 (contact: support@janshakti.gov.in)',
        'Accept-Language': 'en',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (osmRes.ok) {
      const osmData = await osmRes.json();
      if (osmData && (osmData.address || osmData.display_name)) {
        const addr = osmData.address || {};
        
        const state = addr.state || addr.region || addr.province || addr.state_district || '';
        const district = addr.district || addr.state_district || addr.county || addr.city_district || addr.city || addr.town || addr.suburb || '';
        const city = addr.city || addr.town || addr.municipality || addr.village || addr.suburb || addr.neighbourhood || '';
        const road = addr.road || addr.street || addr.footway || addr.path || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
        const pincode = addr.postcode || '';
        const address = osmData.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        return res.json({
          success: true,
          provider: 'nominatim',
          data: {
            lat,
            lng,
            address,
            road,
            city,
            district,
            state,
            pincode,
            country: addr.country || 'India',
            raw: addr
          }
        });
      }
    }
  } catch (osmErr) {
    logger.warn(`OSM Nominatim lookup failed: ${osmErr.message}`);
  }

  // 3. Fallback to BigDataCloud Reverse Geocoding (Free, very fast, highly reliable for India)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const bdcRes = await fetch(bdcUrl, { signal: AbortSignal.timeout(5000) });

    if (bdcRes.ok) {
      const bdcData = await bdcRes.json();
      if (bdcData && (bdcData.principalSubdivision || bdcData.locality || bdcData.city)) {
        const state = bdcData.principalSubdivision || '';
        const district = bdcData.locality || bdcData.city || bdcData.principalSubdivisionCode || '';
        const city = bdcData.city || bdcData.locality || '';
        const pincode = bdcData.postcode || '';
        
        // Build readable formatted address
        const parts = [
          bdcData.localityInfo?.informative?.[0]?.name || '',
          bdcData.locality,
          bdcData.city,
          bdcData.principalSubdivision,
          bdcData.postcode,
          bdcData.countryName || 'India'
        ].filter(Boolean);
        
        // Deduplicate adjacent identical parts
        const dedupedParts = parts.filter((item, idx) => parts.indexOf(item) === idx);
        const address = dedupedParts.join(', ') || `GPS Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        return res.json({
          success: true,
          provider: 'bigdatacloud',
          data: {
            lat,
            lng,
            address,
            road: bdcData.localityInfo?.informative?.[0]?.name || '',
            city,
            district,
            state,
            pincode,
            country: bdcData.countryName || 'India',
            raw: bdcData
          }
        });
      }
    }
  } catch (bdcErr) {
    logger.warn(`BigDataCloud Geocoding fallback failed: ${bdcErr.message}`);
  }

  // 4. Return clean structured coordinates fallback if external APIs are unreachable
  return res.json({
    success: true,
    provider: 'coordinates_fallback',
    data: {
      lat,
      lng,
      address: `GPS Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      road: '',
      city: '',
      district: '',
      state: '',
      pincode: '',
      country: 'India'
    }
  });
};

/**
 * IP Geolocation fallback when browser GPS is denied/unavailable
 */
const getIpGeolocation = async (req, res) => {
  try {
    let clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.socket.remoteAddress || 
                   '';

    // Normalize IPv6 localhost
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.')) {
      clientIp = ''; // Let external provider use requester's public IP
    }

    // Tier 1: ipwho.is
    try {
      const url = clientIp ? `https://ipwho.is/${clientIp}` : 'https://ipwho.is/';
      const ipRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData && ipData.success !== false && ipData.latitude && ipData.longitude) {
          return res.json({
            success: true,
            provider: 'ipwhois',
            data: {
              latitude: ipData.latitude,
              longitude: ipData.longitude,
              city: ipData.city || '',
              district: ipData.city || '',
              region: ipData.region || '',
              state: ipData.region || '',
              pincode: ipData.postal || '',
              country: ipData.country || 'India'
            }
          });
        }
      }
    } catch (e) {
      logger.warn(`ipwho.is error: ${e.message}`);
    }

    // Tier 2: ipinfo.io
    try {
      const url = clientIp ? `https://ipinfo.io/${clientIp}/json` : 'https://ipinfo.io/json';
      const ipRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData.loc) {
          const [latStr, lngStr] = ipData.loc.split(',');
          return res.json({
            success: true,
            provider: 'ipinfo',
            data: {
              latitude: parseFloat(latStr),
              longitude: parseFloat(lngStr),
              city: ipData.city || '',
              district: ipData.city || '',
              region: ipData.region || '',
              state: ipData.region || '',
              pincode: ipData.postal || '',
              country: ipData.country || 'India'
            }
          });
        }
      }
    } catch (e) {
      logger.warn(`ipinfo.io error: ${e.message}`);
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to determine location from IP address.'
    });
  } catch (error) {
    logger.error('IP Geolocation error:', error);
    return res.status(500).json({
      success: false,
      message: 'IP Geolocation service error.'
    });
  }
};

module.exports = {
  reverseGeocode,
  getIpGeolocation
};
