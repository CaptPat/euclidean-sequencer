# Grok Band · Euclidean

A multi-track Euclidean rhythm sequencer **and synth workstation** in a single, dependency-free HTML file.

**Live:** https://captpat.github.io/euclidean-sequencer/

- 3 drum tracks (Kick, Snare, Hat) + 4 synth voices (Bass, Bell, Lead, Pad), each with its own HITS / STEPS (1-32) / ROTATE, so tracks of different lengths make polyrhythms.
- Bjorklund algorithm, rotary knobs (drag or mouse wheel), clickable step keys, animated circular visualizer.
- Fixed-height synth editor dock (click **SYNTH** on a voice or use the tabs): oscillator wave, unison/detune, filter cutoff/resonance/envelope amount, ADSR, gate length, one LFO (cutoff / pitch / volume), delay + reverb sends, octave and note range.
- Global **Key** and **Scale** (major, minor, dorian, phrygian, lydian, mixolydian, pentatonic, blues, harmonic minor). Euclidean hits play notes in key via note modes: Root, Up, Down, Ping-pong, Random, Chord, Riff.
- Web Audio with a look-ahead scheduler, master compressor + limiter + soft clip, tempo-synced delay, generated-impulse reverb.
- Presets: Four on floor, Tresillo, Dembow, Cinquillo, Bossa clave, Bembe bell, Electronic, Synthwave, Dorian Dream.

- **Arranger** (ARRANGE tab): capture the current state as a section, order sections into a song with repeat counts, and play **LOOP** (current section) or **SONG** (whole song, sample-accurate section changes). Section length can be N bars, N cycles of a chosen track, or a realigned LCM of the active tracks (capped). Drag blocks to reorder; DUP / REF / DEL (Ctrl+Z undo); per-section TEMPO. Autosaves to localStorage; SAVE / LOAD `.grokband.json`; DEMO builds an example song.
- Master volume in the header (synced with the master panel). Every knob is keyboard-focusable: arrows, +/-, Shift = 10%, PageUp/PageDown, Home/End.

Shortcuts: **Space** play/stop, **C** capture section, **U** update section, **[ ]** previous/next section, **Del** remove section, **Ctrl+Z** undo delete.

Inspired by the "Claudia Explains: Euclid" video by [@anabology](https://x.com/anabology) on X.
