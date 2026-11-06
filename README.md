# Grok Band · Euclidean

A multi-track Euclidean rhythm sequencer **and synth workstation** in a single, dependency-free HTML file.

**Live:** https://captpat.github.io/euclidean-sequencer/

- 4 drum tracks (Kick, Snare, Hat, Clave) + 5 synth voices (Bass, Bell, Lead, Pad, Keys), each with its own HITS / STEPS (1-32) / ROTATE, so tracks of different lengths make polyrhythms. Per-hit kit pick (Default / 808 / 909 / Linn); tight + wet snare; fitted kit recipes (v14.3).
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

## Rage / trap / Yeat-style toolkit (v10)

- **Presets** (top of the Presets menu): *Rage loop* (150 BPM, F# minor), *Dark bell* (140, C# minor), *Heavy 808 bounce* (140, F minor) and *Trap 140* (140, A minor). Each sets BPM, key, minor scale, Euclidean patterns for all 8 tracks including Clave, sounds, riff / power-chord modes, hat rolls, drive and ducking in one click.
- **Sounds**: the dock has a SOUND menu and engine select per synth. Engines: Synth, **808** (sine, pitch-drop PUNCH, GLIDE slides, mono choke, SUB layer one octave down) and **FM** (2-op bell with FM IDX and RATIO). Sound presets: Classic Bass, 808 Sub, 808 Distorted, Supersaw Lead, Soft Lead, Tubular Bell, Glass Bell, Dark Pad, Warm Pad. Bass and Bell are louder by default.
- **Tempo**: BPM 10-240 (default 140) with chips 90 / 120 / 140 / 150 / 160 and half / double.
- **Melody helpers**: note modes *Power* (root + 5th, follows the progression), *Power +8* (adds the octave) and *Minor riff* (riff degrees through the minor pentatonic). The rage presets turn on a minor bias for +KEY.
- **Drive**: per-synth DRIVE in the 808 group plus a master DRIVE (before the limiter, gain-compensated).
- **Hat rolls**: each drum has a x1 / x2 / x3 / x4 ratio button (top-right of its circle) and an F button (bottom-right) that fills the last 2 / 4 / 8 steps of the bar with rolls. Sample-accurate.
- **Master FX**: DUCK (sidechain-style ducking of the synths on every kick), CRUSH + RATE (bitcrusher; sample-rate reduction needs AudioWorklet, i.e. https or localhost), NOISE (hiss bed), momentary STUTTER 1/8 and 1/16 (loops the last slice, quantized to the next step) and a hold-to-sweep RISER.
- **Export** (song row): MIDI (SMF type 1, 480 PPQ, tempo map, drums on channel 10 with GM notes, one track per instrument), WAV mix (16-bit / 44.1 kHz, offline render) or a ZIP with the mix plus per-track stems, each for the whole song (sections x repeats once, outro included) or the current pattern. Stems skip the master compressor / drive / limiter so they sum back without clipping; the live STUTTER, RISER and hand-moved knobs are not recorded.
- The version number is shown bottom-right; the page asks for no-cache and reloads once if a newer version is deployed.

## NEW SONG (v10.1)

- **NEW SONG** (dice button on the SONG strip, or **Shift+R**) replaces the song with a generated arrangement. **ROLL** / **R** still only re-rolls the live loop. **UNDO** (or Ctrl+Z) brings the previous song back.
- The generator is **seeded**: the 6-character seed sits next to the button and is saved with the project. Type a seed and press Enter to reproduce a song exactly.
- It picks a style (weighted: Rage, Trap, House, Latin, Synthwave, Dorian chill), which sets BPM range, key/scale bias, sounds, drive/duck, hat rolls and groove ranges. One core groove is rolled for all tracks, then the sections are derived from it: Intro (pad + hat or bell, filtered), Main x2 (loop point), Chorus (lead and bell in, denser hats, maybe a different progression), Break (no kick/bass), Main 2 (Vary-style mutations of the core), optional second Chorus, Outro (stripped back, outro marker).
- Musicality: one riff motif is shared by lead, bell and bass across sections; pad, bass ("Chord root" mode) and lead follow one chord progression per song (the Chorus may switch).
- If the transport is running it restarts at the Intro, otherwise the Intro is selected and ready to play.

## Phrase mode + Import MIDI (v11.0)

- **Phrase** is a new mode for the four synth tracks (Lead/Bell/Pad/Bass). Instead of Euclidean hits and scale degrees, the track plays a stored note list (start step, length in 16ths, MIDI pitch, velocity). It loops at its own length (1-16 bars) and is saved with each section. A mini piano-roll replaces the hit ring and steps (the card layout does not change). Click an empty cell to add a note (drag for length), click a note to delete it, `-`/`+` set the bars, `x` goes back to Euclid. Switching to Phrase on an empty track bakes the current pattern into a 2-bar phrase.
- Section length modes "track" and "realign" use the phrase length. Dice, VARY and ROLL skip Phrase tracks.
- **Import MIDI...** (song row, next to Export, or drop a .mid on the page): reads SMF format 0/1 at any PPQN, with tempo changes. It lists each track/channel and auto-maps up to four melodic parts by register (highest = Lead, lowest = Bass; tracks named Lead/Bell/Pad/Bass keep their names). You can change the mapping. Notes are quantized to 16ths. Import into the current section, or as new sections split every N bars (tempo follows the file). Channel 10 drums map to kick/snare/hat/clave step patterns (GM notes). Undo restores the project.
- A Grok Band MIDI export imports back to the same notes (on a no-roll song; sub-step rolls quantize to 16ths). Limits: 4/4 bars only, SMPTE and format 2 files are rejected, drum patterns are approximated beyond 2 bars, notes crossing a section boundary are clipped.
- For scripts: `__gb.importApply(plan,{mode:'sections'|'current',n,useTempo,keepDrums})` takes a plan `{parts:[{target:'lead'|'bell'|'pad'|'bass'|'drums',notes:[{s,l,p,v}]}],bars,bpm,tempoAt,stepTicks}`; `keepDrums` leaves the current Euclid drums under the phrases.

## Drum kits (v12.0)

- **KIT** selector in the MASTER panel (next to RISER): **Default** (the original voices), **808**, **909**, **Linn**. All drum voices are synthesized in Web Audio, with no samples.
  - **808:** boomy sine kick with a ~0.9 s tail, snappy noise + tuned-body snare, metallic 6-square hats, sine clave, clap and cowbell.
  - **909:** punchy kick with a noise click and a fast pitch sweep through a tanh saturator, noisy snare plus body, hats from filtered + ring-modulated noise, 4-burst handclap, rim-style clave.
  - **Linn:** tight kick, gated snare with a short room, crisp hats, claps, woodblock clave and a cabasa-style shaker, all through an 8-bit staircase quantizer.
- The drum sound menus now also offer **clap**, **cowbell** and **shaker** (so the Clave track can be a clap or a cowbell in any kit).
- The kit is stored per drum track inside each section, so sections, saves, autosave and Undo carry it. The master selector sets all drum tracks (shows "Mixed" if sections/tracks differ). Old saves load as Default.
- Presets: Rage loop, Dark bell, Heavy 808 bounce, Trap 140 and Bembe bell use 808; Four on floor and Electronic use 909; Synthwave and Dorian Dream use Linn. NEW SONG: rage/trap/latin use 808 (trap puts a cowbell on the clave lane), house uses 909 (clap on the clave lane), synthwave and dorian chill use Linn.
- Also fixed: NEW SONG no longer inherits the previous song's bass/bell volumes, so the same seed always gives the same song.

## HUMANIZE (now JITTER) + built-in demos (v13.0)

- **HUMAN** slider (MASTER panel, default 15%, saved in the project; old saves get 15%): small per-hit jitter on drum hits. At 100%: timing 0-15 ms late (never early), pitch +/-40 cents, decay +/-20%, level +/-2 dB; everything scales with the slider. The jitter comes from a seeded PRNG keyed by song seed + track + step + sub-hit, so playback, WAV export and re-renders match (MIDI export stays on the grid). Noise, reverb IR and Random note mode are seeded as well.
- **DEMO** cycles through 20 built-in demos (the index is kept in localStorage, so a reload continues where you were): the original demo, 8 Bach-style chorales (DeepBach: S on Lead and an octave-up Bell, A+T on Pad, B on Bass, Euclidean drums underneath), 5 LLM-written songs (full saves) and 6 Anticipatory Music Transformer pieces (Phrase notes with Euclidean drums). The name and source tag show in the readout, with a short toast at the bottom. The data is gzip+base64 inside index.html (about 25 KB) and unpacked on the first DEMO press. The state you had is stored in `grokband.project.v1.backup` first.

## MIDI OUT (v14.0)

- **MIDI** button in the header (hidden where Web MIDI does not exist, e.g. Safari/iOS). Click it, press **Enable MIDI out** (the browser asks for access; no SysEx), then pick the output. A device named "Deluge" is picked automatically. Notes go out on the audio scheduler's timestamps (mapped onto the `performance.now()` timeline), so MIDI lines up with what you hear.
- Per track: channel (drums default to ch 10 with GM-style notes kick 36 / snare 38 / hat 42 / clave 75 / clap 39 / cowbell 56 / shaker 70; Bass 1, Bell 2, Lead 3, Pad 4 as in the MIDI export) and an **internal sound** checkbox, so a track can play on the device only. Internal sound is only muted while output is on and the device is present. WAV/stem export always renders the internal sound.
- Optional **clock** (24 ppqn, 6 per 16th) with Start before the first step and Stop on stop. Stop also sends note-offs and all-notes-off (CC 123) on all 16 channels. Phrase notes send their exact length and velocity; Euclid synth hits send the gate length. Humanize timing applies to drum notes.
- Settings are saved with the project (old saves keep the defaults above; loading a save without MIDI settings leaves your current routing alone).
- Limit: Web MIDI cannot cancel a note-off that is already queued, so a same-pitch note retriggered inside its own gate can be cut short by the older note-off.

Shortcuts: **Space** play/stop, **C** capture section, **U** update section, **[ ]** previous/next section, **Del** remove section, **R** roll all, **Shift+R** new song, **V** vary, **E** end, **Up/Down** section repeat, **Ctrl+Z** undo delete.

Inspired by the "Claudia Explains: Euclid" video by [@anabology](https://x.com/anabology) on X.

## v14.1 — Rhythm-guitar LEAD, and mute/solo that stays put

**LEAD is now a rhythm-guitar comping part.** The default Lead track plays the new **Rhythm Gtr** sound (saw + 2-voice unison, plucky filter envelope, low cutoff, short gate, no pitch LFO, light delay/reverb) in **Chord** mode, following the chord progression. Its default pattern is a sparse offbeat Euclidean part, and its default volume is half the old one (about -6 dB). Dice / ROLL ALL now roll sparse offbeat patterns for it, and ROLL ALL leaves an empty lead empty more often.

- **Sound menu:** *Rhythm Gtr* is a new preset (the old default lead is still there as *Soft Lead*; *Supersaw Lead* is unchanged).
- **NEW SONG:** the guitar comp is the lead in every style. About 45% of sections have no lead at all (Intro and Outro always, Main / Main 2 / Break some of the time). A bright arpeggio lead (Up or Ping-pong on Supersaw / Soft Lead) appears only occasionally, in about 30% of songs, and only in the Chorus.
- **Old saves, the baked LLM songs and the Bach / Anticipation / Original demos** keep their explicit lead sound, mode and volume; the *Synthwave* and *Dorian Dream* presets are pinned to *Soft Lead* for the same reason. Only a brand-new project gets the new defaults.

**Mute and solo are performance controls.** M / S on a track now belong to you, not to the section: changing section, looping the song, NEW SONG and presets no longer touch them, and the arrangement's section snapshots no longer store them (so they also no longer make the section's UPDATE button turn amber). Parts that a generated section leaves out are *content* (zero hits), not a mute. Projects saved before this change are converted on load: a muted track in a section becomes an empty part there, and a soloed track empties the others, so they sound the same as before. Loading a project or demo applies the mute/solo state that was saved with it.

**Drum kit snare fixes (also v14.1).**
- *Linn* snare reworked: a tuned two-sine body (about 190 Hz + 330 Hz, fast pitch drop, more level), a shorter (~120 ms) and darker noise burst (band-pass ~2.2 kHz + low-pass 7 kHz, no high-pass hiss) and a short early-reflection room for the 80s crack. Energy above 8 kHz dropped from about 21% to about 1%.
- *909* snare keeps its character; it just gets a modest reverb send (about 0.27 on noise and body) and a short room.
- *808* snare: the noise tail is tighter (about 150 ms) and its reverb send is lower. The "dribble" between hits came from a roll **fill** on the snare (F2 repeats the last two steps of every bar), set by the *Rage loop* preset and by NEW SONG's Rage style. Neither sets a snare fill any more. NEW SONG only rarely puts one on the Break's snare, and you can still switch it on with the F button.

**Metallic hats / cymbals (also v14.1).** Every kit's hat is now built like an 808 cymbal bank: six square oscillators at inharmonic frequencies (205.3, 304.4, 369.6, 522.7, 540, 800 Hz, scaled up for the brighter 909 and Linn), plus a ring-modulated pair for extra clang and a little noise sizzle, summed into a ~7 kHz high-pass and ~10 kHz band-pass. The closed hat decays in about 40-60 ms. There is a new **open hat** drum sound (about 300-450 ms of ring, MIDI note 46) in every track's sound menu, so you can set the Clave track, or any drum track, to *open hat*. A closed hat (or a new open hat) on any track chokes a ringing open hat within about 12 ms. Generated songs don't use the open hat yet, so pick it on a track to hear it.

## v14.2 — master volume is yours

The master VOLUME (header slider and master knob) is a personal setting kept in this browser's localStorage under its own key. Loading a demo (DEMO), a preset, a project file, an autosave, undo, NEW SONG, ROLL, or changing section never reads or changes it, and projects no longer save it (a volume stored in an older file is ignored). The first run after this update picks up the volume from your previous autosave once.

The header now shows the version (small, bottom right of the title) and the **currently loaded song** under "GROK BAND": a demo as "Bach · F major pastoral" / "LLM · dark-trap-150" / "Anticipation · …", a generated one as "NEW · seed · style", a file as "File · name", a MIDI import as "Import · name", otherwise "Project". It has a fixed width with an ellipsis (full text on hover), so nothing moves. The DEMO button's tooltip reads "Now: X — Next: Y". The label is saved with the project.

The HUMANIZE knob is renamed **JITTER** ("Per-hit seeded random variation in timing, pitch, decay, level"). It is the same control: the saved-state key (`master.hum`) is unchanged, so old saves and the demos load exactly as before.
