# Grok Band v14.5 · 2026-11-05

## Changes in this release

### 1. Fixed WAV/Export Download
- Hardened download mechanism with improved blob URL handling
- Extended revoke timeout to 8 seconds (up from 4) for better reliability
- Added proper error handling and fallback cleanup
- Improved status messages: "Rendering mix…" → "Downloading…" → "Download ready"
- Status message clears automatically after 3 seconds

### 2. Added Swing/Shuffle Feature
- New SWING knob in master panel (50-75%)
- 50% = straight 16th notes (no swing)
- Higher values delay off-beat 16th notes for shuffle feel
- Applies to all drum tracks with ratio 2x or 4x
- Deterministic timing: export WAV matches live playback
- Independent from JITTER (random humanization)

## Technical Details

### Swing Implementation
The swing delay is calculated as:
```
swingDelay = (swing% - 0.5) × 2 / (ratio × 2)
```

Applied only to odd sub-hits (k=1, k=3) when ratio ≥ 2.

### Download Improvements
- Display:none on anchor element
- Longer cleanup timeout for slower systems
- Try-catch blocks prevent silent failures
- Clear user feedback via status messages

## Preserved Behavior
- Old saves load correctly
- All existing features unchanged
- Single-file HTML architecture maintained
- Compact UI fits 1280×720

## Files
- `index.html` - v14.5 with swing and export fixes
- `prev/index-v14.4.html` - Previous version backup
