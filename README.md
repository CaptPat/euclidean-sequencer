# Grok Band · Euclidean

A multi-track Euclidean rhythm sequencer **and synth workstation** in a single, dependency-free HTML file.

**Live:** https://captpat.github.io/euclidean-sequencer/

- 4 drum tracks (Kick, Snare, Hat, Clave) + 4 synth voices (Bass, Bell, Lead, Pad), each with its own HITS / STEPS (1-32) / ROTATE, so tracks of different lengths make polyrhythms.
- Bjorklund algorithm, rotary knobs (drag or mouse wheel), clickable step keys, animated circular visualizer.
- Fixed-height synth editor dock below the tracks (click **SYNTH** on a voice or use the Bass/Bell/Lead/Pad tabs; the layout auto-scales to fill large screens): oscillator wave, unison/detune, filter cutoff/resonance/envelope amount, ADSR, gate length, one LFO (cutoff / pitch / volume), delay + reverb sends, octave and note range.
- Global **Key** and **Scale** (major, minor, dorian, phrygian, lydian, mixolydian, pentatonic, blues, harmonic minor). Euclidean hits play notes in key via note modes: Root, Up, Down, Ping-pong, Random, Chord, Riff.
- Web Audio with a look-ahead scheduler, master compressor + limiter + soft clip, tempo-synced delay, generated-impulse reverb.
- Presets: Four on floor, Tresillo, Dembow, Cinquillo, Bossa clave (both use the real Clave track), Bembe bell, Electronic, Synthwave, Dorian Dream.

- **Arranger** (always-visible SONG strip above the tracks): capture the current state as a section, order sections into a song with repeat counts, and play **LOOP** (current section) or **SONG** (whole song, sample-accurate section changes). Section length can be N bars, N cycles of a chosen track, or a realigned LCM of the active tracks (capped). Drag blocks to reorder; DUP / REF / DEL (Ctrl+Z undo); per-section TEMPO. Autosaves to localStorage; SAVE / LOAD `.grokband.json`; DEMO builds an example song.
- Master volume in the header (synced with the master panel). Every knob is keyboard-focusable: arrows, +/-, Shift = 10%, PageUp/PageDown, Home/End.

- **Dice / composing**: a small dice on every track rolls hits / steps / rotate in musical ranges for that instrument (kick 2-5 of 16, hat dense, ...) and, for synths, a fresh riff. **ROLL** in the header rolls every track (empty tracks sometimes join in); **+KEY** also rolls key and scale. Riffs are generated, never fixed: a seeded scale random walk (4-8 notes) biased to the root and the 5th, stored per track in the project. The HARMONY group in the synth dock rerolls / resizes the riff and picks the chord progression (I-V-vi-IV, i-VI-III-VII, ii-V-I, I-IV-V-iii) and whether chords change per bar or per hit.
- **VARY** copies the selected section with small mutations (rotate, +/-1 hit, riff note or octave tweak) as a new section.
- **Song repeats**: every section has a x N badge (click / scroll / arrow keys; Shift- or right-click = fewer). **LOOP FROM** marks where the song loops back to, **OUTRO** marks the section(s) that play once at the end, and **END** (song mode) finishes the current pass, plays the outro once and stops. Without END the song runs to the end of the body and returns to the loop marker (or the start). The DEMO is Intro x1, Main x2 (loop), Chorus, Break, Main, Outro.

Shortcuts: **Space** play/stop, **C** capture section, **U** update section, **[ ]** previous/next section, **Del** remove section, **R** roll all, **V** vary, **E** end, **Up/Down** section repeat, **Ctrl+Z** undo delete.

Inspired by the "Claudia Explains: Euclid" video by [@anabology](https://x.com/anabology) on X.
