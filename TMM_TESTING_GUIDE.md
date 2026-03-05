# Trimble Mobile Manager (TMM) Testing Guide

## Testing Browser Geolocation with TMM Mock Location

This guide will help you test the Manholes Mapper PWA with Trimble R780 position data through **Trimble Mobile Manager (TMM)** mock location on Android.

---

## Prerequisites

| Item | Requirement |
|------|-------------|
| **Device** | Samsung Galaxy Note 10 (Android) |
| **GNSS Receiver** | Trimble R780 (paired via Bluetooth) |
| **TMM App** | Trimble Mobile Manager installed |
| **Browser** | Google Chrome on Android |
| **PWA** | Manholes Mapper accessible (localhost or deployed) |

---

## Setup Steps

### 1. Enable Developer Options on Android

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times to enable Developer Options
3. Go to **Settings** → **Developer Options**
4. Enable **Allow mock locations**

### 2. Configure Trimble Mobile Manager

1. Open **Trimble Mobile Manager** app
2. Connect to your **Trimble R780** via Bluetooth
3. Enable **Mock Location Provider** in TMM settings:
   - TMM will provide the R780 position as Android system location
   - This allows ANY app (including Chrome) to read Trimble position via `navigator.geolocation`

### 3. Verify TMM is Providing Location

Quick test to verify TMM is working:

```javascript
// Open Chrome on your phone
// Paste this in the address bar (or via chrome://inspect from desktop)
javascript:navigator.geolocation.getCurrentPosition(
  p => alert(`Lat: ${p.coords.latitude}\nLon: ${p.coords.longitude}\nAcc: ${p.coords.accuracy}m`),
  e => alert('Error: ' + e.message),
  { enableHighAccuracy: true, maximumAge: 0 }
);
```

**Expected Result**: You should see Trimble R780 coordinates (NOT phone GPS)

---

## Testing with Manholes Mapper PWA

### 4. Open PWA and Grant Location Permission

1. Open **Chrome** on your Galaxy Note 10
2. Navigate to your PWA URL:
   - **Local**: `http://192.168.x.x:5173` (find IP with `ipconfig`)
   - **Deployed**: Your production URL
3. When prompted, tap **"Allow"** for location access

### 5. Enable User Location Tracking

In the PWA:
1. Look for the **📍 User Location button** (desktop) or **Mobile User Location button** (mobile menu)
2. Tap/click the button to enable tracking
3. You should see a **blue pulsing marker** appear on the map at your Trimble position

### 6. Monitor Position Updates

Open Chrome DevTools via desktop:
1. On desktop Chrome, navigate to `chrome://inspect`
2. Connect your phone via USB
3. Click **Inspect** on your PWA tab
4. In Console, run:

```javascript
// Watch live position updates
navigator.geolocation.watchPosition(
  (position) => {
    console.log({
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,  // meters
      timestamp: new Date(position.timestamp).toISOString()
    });
  },
  (error) => console.error(error),
  { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
);
```

---

## Verification Checklist

Check that the following works:

- [ ] **TMM Mock Location Active**: Android system location shows Trimble position
- [ ] **Chrome Permission Granted**: PWA has location access
- [ ] **Blue Marker Visible**: User location marker appears on canvas
- [ ] **Position Updates**: Marker moves when you walk with the Trimble
- [ ] **Accuracy Circle**: Accuracy radius displayed around marker
- [ ] **High Accuracy Mode**: `position.coords.accuracy` shows Trimble-level accuracy (< 1m for RTK)
- [ ] **Altitude Data**: `position.coords.altitude` is populated
- [ ] **No Errors**: No console errors related to geolocation

---

## Expected Behavior

### Current PWA Implementation

The existing [user-location.js](src/map/user-location.js) will automatically:

1. **Read Trimble position** via `navigator.geolocation.watchPosition()`
2. **Convert WGS84 → ITM** for map alignment
3. **Draw blue pulsing marker** with accuracy circle
4. **Update every 1 second** (MIN_UPDATE_INTERVAL)
5. **Show heading arrow** if moving (using `position.coords.heading`)

### Location Options Already Configured

```javascript
// From user-location.js line 17-21
const LOCATION_OPTIONS = {
  enableHighAccuracy: true,  // ✅ Reads Trimble via TMM
  timeout: 10000,
  maximumAge: 5000
};
```

---

## Troubleshooting

### Issue: Position shows phone GPS, not Trimble

**Solution**:
- Verify TMM "Mock Location Provider" is enabled
- Check TMM is connected to R780 (green status)
- Go to Android **Settings** → **Location** → **Location Services**
- Ensure TMM is listed as location provider

### Issue: Location permission denied

**Solution**:
- Chrome → Settings → Site Settings → Location
- Find your PWA domain
- Set to "Allow"

### Issue: Accuracy is poor (> 10m)

**Solution**:
- Check Trimble R780 fix quality in TMM
- Ensure RTK corrections are active
- Verify `enableHighAccuracy: true` is working (check console)

### Issue: No marker appears on map

**Solution**:
- Check console for errors (`F12` → Console)
- Verify map has loaded (Esri tiles visible)
- Ensure you clicked the User Location button
- Check if position is valid: `window.getCurrentPosition()` in console

---

## Next Steps After Testing

Once you verify TMM works with the current implementation, we can:

### Phase 1: Enhanced Position Display
- [ ] Add real-time position info panel (lat, lon, altitude, accuracy)
- [ ] Show fix type indicator (GPS, DGPS, RTK)
- [ ] Add timestamp display

### Phase 2: Survey Features
- [ ] Add "Capture Point" button to save Trimble position to a node
- [ ] Store altitude and accuracy metadata
- [ ] Show captured points with green markers

### Phase 3: Advanced Integration
- [ ] Integrate with existing GNSS capture dialog
- [ ] Auto-populate node coordinates from browser geolocation
- [ ] Add CSV export with Trimble metadata

---

## Developer Testing (Without Trimble)

If you don't have access to Trimble hardware, you can test with mock coordinates:

```javascript
// In browser console
// Monkey-patch getCurrentPosition to return mock Trimble data
const mockTrimblePosition = {
  coords: {
    latitude: 32.0853,   // Tel Aviv area
    longitude: 34.7818,
    altitude: 25.3,
    accuracy: 0.8,       // RTK-level accuracy
    heading: 45,
    speed: 0.5
  },
  timestamp: Date.now()
};

// Override geolocation
const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
navigator.geolocation.getCurrentPosition = function(success, error, options) {
  success(mockTrimblePosition);
};

// Then click User Location button in PWA
```

---

## Technical Details

### Data Flow with TMM

```
Trimble R780 (RTK Receiver)
    ↓ Bluetooth
Trimble Mobile Manager (TMM)
    ↓ Mock Location Provider
Android System Location Service
    ↓ navigator.geolocation API
Chrome Browser
    ↓ watchPosition callback
PWA user-location.js
    ↓ WGS84 → ITM conversion
Canvas Marker Renderer
```

### Position Data Structure

```javascript
{
  coords: {
    latitude: 32.0853,        // WGS84 decimal degrees
    longitude: 34.7818,       // WGS84 decimal degrees
    altitude: 25.3,           // meters above sea level
    accuracy: 0.8,            // horizontal accuracy (meters)
    altitudeAccuracy: null,   // may be null
    heading: 45,              // degrees true north (0-360)
    speed: 0.5                // meters per second
  },
  timestamp: 1708073234000    // milliseconds since epoch
}
```

---

## References

- [user-location.js](src/map/user-location.js) - Browser geolocation implementation
- [Geolocation API Spec](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [Trimble Mobile Manager Documentation](https://geospatial.trimble.com/products-and-solutions/trimble-mobile-manager)

---

## Support

If you encounter issues:
1. Check console for errors
2. Verify TMM connection to R780
3. Test with the simple JavaScript snippet first
4. Report issues with console logs and screenshots
