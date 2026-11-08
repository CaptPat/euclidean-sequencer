// Repeatable regression for v14.24 in-song composing.
// Usage: node tests/compose-regression.mjs
// Headless Chrome drives index.html. Assertions use scheduler state, drafts,
// and MIDI bytes. This does not listen to the audio.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'));
const shots = process.env.SHOT_DIR || '/tmp/gb-shots';

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;
const profile = mkdtempSync(join(tmpdir(), 'gb-chrome-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1280,720',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let dbg = '';
chrome.stderr.on('data', d => { dbg += d.toString(); });
const wsUrl = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('chrome debug port timeout\n' + dbg)), 20000);
  const tick = () => {
    const m = dbg.match(/DevTools listening on (ws:\S+)/);
    if (m) { clearTimeout(t); resolve(m[1]); return; }
    setTimeout(tick, 50);
  };
  tick();
});
const browser = new WebSocket(wsUrl);
await new Promise((res, rej) => { browser.onopen = res; browser.onerror = rej; });
let seq = 0;
const pending = new Map();
browser.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};
function send(method, params = {}, sessionId) {
  const id = ++seq;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  browser.send(JSON.stringify(payload));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const created = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url }, sessionId);
for (let i = 0; i < 80; i++) {
  const r = await send('Runtime.evaluate', { expression: '!!(window.__gb && window.__gb.tracks)', returnByValue: true }, sessionId);
  if (r.result && r.result.value) break;
  if (i === 79) throw new Error('page did not boot');
  await new Promise(res => setTimeout(res, 100));
}

async function ev(expression) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error((d.exception && d.exception.description) || d.text || JSON.stringify(d));
  }
  return r.result.value;
}

let report;
try {
report = await ev(`
const gb = window.__gb;
window.alert = (m) => { (window.__alerts = window.__alerts || []).push(String(m)); };
window.__noDownload = true;
const fails = [];
const ok = (name, cond, extra) => { if (!cond) fails.push(name + (extra ? ' :: ' + extra : '')); };
const bass = () => gb.tracks().find(t => t.id === 'bass');
const hat = () => gb.tracks().find(t => t.id === 'hat');
const phraseOf = tr => tr.phrase && tr.phrase.notes ? tr.phrase.notes.map(n => n.p + ':' + (n.sl || 0)).join(',') : '';
const song = () => gb.songRef();
const secs = () => gb.secsRef();
const bassOf = st => st.tracks.find(t => t.id === 'bass');

gb.tracks().forEach(t => { if (t.drum) t.set(t.id === 'kick' ? 4 : 0, 16, 0); else t.set(0, 16, 0); });
const b0 = bass();
gb.setTrMode(b0, 'Phrase');
b0.phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 40, v: 100, sl: 1 }, { s: 8, l: 2, p: 43, v: 90, sl: 0 }] });
b0.syn = { ...b0.syn, cut: 40 };
hat().pitch = 0;
gb.capture(); gb.capture(); gb.capture(); gb.capture();
ok('four sections', song().length === 4, String(song().length));
const idAt = i => song()[i].sec;
const A = idAt(0), B = idAt(1), C = idAt(2), D = idAt(3);

const commit = (i, note) => {
  gb.selectEntry(i);
  bass().phrase = gb.cleanPhrase(note.ph);
  bass().syn.cut = note.cut;
  hat().pitch = note.pitch;
  gb.updateSec();
  ok('clean right after update ' + i, !gb.secDirty(secs()[song()[i].sec], gb.snapshot()));
};
commit(0, { ph: { len: 1, notes: [{ s: 0, l: 4, p: 40, v: 110, sl: 1 }] }, cut: 33, pitch: 1 });
commit(1, { ph: { len: 1, notes: [{ s: 0, l: 4, p: 48, v: 100, sl: 0 }] }, cut: 60, pitch: 0 });
commit(2, { ph: { len: 1, notes: [{ s: 0, l: 2, p: 52, v: 80, sl: 1 }] }, cut: 70, pitch: 2 });
commit(3, { ph: { len: 1, notes: [{ s: 0, l: 2, p: 55, v: 80, sl: 0 }] }, cut: 80, pitch: -1 });
gb.selectEntry(0);
ok('still clean after reopening A', !gb.secDirty(secs()[A], gb.snapshot()));

bass().phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 41, v: 100, sl: 1 }, { s: 4, l: 3, p: 46, v: 90, sl: 1 }] });
bass().syn.cut = 17;
hat().pitch = -2;
const edited = phraseOf(bass());
ok('dirty before transport', gb.secDirty(secs()[A], gb.snapshot()));
gb.setMode('song');
gb.arr.mode = 'song';
gb.arr.free = false;
for (const idx of [1, 2, 3, 0, 2]) gb.enter(0, idx, 0);
ok('phrase survives boundaries', phraseOf(bass()) === edited, phraseOf(bass()));
ok('cutoff survives boundaries', bass().syn.cut === 17, String(bass().syn.cut));
ok('hat tune survives boundaries', hat().pitch === -2, String(hat().pitch));
ok('edit focus stays on A', gb.selRef() === 0, String(gb.selRef()));
ok('playhead is last enter', gb.arr.idx === 2, String(gb.arr.idx));
ok('other section uses play views', Array.isArray(gb.playViewsRef()) && gb.playViewsRef().length === 14);
const pv = gb.playViewsRef()[gb.tracks().indexOf(bass())];
ok('heard phrase is section C', pv && pv.phrase && pv.phrase.notes[0].p === 52, pv && pv.phrase && String(pv.phrase.notes[0].p));
ok('heard slide is section C', pv && pv.phrase && pv.phrase.notes[0].sl === 1);
ok('A was not silently committed', bassOf(secs()[A].state).phrase.notes[0].p === 40);
gb.stashEdit();
ok('A draft keeps the edit', bassOf(secs()[A].draft).phrase.notes[0].p === 41 && bassOf(secs()[A].draft).syn.cut === 17);

if (!gb.ac()) gb.build(new AudioContext());
gb.arr.mode = 'song';
gb.arr.free = false;
gb.arr.halt = false;
gb.enter(gb.ac().currentTime, 1, 0);
const lenB = gb.arr.len;
let threw = '';
try { for (let i = 0; i < lenB + 3; i++) gb.stepPlay(gb.ac().currentTime + i * 0.02); }
catch (e) { threw = String(e && e.message || e); }
ok('scheduler crossed a boundary', !threw, threw);
ok('scheduler left the editor alone', phraseOf(bass()) === edited && bass().syn.cut === 17 && hat().pitch === -2 && gb.selRef() === 0);
ok('scheduler moved the playhead', gb.arr.idx !== 1 || gb.arr.step > 1, 'idx ' + gb.arr.idx + ' step ' + gb.arr.step);

gb.view.idx = 3; gb.view.active = true; gb.view.rep = 0; gb.view.step = 4; gb.view.len = 16;
gb.status('');
gb.onView();
ok('onView does not move selection', gb.selRef() === 0);
const ro = gb.readoutText();
ok('readout names edit and hear', ro.includes('EDIT ') && ro.includes('HEAR '), ro);

gb.selectEntry(1);
ok('section B loaded', phraseOf(bass()).startsWith('48:'));
ok('A draft survived the switch', bassOf(secs()[A].draft).syn.cut === 17 && bassOf(secs()[A].draft).phrase.notes[0].sl === 1);
gb.selectEntry(0);
ok('draft restored before UPDATE', phraseOf(bass()) === edited && bass().syn.cut === 17 && hat().pitch === -2);

gb.enter(0, 2, 0);
gb.updateSec();
ok('UPDATE writes the edit focus', bassOf(secs()[A].state).phrase.notes[0].p === 41 && bassOf(secs()[A].state).syn.cut === 17 && !secs()[A].draft);
ok('UPDATE ignores the heard section', bassOf(secs()[C].state).phrase.notes[0].p === 52);
ok('clean after UPDATE', !gb.secDirty(secs()[A], gb.snapshot()));

bass().phrase.notes[0].p = 99;
gb.stashEdit();
ok('dirty after a tweak', gb.secDirty(secs()[A], gb.snapshot()));
gb.revertEdits();
ok('REVERT restores the saved pitch', bass().phrase.notes[0].p === 41 && !secs()[A].draft);
ok('clean after REVERT', !gb.secDirty(secs()[A], gb.snapshot()));

bass().syn.cut = 21;
gb.capture();
const capId = song()[gb.selRef()].sec;
ok('CAPTURE is a new section', capId !== A && bassOf(secs()[capId].state).syn.cut === 21);
const nBeforeDup = song().length;
gb.dupSec();
ok('DUP adds one section', song().length === nBeforeDup + 1);
const dupId = song()[gb.selRef()].sec;
ok('DUP is an independent id', dupId !== capId);
bass().phrase.notes[0].p = 70;
bass().syn.cut = 9;
gb.updateSec();
ok('DUP update does not change its source', bassOf(secs()[capId].state).phrase.notes[0].p !== 70 && bassOf(secs()[capId].state).syn.cut === 21);
ok('DUP itself took the update', bassOf(secs()[dupId].state).phrase.notes[0].p === 70 && bassOf(secs()[dupId].state).syn.cut === 9);

const beforeRef = gb.selRef();
gb.refSec();
ok('REF shares the id', song()[gb.selRef()].sec === dupId && gb.selRef() !== beforeRef);
ok('two REFs', song().filter(e => e.sec === dupId).length === 2);
bass().syn.cut = 44;
gb.updateSec();
ok('both REFs share the commit', song().filter(e => e.sec === dupId).every(() => bassOf(secs()[dupId].state).syn.cut === 44));

gb.selectEntry(0);
bass().syn.cut = 11;
gb.stashEdit();
gb.selectEntry(1);
bass().syn.cut = 12;
gb.stashEdit();
gb.selectEntry(0);
gb.armRange(0, 2);
ok('range armed', gb.rangeRef().on && gb.rangeRef().lo === 0 && gb.rangeRef().hi === 2);
ok('range wraps inside the span', gb.nextPos(2, 0, false).i === 0);
ok('range ignores END', gb.nextPos(2, 0, true).i === 0);
ok('section 0 draft held', bassOf(secs()[song()[0].sec].draft).syn.cut === 11);
ok('section 1 draft held', bassOf(secs()[song()[1].sec].draft).syn.cut === 12);
gb.enter(0, 1, 0);
ok('playhead move does not retarget the edit', gb.selRef() === 0 && bass().syn.cut === 11);
ok('hearing another section uses views', Array.isArray(gb.playViewsRef()));
gb.enter(0, 0, 0);
ok('hearing the edit section uses the editor', gb.playViewsRef() == null && bass().syn.cut === 11);

gb.setMode('loop');
bass().syn.cut = 13;
gb.setMode('song');
ok('mode switch keeps the edit', bass().syn.cut === 13 && gb.selRef() === 0);
gb.setRep(1, 3);
ok('repeat stays on that section', JSON.stringify(gb.nextPos(1, 1, false)) === JSON.stringify({ i: 1, r: 2 }));
const playBtn = document.querySelector('#play');
if (!playBtn.classList.contains('on')) playBtn.click();
ok('transport started', playBtn.classList.contains('on'));
const cutWhilePlaying = bass().syn.cut;
playBtn.click();
ok('stop does not reload the editor', bass().syn.cut === cutWhilePlaying && gb.selRef() === 0 && !playBtn.classList.contains('on'));

gb.clearRange();
if (!song().some(e => e.outro)) song()[song().length - 1].outro = true;
const ts = gb.tailStart();
const body = Math.max(0, ts - 1);
gb.arr.mode = 'song';
gb.arr.ending = true;
const ended = gb.nextPos(body, song()[body].rep - 1, true);
ok('END still reaches the outro', ended && ended.i === ts, JSON.stringify(ended));
gb.arr.ending = false;

const doomed = gb.selRef();
gb.selectEntry(1);
const draftA = bassOf(secs()[song()[0].sec].draft).syn.cut;
gb.delEntry();
ok('delete removes one entry', !song()[doomed] || song().length > 0);
gb.undo();
ok('undo delete restores the draft on A', bassOf(secs()[song()[0].sec].draft).syn.cut === draftA);
gb.armRange(0, 1);
gb.moveEntry(1, 3);
ok('reorder clears the range', !gb.rangeRef().on);
ok('reorder keeps A draft', bassOf(secs()[A].draft).syn.cut === draftA);

const phraseBefore = phraseOf(bass());
const cutBefore = bass().syn.cut;
const nBefore = song().length;
const selBefore = gb.selRef();
const refCount = song().filter(e => e.sec === dupId).length;
gb.arr.mode = 'song';
gb.arr.free = false;
if (!playBtn.classList.contains('on')) playBtn.click();
ok('playing before clear', playBtn.classList.contains('on'));
gb.clearTimeline();
ok('clear empties the song', song().length === 0 && Object.keys(secs()).length === 0);
ok('clear keeps the live phrase', phraseOf(bass()) === phraseBefore);
ok('clear loops the live pattern', gb.arr.mode === 'loop' && gb.arr.free === true);
ok('clear keeps the audible cutoff', bass().syn.cut === cutBefore, String(bass().syn.cut) + ' vs ' + cutBefore);
const stackAfter = gb.undoRef().length;
gb.clearTimeline();
ok('empty clear is idempotent', gb.undoRef().length === stackAfter && song().length === 0);
gb.undo();
ok('undo restores the song', song().length === nBefore, String(song().length));
ok('undo restores REFs', song().filter(e => e.sec === dupId).length === refCount, String(song().filter(e => e.sec === dupId).length));
ok('undo restores the selection', gb.selRef() === selBefore, String(gb.selRef()) + ' vs ' + selBefore);
if (playBtn.classList.contains('on')) playBtn.click();

const old = JSON.parse(JSON.stringify(gb.project()));
old.sections.forEach(s => { delete s.draft; });
delete old.rangeLo; delete old.rangeHi;
const marker = old.sections.find(s => s.id === A).state.tracks.find(t => t.id === 'bass').phrase.notes[0].p;
gb.restore(old);
ok('old save loads', gb.songRef().length === old.song.length);
ok('old save has no draft on A', !gb.secsRef()[A].draft);
ok('old phrase is present', bass().phrase.notes[0].p === marker, String(bass().phrase.notes[0].p) + ' vs ' + marker);
bass().syn.cut = 19;
bass().phrase.notes[0].sl = 1;
gb.stashEdit();
const packed = JSON.parse(JSON.stringify(gb.project()));
ok('save file contains a draft', !!packed.sections.find(s => s.draft));
ok('save file contains the range fields', 'rangeLo' in packed && 'rangeHi' in packed);
gb.restore(packed);
ok('reloaded draft is what you hear', bass().syn.cut === 19 && bass().phrase.notes[0].sl === 1);
ok('reloaded draft stays on the section', gb.secsRef()[gb.songRef()[gb.selRef()].sec].draft.tracks.find(t => t.id === 'bass').syn.cut === 19);

bass().phrase.notes[0].p = 77;
bass().phrase.notes[0].sl = 1;
const heard = [];
const editorCut = bass().syn.cut;
gb.walkPlan(true, { now: () => 0, step: (s) => {
  gb.tracks().forEach(tr => {
    if (!tr.drum && tr.mode === 'Phrase') {
      const ns = gb.phraseAt(tr, s);
      if (ns) ns.forEach(n => heard.push(tr.id + ':' + n.p + ':' + (n.sl || 0)));
    }
  });
}});
ok('song export walk hears the draft', heard.some(x => x.startsWith('bass:77:1')), heard.filter(x => x.startsWith('bass:')).slice(0, 6).join('|'));
ok('walk restores the editor', bass().syn.cut === editorCut && bass().phrase.notes[0].p === 77);
const mid = await gb.buildMidi(true);
const bytes = new Uint8Array(await mid.arrayBuffer());
ok('midi export blob', mid && mid.size > 100, String(mid && mid.size));
let note77 = false;
for (let i = 0; i < bytes.length - 1; i++) if ((bytes[i] & 0xF0) === 0x90 && bytes[i + 1] === 77) note77 = true;
ok('midi contains drafted pitch 77', note77);
const wav = gb.wavBytes(await gb.renderAudio(false, -1));
ok('pattern wav header', wav[0] === 82 && wav[1] === 73 && wav[2] === 70 && wav[3] === 70 && wav.length > 1000, String(wav.length));
ok('record control still present', typeof gb.startLiveRec === 'function' && !!document.querySelector('.rec') && typeof MediaRecorder === 'function');

// --- review blockers: real handlers, no manual stash and no wait ---
gb.clearTimeline();
gb.setBpm(120);
const bA = bass();
gb.setTrMode(bA, 'Phrase');
bA.phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 40, v: 100, sl: 1 }] });
bA.syn.cut = 30; bA.syn.dly = 0; bA.syn.rev = 0;
document.querySelector('#song .cap').click();
gb.secsRef()[gb.songRef()[0].sec].name = 'A';
gb.secsRef()[gb.songRef()[0].sec].len.bars = 1;
document.querySelector('#song .tempo').click();
gb.setBpm(100);
bA.phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 48, v: 90, sl: 0 }] });
bA.syn.cut = 50; bA.syn.dly = 100;
document.querySelector('#song .cap').click();
gb.secsRef()[gb.songRef()[gb.selRef()].sec].len.bars = 1;
gb.secsRef()[gb.songRef()[gb.selRef()].sec].name = 'B';
bA.phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 52, v: 80, sl: 0 }] });
bA.syn.cut = 60; bA.syn.dly = 0;
document.querySelector('#song .cap').click();
gb.secsRef()[gb.songRef()[gb.selRef()].sec].len.bars = 1;
gb.secsRef()[gb.songRef()[gb.selRef()].sec].name = 'C';
const idOf = nm => gb.songRef().find(e => gb.secsRef()[e.sec].name === nm).sec;
const idxOf = nm => gb.songRef().findIndex(e => gb.secsRef()[e.sec].name === nm);
ok('tempo button armed A only', gb.secsRef()[idOf('A')].useBpm && gb.secsRef()[idOf('A')].state.bpm === 120 && !gb.secsRef()[idOf('B')].useBpm && gb.G.bpm === 100, String(gb.G.bpm));

// 4 + 5. while C is open, export immediately and compare live tempos for a section that is not outlined.
bass().phrase.notes[0].p = 79;
bass().phrase.notes[0].sl = 1;
const exp = document.querySelector('#song .exp');
let exportJob = null;
const prevExp = exp.onchange;
exp.onchange = (e) => { const v = e.target.value; e.target.value = ''; if (v) exportJob = gb.doExport(v); };
exp.value = 'mid-song';
exp.dispatchEvent(new Event('change'));
const exported = await exportJob;
exp.onchange = prevExp;
const midBytes = new Uint8Array(await exported.blob.arrayBuffer());
let saw79 = false;
for (let i = 0; i < midBytes.length - 1; i++) if ((midBytes[i] & 0xF0) === 0x90 && midBytes[i + 1] === 79) saw79 = true;
ok('export handler contains the unstashed pitch', saw79);
ok('export restored the editor and the song tempo', bass().phrase.notes[0].p === 79 && gb.G.bpm === 100, String(gb.G.bpm));
const tempos = [];
for (let i = 0; i < midBytes.length - 5; i++) if (midBytes[i] === 0xFF && midBytes[i + 1] === 0x51 && midBytes[i + 2] === 0x03) tempos.push(Math.round(60000000 / ((midBytes[i + 3] << 16) | (midBytes[i + 4] << 8) | midBytes[i + 5])));
ok('export tempos are A then the song tempo', tempos[0] === 120 && tempos.includes(100) && tempos[tempos.length - 1] === 100, tempos.join(','));
gb.arr.mode = 'song';
gb.enter(0, idxOf('A'), 0);
ok('live A uses its own tempo', gb.playMetaRef() && gb.playMetaRef().bpm === 120 && Math.abs(gb.stepDur() - 60 / 120 / 4) < 1e-9, JSON.stringify(gb.playMetaRef()));
gb.enter(0, idxOf('B'), 0);
ok('live B stays on the song tempo', (!gb.playMetaRef() || !gb.playMetaRef().bpm) && Math.abs(gb.stepDur() - 60 / 100 / 4) < 1e-9 && gb.G.bpm === 100, JSON.stringify(gb.playMetaRef()));

// 1. drag an unselected block; edit focus stays, and that block does not absorb the open edit
gb.selectEntry(idxOf('A'));
bass().phrase.notes[0].p = 41;
bass().syn.cut = 17;
const blocks = () => [...document.querySelectorAll('#song .blk')];
const dragFrom = blocks()[idxOf('B')];
dragFrom.ondragstart({ dataTransfer: { setData(){}, effectAllowed: '' } });
const onto = blocks()[idxOf('C')];
const rect = onto.getBoundingClientRect();
onto.ondrop({ preventDefault(){}, clientX: rect.right - 1 });
dragFrom.ondragend();
ok('drag keeps the outlined section', gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'A', gb.secsRef()[gb.songRef()[gb.selRef()].sec].name);
ok('drag moved the unselected block', gb.songRef().map(e => gb.secsRef()[e.sec].name).join(',') === 'A,C,B', gb.songRef().map(e => gb.secsRef()[e.sec].name).join(','));
ok('open edit still in the editor after drag', bass().phrase.notes[0].p === 41 && bass().syn.cut === 17);
const dragA = blocks()[idxOf('A')];
dragA.ondragstart({ dataTransfer: { setData(){}, effectAllowed: '' } });
const land = blocks()[gb.songRef().length - 1];
const landRect = land.getBoundingClientRect();
land.ondrop({ preventDefault(){}, clientX: landRect.right - 1 });
dragA.ondragend();
ok('dragging the outlined block keeps that edit', gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'A' && bass().phrase.notes[0].p === 41 && bass().syn.cut === 17);
const bDraft = gb.secsRef()[idOf('B')].draft;
ok('dragged section did not take the open edit', (!bDraft || bDraft.tracks.find(t => t.id === 'bass').phrase.notes[0].p !== 41) && gb.secsRef()[idOf('B')].state.tracks.find(t => t.id === 'bass').phrase.notes[0].p === 48);

// 2. edit the section left open by delete, then Undo immediately
document.querySelector('#song .del').click();
const neighbor = gb.secsRef()[gb.songRef()[gb.selRef()].sec].name;
ok('delete left a neighbor open', neighbor !== 'A', neighbor);
bass().phrase.notes[0].p = 66;
bass().phrase.notes[0].sl = 1;
document.querySelector('#song .und').click();
const back = gb.secsRef()[idOf(neighbor)];
ok('undo kept the neighbor edit', back.draft && back.draft.tracks.find(t => t.id === 'bass').phrase.notes[0].p === 66 && back.draft.tracks.find(t => t.id === 'bass').phrase.notes[0].sl === 1, neighbor);
blocks().find(el => el.textContent.startsWith(neighbor)).click();
ok('clicking the neighbor shows that edit', bass().phrase.notes[0].p === 66 && bass().phrase.notes[0].sl === 1);

// 3. MIDI import into a dirty section replaces the working pattern and keeps an unrelated knob
blocks().find(el => el.textContent.startsWith('A')).click();
bass().syn.cut = 19;
bass().phrase.notes[0].p = 42;
gb.showImport({ fname: 't.mid', fmt: 0, ppqn: 480, bars: 1, bpm: 100, tempoAt: () => 100, stepTicks: 120, ts: '4/4', tempoChanges: 1, parts: [{ id: 0, name: 'bass', ch: 0, drum: false, notes: [{ s: 0, l: 4, p: 61, v: 90 }], count: 1, lo: 61, hi: 61, mean: 61, target: 'bass' }] });
const radios = [...document.querySelectorAll('#impd input[type=radio]')];
radios[1].click();
document.querySelector('#impd .go').click();
ok('import is what you hear', bass().phrase && bass().phrase.notes[0].p === 61, bass().phrase && String(bass().phrase.notes[0].p));
ok('import kept the uncommitted cutoff', bass().syn.cut === 19, String(bass().syn.cut));
ok('stale draft does not mask the import', gb.audibleState(gb.secsRef()[idOf('A')]).tracks.find(t => t.id === 'bass').phrase.notes[0].p === 61);
document.querySelector('#song .und').click();
ok('undo import restores the earlier phrase', bass().phrase.notes[0].p === 42 && bass().syn.cut === 19);

// 6. shared delay node follows each section, including a return to zero
['B', 'C'].forEach(nm => { const s = gb.secsRef()[idOf(nm)]; const st = s.draft || s.state; st.tracks.find(t => t.id === 'bass').syn.dly = nm === 'B' ? 100 : 0; });
if (!gb.ac()) gb.build(new AudioContext());
const node = bass().dS.gain;
const sent = [];
const origSet = node.setValueAtTime.bind(node);
node.setValueAtTime = (v, t) => { sent.push(Math.round(v * 1000) / 1000); return origSet(v, t); };
bass().syn.dly = 0; bass()._dly = 0;
gb.selectEntry(idxOf('A'));
gb.arr.mode = 'song';
gb.enter(gb.ac().currentTime, idxOf('B'), 0);
gb.stepPlay(gb.ac().currentTime);
gb.enter(gb.ac().currentTime, idxOf('C'), 0);
gb.stepPlay(gb.ac().currentTime + 0.05);
node.setValueAtTime = origSet;
ok('later section sets its own send', sent.includes(0.8) && sent.includes(0), sent.join(','));

// 7. clear holds is a no-op with nothing held, and does not drop phrase or hat edits when a hold exists
document.querySelector('#song .hclr').click();
gb.selectEntry(idxOf('A'));
const kick = gb.tracks().find(t => t.id === 'kick');
const patBit = kick.pat[0] ? 0 : 1;
kick.pat[0] = patBit;
bass().phrase.notes[0].p = 63;
bass().phrase.notes[0].sl = 1;
hat().pitch = 4;
bass().syn.cut = 21;
document.querySelector('#song .hclr').click();
ok('clear with no holds keeps working edits', bass().phrase.notes[0].p === 63 && bass().phrase.notes[0].sl === 1 && hat().pitch === 4 && bass().syn.cut === 21 && kick.pat[0] === patBit);
const modeBefore = bass().mode;
gb.setTrMode(bass(), 'Riff');
ok('mode hold is on', bass().mode === 'Riff' && modeBefore !== 'Riff');
bass().phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 64, v: 100, sl: 1 }] });
hat().pitch = -3;
document.querySelector('#song .hclr').click();
ok('clear holds keeps phrase slide hat tune pattern and cutoff', bass().phrase.notes[0].p === 64 && bass().phrase.notes[0].sl === 1 && hat().pitch === -3 && kick.pat[0] === patBit && bass().syn.cut === 21);
ok('clear holds releases the mode lock', bass().mode === modeBefore);

// --- selected TEMPO section, song tempo, DUP/VARY. Real play, slider, and buttons. No stash, no tick wait. ---
if (document.querySelector('#play').classList.contains('on')) document.querySelector('#play').click();
gb.clearTimeline();
const slide = (v) => { const el = document.querySelector('#bpm'); el.value = String(v); el.dispatchEvent(new Event('input')); };
slide(120);
document.querySelector('#song .cap').click();
gb.secsRef()[gb.songRef()[gb.selRef()].sec].name = 'TA';
gb.secsRef()[gb.songRef()[gb.selRef()].sec].len.bars = 1;
document.querySelector('#song .tempo').click();
slide(100);
document.querySelector('#song .cap').click();
gb.secsRef()[gb.songRef()[gb.selRef()].sec].name = 'TB';
gb.secsRef()[gb.songRef()[gb.selRef()].sec].len.bars = 1;
const tid = nm => gb.songRef().find(e => gb.secsRef()[e.sec].name === nm).sec;
const tix = nm => gb.songRef().findIndex(e => gb.secsRef()[e.sec].name === nm);
[...document.querySelectorAll('#song .blk')].find(el => el.textContent.startsWith('TA')).click();
ok('opening a TEMPO section leaves the song tempo', gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'TA' && gb.G.bpm === 100 && gb.secsRef()[tid('TA')].state.bpm === 120, String(gb.G.bpm));
bass().phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 71, v: 100, sl: 0 }] });
document.querySelector('#song .seg button[data-m=song]').click();
document.querySelector('#play').click();
ok('play captured the song tempo', gb.arr.baseBpm === 100 && gb.G.bpm === 100, String(gb.arr.baseBpm));
ok('selected TEMPO section plays at its stored BPM', gb.playMetaRef() && gb.playMetaRef().bpm === 120 && Math.abs(gb.stepDur() - 60 / 120 / 4) < 1e-9 && gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'TA', JSON.stringify(gb.playMetaRef()));
const aLen = gb.arr.len;
for (let i = 0; i < aLen; i++) gb.stepPlay(0);
gb.stepPlay(0);
ok('following TEMPO-off section keeps the song tempo', gb.arr.idx === tix('TB') && gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'TA' && (!gb.playMetaRef() || !gb.playMetaRef().bpm) && Math.abs(gb.stepDur() - 60 / 100 / 4) < 1e-9 && gb.G.bpm === 100, JSON.stringify(gb.playMetaRef()));
slide(90);
ok('slider retunes a TEMPO-off section immediately', gb.G.bpm === 90 && gb.arr.baseBpm === 90 && Math.abs(gb.stepDur() - 60 / 90 / 4) < 1e-9, String(gb.stepDur()));
gb.enter(0, tix('TA'), 0);
ok('slider does not retune the selected TEMPO section', gb.playMetaRef() && gb.playMetaRef().bpm === 120 && Math.abs(gb.stepDur() - 60 / 120 / 4) < 1e-9 && gb.G.bpm === 90);
document.querySelector('#play').click();
ok('stop leaves the clock on the song tempo', !document.querySelector('#play').classList.contains('on') && !gb.arr.baseBpm && Math.abs(gb.stepDur() - 60 / 90 / 4) < 1e-9, String(gb.arr.baseBpm) + ' ' + gb.stepDur());
slide(100);
const exp2 = document.querySelector('#song .exp');
let exportJob2 = null;
const prevExp2 = exp2.onchange;
exp2.onchange = (e) => { const v = e.target.value; e.target.value = ''; if (v) exportJob2 = gb.doExport(v); };
exp2.value = 'mid-song';
exp2.dispatchEvent(new Event('change'));
const exported2 = await exportJob2;
exp2.onchange = prevExp2;
const mid2 = new Uint8Array(await exported2.blob.arrayBuffer());
const tempos2 = [];
for (let i = 0; i < mid2.length - 5; i++) if (mid2[i] === 0xFF && mid2[i + 1] === 0x51 && mid2[i + 2] === 0x03) tempos2.push(Math.round(60000000 / ((mid2[i + 3] << 16) | (mid2[i + 4] << 8) | mid2[i + 5])));
ok('export of the selected TEMPO section matches playback', tempos2[0] === 120 && tempos2.includes(100) && gb.G.bpm === 100, tempos2.join(','));
document.querySelector('#song .dup').click();
const copy = gb.secsRef()[gb.songRef()[gb.selRef()].sec];
const copiedBass = copy.state.tracks.find(t => t.id === 'bass');
ok('DUP copies the working pattern and the stored tempo', copy.name !== 'TA' && copy.useBpm && copy.state.bpm === 120 && copiedBass.phrase.notes[0].p === 71 && gb.G.bpm === 100 && gb.secsRef()[tid('TA')].state.bpm === 120, copy.name + ' ' + copy.state.bpm);
[...document.querySelectorAll('#song .blk')].find(el => el.textContent.startsWith('TA')).click();
document.querySelector('#song .vary').click();
const varied = gb.secsRef()[gb.songRef()[gb.selRef()].sec];
ok('VARY copies the stored tempo', varied.name !== 'TA' && varied.useBpm && varied.state.bpm === 120 && gb.G.bpm === 100, varied.name + ' ' + varied.state.bpm);
document.querySelector('#song .seg button[data-m=loop]').click();
document.querySelector('#play').click();
ok('This section plays the stored tempo', gb.playMetaRef() && gb.playMetaRef().bpm === 120 && Math.abs(gb.stepDur() - 60 / 120 / 4) < 1e-9 && gb.G.bpm === 100);
slide(110);
ok('slider does not retune This section while TEMPO is on', Math.abs(gb.stepDur() - 60 / 120 / 4) < 1e-9 && gb.G.bpm === 110);
document.querySelector('#play').click();
document.querySelector('#song .tempo').click();
document.querySelector('#play').click();
ok('TEMPO off follows the slider', !gb.secsRef()[gb.songRef()[gb.selRef()].sec].useBpm && Math.abs(gb.stepDur() - 60 / 110 / 4) < 1e-9, String(gb.stepDur()));
slide(100);
ok('slider retunes This section immediately when TEMPO is off', gb.G.bpm === 100 && Math.abs(gb.stepDur() - 60 / 100 / 4) < 1e-9);
document.querySelector('#play').click();

// TEMPO toggle while playing rearms the audible section immediately. No stop before the toggle, no stash.
if (document.querySelector('#play').classList.contains('on')) document.querySelector('#play').click();
gb.clearTimeline();
slide(120);
document.querySelector('#song .cap').click();
gb.secsRef()[gb.songRef()[gb.selRef()].sec].name = 'LA';
gb.secsRef()[gb.songRef()[gb.selRef()].sec].len.bars = 1;
document.querySelector('#song .tempo').click();
slide(140);
document.querySelector('#song .cap').click();
gb.secsRef()[gb.songRef()[gb.selRef()].sec].name = 'LB';
gb.secsRef()[gb.songRef()[gb.selRef()].sec].len.bars = 1;
document.querySelector('#song .tempo').click();
slide(100);
const lid = nm => gb.songRef().find(e => gb.secsRef()[e.sec].name === nm).sec;
const lix = nm => gb.songRef().findIndex(e => gb.secsRef()[e.sec].name === nm);
const clock = bpm => Math.abs(gb.stepDur() - 60 / bpm / 4) < 1e-9;
const advance = () => { const n = gb.arr.len; for (let i = 0; i < n; i++) gb.stepPlay(0); gb.stepPlay(0); };
[...document.querySelectorAll('#song .blk')].find(el => el.textContent.startsWith('LA')).click();
document.querySelector('#song .seg button[data-m=song]').click();
document.querySelector('#play').click();
ok('song starts on the outlined TEMPO section', gb.arr.idx === lix('LA') && gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'LA' && clock(120) && gb.G.bpm === 100);
document.querySelector('#song .tempo').click();
ok('Song toggle off follows the song tempo now', !gb.secsRef()[lid('LA')].useBpm && clock(100) && gb.arr.idx === lix('LA'), String(gb.stepDur()));
slide(90);
ok('slider after Song toggle off retunes now', clock(90) && gb.G.bpm === 90 && gb.arr.baseBpm === 90);
document.querySelector('#song .tempo').click();
ok('Song toggle on captures the slider', gb.secsRef()[lid('LA')].useBpm && gb.secsRef()[lid('LA')].state.bpm === 90 && (!gb.secsRef()[lid('LA')].draft || gb.secsRef()[lid('LA')].draft.bpm === 90) && clock(90));
slide(80);
ok('slider after Song toggle on leaves the stored clock', clock(90) && gb.G.bpm === 80);
document.querySelector('#song .tempo').click();
ok('second Song toggle off follows the new song tempo', !gb.secsRef()[lid('LA')].useBpm && clock(80));
document.querySelector('#play').click();
slide(120);
document.querySelector('#song .tempo').click();
slide(100);
[...document.querySelectorAll('#song .blk')].find(el => el.textContent.startsWith('LA')).click();
document.querySelector('#song .seg button[data-m=song]').click();
document.querySelector('#play').click();
advance();
ok('playhead reached the other TEMPO section', gb.arr.idx === lix('LB') && gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'LA' && clock(140) && gb.secsRef()[lid('LB')].state.bpm === 140);
document.querySelector('#song .tempo').click();
slide(90);
ok('TEMPO edit off the playhead leaves the audible section', gb.arr.idx === lix('LB') && !gb.secsRef()[lid('LA')].useBpm && gb.secsRef()[lid('LB')].useBpm && clock(140) && gb.G.bpm === 90, String(gb.stepDur()));
document.querySelector('#song .tempo').click();
ok('TEMPO on off the playhead does not capture over the audible clock', gb.secsRef()[lid('LA')].useBpm && gb.secsRef()[lid('LA')].state.bpm === 90 && clock(140));
document.querySelector('#play').click();
slide(120);
if (gb.secsRef()[lid('LA')].useBpm) document.querySelector('#song .tempo').click();
document.querySelector('#song .tempo').click();
slide(100);
[...document.querySelectorAll('#song .blk')].find(el => el.textContent.startsWith('LA')).click();
document.querySelector('#song .ref').click();
[...document.querySelectorAll('#song .blk')].find(el => el.textContent.startsWith('LA')).click();
document.querySelector('#song .seg button[data-m=song]').click();
document.querySelector('#play').click();
ok('linked section still plays the stored tempo', clock(120) && gb.songRef().filter(e => e.sec === lid('LA')).length === 2);
advance();
ok('playhead is the REF while the other block stays outlined', gb.arr.idx !== gb.selRef() && gb.songRef()[gb.arr.idx].sec === lid('LA') && gb.songRef()[gb.selRef()].sec === lid('LA') && clock(120));
document.querySelector('#song .tempo').click();
ok('TEMPO off on a linked section retunes now', !gb.secsRef()[lid('LA')].useBpm && clock(100) && gb.songRef()[gb.arr.idx].sec === lid('LA'));
slide(90);
ok('slider after the linked toggle follows now', clock(90) && gb.G.bpm === 90);
document.querySelector('#play').click();
slide(120);
document.querySelector('#song .tempo').click();
slide(100);
[...document.querySelectorAll('#song .blk')].find(el => el.textContent.startsWith('LA')).click();
document.querySelector('#song .seg button[data-m=loop]').click();
document.querySelector('#play').click();
ok('This section starts at the stored tempo', clock(120) && gb.G.bpm === 100 && gb.secsRef()[gb.songRef()[gb.selRef()].sec].name === 'LA');
document.querySelector('#song .tempo').click();
ok('This section toggle off follows the slider now', !gb.secsRef()[gb.songRef()[gb.selRef()].sec].useBpm && clock(100));
slide(90);
ok('slider after This section toggle off retunes now', clock(90) && gb.G.bpm === 90);
document.querySelector('#song .tempo').click();
ok('This section toggle on captures the slider', gb.secsRef()[gb.songRef()[gb.selRef()].sec].useBpm && gb.secsRef()[gb.songRef()[gb.selRef()].sec].state.bpm === 90 && clock(90));
slide(80);
ok('slider after This section toggle on leaves the stored clock', clock(90) && gb.G.bpm === 80);
document.querySelector('#play').click();

// --- v14.23 Follow playhead and A–B, through the page controls. No manual stash, no 500ms wait. ---
{
const play = document.getElementById('play');
const stop = () => { if (play.classList.contains('on')) play.click(); };
const start = () => { if (!play.classList.contains('on')) play.click(); };
const blocks = () => [...document.querySelectorAll('#song .blk')];
const follow = on => { const b = document.querySelector('#song .fol'); if (b.classList.contains('on') !== !!on) b.click(); };
const advance = () => { const from = gb.arr.idx, rep = gb.arr.rep; const t0 = gb.ac().currentTime + 0.25, sd = gb.stepDur(); for (let i = 0; i < 80 && gb.arr.idx === from && gb.arr.rep === rep; i++) gb.stepPlay(t0 + i * sd); };
const bassCut = st => st.tracks.find(t => t.id === 'bass').syn.cut;
const bassMode = st => st.tracks.find(t => t.id === 'bass').mode;
stop();
// A synthetic dragstart earlier in this page leaves dragI set unless dragend runs.
const leftover = document.querySelector('#song .blk');
if (leftover) leftover.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
document.querySelector('#song .clr').click();
document.querySelector('#song .hclr').click();
ok('follow defaults off', !!document.querySelector('#song .fol') && !document.querySelector('#song .fol').classList.contains('on'));
const stamp = (mode, hits, cut, pitch) => {
  const b = bass();
  b.mode = mode; b.set(hits, 16, 0); b.syn.cut = cut;
  b.phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 2, p: pitch, v: 100, sl: 0 }] });
  b.sync();
};
stamp('Phrase', 2, 10, 40); document.querySelector('#song .cap').click();
stamp('Phrase', 3, 40, 55); document.querySelector('#song .cap').click();
stamp('Minor riff', 5, 70, 67); document.querySelector('#song .cap').click();
stamp('Root', 1, 80, 72); document.querySelector('#song .cap').click();
gb.songRef().forEach(e => { gb.secsRef()[e.sec].len.bars = 1; delete gb.secsRef()[e.sec].draft; });
const idAt = i => gb.songRef()[i].sec;
const secA = idAt(0), secB = idAt(1), secC = idAt(2);
blocks()[0].click();
ok('opened the first section', gb.selRef() === 0 && bass().syn.cut === 10 && bass().mode === 'Phrase' && bass().phrase.notes[0].p === 40, 'sel=' + gb.selRef() + ' cut=' + bass().syn.cut + ' mode=' + bass().mode + ' p=' + (bass().phrase && bass().phrase.notes[0] && bass().phrase.notes[0].p) + ' n=' + gb.songRef().length);
document.querySelector('#song .seg button[data-m=song]').click();
start();
advance();
ok('follow off leaves the editor on the outlined section', gb.selRef() === 0 && bass().syn.cut === 10 && bass().phrase.notes[0].p === 40 && gb.arr.idx === 1);
bass().syn.cut = 21;
document.querySelector('#song .fol').click();
ok('follow on while playing shows the heard section', document.querySelector('#song .fol').classList.contains('on') && gb.selRef() === 1 && gb.arr.idx === 1 && bass().syn.cut === 40 && bass().phrase.notes[0].p === 55 && bass().el.querySelector('select.modp').value === 'Phrase', 'sel=' + gb.selRef() + ' idx=' + gb.arr.idx + ' cut=' + bass().syn.cut + ' on=' + document.querySelector('#song .fol').classList.contains('on') + ' mode=' + gb.arr.mode + ' ae=' + (document.activeElement ? document.activeElement.tagName + '.' + document.activeElement.className : ''));
ok('the edit made before follow was stashed', bassCut(gb.secsRef()[secA].draft) === 21);
follow(false);
ok('follow turned off', !document.querySelector('#song .fol').classList.contains('on'));
advance();
ok('follow off does not chase the next section', gb.selRef() === 1 && gb.arr.idx === 2 && bass().syn.cut === 40);
follow(true);
ok('follow catches the section already playing', gb.selRef() === 2 && gb.arr.idx === 2 && bass().mode === 'Minor riff' && bass().pat.reduce((a, b) => a + b, 0) === 5 && bass().el.querySelector('.e').textContent === 'E(5,16)');
const knob = bass().el.querySelector('.knobs canvas');
knob.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, pointerId: 7, buttons: 1, pointerType: 'mouse' }));
bass().syn.cut = 33;
advance();
ok('a held knob keeps the editor put', gb.selRef() === 2 && bass().syn.cut === 33 && gb.arr.idx === 3);
knob.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, pointerId: 7, pointerType: 'mouse' }));
ok('releasing the knob stashes it and follows', gb.selRef() === 3 && gb.arr.idx === 3 && bassCut(gb.secsRef()[secC].draft) === 33 && bass().syn.cut === 80);
stop();
blocks()[0].click();
follow(true);
start();
const roll = bass().el.querySelector('.proll canvas');
gb.relayout();
const rr = roll.getBoundingClientRect();
roll.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: rr.left + rr.width * 0.25, clientY: rr.top + rr.height * 0.45, pointerId: 8, buttons: 1, pointerType: 'mouse' }));
const midCount = bass().phrase.notes.length;
advance();
ok('a phrase gesture is not swapped mid-note', gb.selRef() === 0 && bass().phrase.notes.length === midCount && midCount >= 1, 'n=' + midCount + ' w=' + Math.round(rr.width));
roll.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: rr.left + 10, clientY: rr.top + 10, pointerId: 8, pointerType: 'mouse' }));
ok('the phrase edit survives the catch-up', gb.selRef() === 1 && bass().phrase.notes[0].p === 55 && gb.secsRef()[secA].draft.tracks.find(t => t.id === 'bass').phrase.notes.length >= midCount);
stop();
blocks()[0].click();
bass().syn.cut = 19;
follow(true);
start();
knob.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, pointerId: 9, buttons: 1, pointerType: 'mouse' }));
advance();
stop();
knob.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, pointerId: 9, pointerType: 'mouse' }));
ok('stopping during a drag does not throw the edit away', gb.selRef() === 0 && bass().syn.cut === 19);
blocks()[0].querySelector('.rb').click();
follow(true);
document.querySelector('#song .seg button[data-m=song]').click();
start();
advance();
ok('a repeat does not look like a new section', gb.arr.idx === 0 && gb.arr.rep === 1 && gb.selRef() === 0);
advance();
ok('follow moves when the repeat ends', gb.arr.idx === 1 && gb.selRef() === 1 && gb.songRef()[1].sec === secB);
stop();
blocks()[0].querySelector('.rb').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
blocks()[0].click();
document.querySelector('#song .ref').click();
ok('ref inserted', gb.songRef()[1].sec === secA && gb.songRef()[0].sec === secA);
blocks()[0].click();
follow(true);
document.querySelector('#song .seg button[data-m=song]').click();
start();
advance();
ok('follow outlines the playing REF', gb.selRef() === 1 && gb.songRef()[gb.selRef()].sec === secA && bass().phrase.notes.some(n => n.p === 40));
advance();
ok('follow leaves the REF for the next section', gb.selRef() === 2 && bass().phrase.notes[0].p === 55 && bass().mode === 'Phrase');
stop();
blocks()[0].click();
const modeSel = bass().el.querySelector('select.modp');
modeSel.value = 'Riff'; modeSel.dispatchEvent(new Event('change', { bubbles: true }));
ok('mode change holds', bass().mode === 'Riff' && modeSel.value === 'Riff');
follow(true);
document.querySelector('#song .seg button[data-m=song]').click();
start();
advance(); advance();
ok('a hold stays while the heard pattern follows', gb.selRef() === 2 && bass().el.querySelector('select.modp').value === 'Riff' && bass().pat.reduce((a, b) => a + b, 0) === 3 && bassMode(gb.secsRef()[secB].state) === 'Phrase');
stop();
if (document.querySelector('#song .fol').classList.contains('on')) document.querySelector('#song .fol').click();
blocks()[0].click();
document.querySelector('#song .rngb').click();
ok('A–B turns Song on and marks the span', document.querySelector('#song .seg button[data-m=song]').classList.contains('on') && gb.rangeRef().on && gb.rangeRef().lo === 0 && gb.rangeRef().hi === 2 && document.querySelectorAll('#song .blk.rng').length === 3);
ok('A and B badges are the endpoints', blocks()[0].querySelector('.ab').textContent === 'A' && blocks()[2].querySelector('.ab').textContent === 'B' && !blocks()[1].querySelector('.ab'));
const abBg = getComputedStyle(blocks()[0].querySelector('.ab')).backgroundColor;
const outline = getComputedStyle(blocks()[0]).outlineColor;
ok('the A–B badge is not the edit outline', abBg !== outline && abBg !== 'rgba(0, 0, 0, 0)', abBg + ' vs ' + outline);
document.querySelector('#song .seg button[data-m=loop]').click();
ok('This section drops the A–B highlight and remembers the span', document.querySelector('#song .seg button[data-m=loop]').classList.contains('on') && !gb.rangeRef().on && gb.rangeRef().lo === 0 && gb.rangeRef().hi === 2 && !document.querySelector('#song .rngb').classList.contains('on') && document.querySelectorAll('#song .blk.rng').length === 0);
document.querySelector('#song .seg button[data-m=song]').click();
ok('Song alone does not restore A–B', !gb.rangeRef().on && gb.rangeRef().lo === 0 && gb.rangeRef().hi === 2 && gb.nextPos(2, 0, false).i === 3);
document.querySelector('#song .rngb').click();
ok('A–B restores the same span and selects Song', gb.rangeRef().on && gb.rangeRef().lo === 0 && gb.rangeRef().hi === 2 && document.querySelector('#song .seg button[data-m=song]').classList.contains('on') && document.querySelectorAll('#song .blk.rng').length === 3 && blocks()[0].querySelector('.ab').textContent === 'A');
document.querySelector('#song .seg button[data-m=loop]').click();
ok('paused again', !gb.rangeRef().on && gb.rangeRef().lo === 0);
const src = blocks()[0], dst = blocks()[3];
let dragErr = '';
try {
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }));
  const r = dst.getBoundingClientRect();
  dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: r.right - 1, clientY: r.top + 2 }));
  src.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
} catch (e) { dragErr = String(e && e.message || e); }
ok('reorder forgets a remembered span', !gb.rangeRef().on && gb.rangeRef().lo < 0 && document.querySelectorAll('#song .blk.rng').length === 0, dragErr + ' song=' + gb.songRef().length);
blocks()[0].click();
document.querySelector('#song .rngb').click();
const armedLo = gb.rangeRef().lo, armedHi = gb.rangeRef().hi;
ok('A–B armed again', gb.rangeRef().on && armedHi > armedLo);
blocks()[1].click();
document.querySelector('#song .del').click();
ok('delete forgets the live span', !gb.rangeRef().on && gb.rangeRef().lo < 0 && document.querySelectorAll('#song .blk.rng').length === 0);
document.querySelector('#song .und').click();
ok('undo does not bring back a stale span', !gb.rangeRef().on && gb.rangeRef().lo < 0);
stop();
blocks()[0].click();
follow(true);
document.querySelector('#song .seg button[data-m=song]').click();
start();
const nameEl = document.querySelector('#song .nm');
const nameIdx = gb.selRef();
nameEl.focus();
nameEl.value = nameEl.value + 'x';
nameEl.dispatchEvent(new Event('input', { bubbles: true }));
for (let i = 0; i < 4 && gb.arr.idx === nameIdx; i++) advance();
ok('editing the section name defers follow', gb.selRef() === nameIdx && gb.secsRef()[gb.songRef()[nameIdx].sec].name.endsWith('x') && gb.arr.idx !== nameIdx, 'sel=' + gb.selRef() + ' idx=' + gb.arr.idx);
nameEl.blur();
follow(false);
follow(true);
ok('follow catches up after the name field', gb.selRef() === gb.arr.idx && gb.selRef() !== nameIdx && !gb.secsRef()[gb.songRef()[gb.selRef()].sec].name.endsWith('x'));
stop();
gb.relayout();
const fol = document.querySelector('#song .fol').getBoundingClientRect();
const songBox = document.querySelector('#song').getBoundingClientRect();
ok('follow sits inside the 1280 viewport', fol.width > 24 && fol.top >= 0 && fol.bottom <= 720 && fol.left >= 0 && fol.right <= 1280, JSON.stringify({ l: fol.left, r: fol.right, t: fol.top, b: fol.bottom }));
ok('arranger fits the width', songBox.left >= -1 && songBox.right <= window.innerWidth + 1, songBox.left + '..' + songBox.right);
if (document.querySelector('#song .fol').classList.contains('on')) document.querySelector('#song .fol').click();
stop();
gb.status('');
}

const info = gb.genSong('ABCD12');
ok('generation still builds a song', info && info.seed === 'ABCD12' && gb.songRef().length >= 4, info && (info.seed + ' n=' + gb.songRef().length));
const css = document.querySelector('style').textContent;
ok('7-col breakpoint stays 3200', css.includes('@media(min-width:3200px)') && css.includes('repeat(7,1fr)'));
ok('version is v14.24', gb.VERSION.startsWith('v14.24'), gb.VERSION);
ok('compose controls exist', !!document.querySelector('.clr') && !!document.querySelector('.rev') && !!document.querySelector('.rngb') && !!document.querySelector('.upd'));
return { fails, version: gb.VERSION, heard: heard.length, alerts: window.__alerts || [] };
`);
} catch (e) {
  console.error(String(e && e.stack || e));
  try { chrome.kill(); } catch {}
  try { server.close(); } catch {}
  process.exit(1);
}

console.log(JSON.stringify({ fails: report.fails, version: report.version, heard: report.heard, alerts: report.alerts }));
const scene = await ev(`
const gb = window.__gb;
gb.status('');
gb.clearTimeline();
const b = gb.tracks().find(t => t.id === 'bass');
gb.setTrMode(b, 'Phrase');
b.phrase = gb.cleanPhrase({ len: 1, notes: [{ s: 0, l: 4, p: 40, v: 100, sl: 1 }] });
b.syn.cut = 40;
const nameAt = (nm) => { const s = gb.secsRef()[gb.songRef()[gb.selRef()].sec]; s.name = nm; return gb.selRef(); };
gb.capture();
nameAt('Verse');
b.phrase.notes[0].p = 41; b.syn.cut = 22;
gb.updateSec();
gb.dupSec();
nameAt('Lift');
gb.selectEntry(1);
b.phrase.notes[0].p = 53; b.syn.cut = 18;
gb.stashEdit();
gb.dupSec();
nameAt('Chorus');
gb.selectEntry(0);
b.syn.cut = 15;
gb.stashEdit();
gb.armRange(0, 2);
gb.setMode('song');
gb.status('');
gb.view.active = true; gb.view.idx = 1; gb.view.rep = 0; gb.view.step = 4; gb.view.len = 64; gb.view.t = 0;
gb.onView();
gb.enter(0, 1, 0);
document.querySelector('#song').scrollIntoView({ block: 'start' });
const song = document.querySelector('#song');
const bl = [...song.querySelectorAll('.blk')].map(el => el.className + '|' + el.textContent.replace(/\\s+/g, ' ').trim());
return { n: gb.songRef().length, sel: gb.selRef(), ro: gb.readoutText(), blocks: bl, upd: song.querySelector('.upd').className, rev: song.querySelector('.rev').className, rng: song.querySelector('.rngb').className };
`);
console.log('SCENE', JSON.stringify(scene));
await new Promise(r => setTimeout(r, 700));
mkdirSync(shots, { recursive: true });
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
  writeFileSync(join(shots, name), Buffer.from(data, 'base64'));
};
await shot('edit-focus-range.png');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
await ev(`window.dispatchEvent(new Event('resize')); document.querySelector('#song').scrollIntoView({ block: 'start' });`);
await new Promise(r => setTimeout(r, 300));
await shot('mobile-arrange.png');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
await ev(`window.dispatchEvent(new Event('resize')); document.querySelector('#song').scrollIntoView({ block: 'start' });`);
const clicked = await ev(`
const gb = window.__gb;
const fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' :: ' + x : '')); };
const bass = () => gb.tracks().find(t => t.id === 'bass');
const blocks = () => [...document.querySelectorAll('#song .blk')];
blocks()[1].click();
ok('click Lift edits Lift', gb.selRef() === 1 && bass().phrase.notes[0].p === 53, String(gb.selRef()) + ' p=' + bass().phrase.notes[0].p);
ok('Verse draft survived the click', gb.secsRef()[gb.songRef()[0].sec].draft.tracks.find(t => t.id === 'bass').syn.cut === 15);
document.querySelector('#song .rev').click();
ok('REVERT click reloads the saved Lift', bass().syn.cut !== 18 && !gb.secsRef()[gb.songRef()[1].sec].draft, String(bass().syn.cut));
blocks()[0].click();
ok('click Verse restores its draft', gb.selRef() === 0 && bass().syn.cut === 15);
document.querySelector('#song .rngb').click();
ok('A-B click clears the span', !gb.rangeRef().on);
document.querySelector('#song .rngb').click();
ok('A-B click arms three sections from the edit', gb.rangeRef().on && gb.rangeRef().lo === 0 && gb.rangeRef().hi === 2, JSON.stringify(gb.rangeRef()));
return fails;
`);
if (clicked.length) {
  console.error(JSON.stringify({ clickFails: clicked }, null, 2));
  try { chrome.kill(); } catch {}
  try { server.close(); } catch {}
  process.exit(1);
}

async function settle() {
  await ev(`await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`);
}
async function view(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 }, sessionId);
  await ev(`window.dispatchEvent(new Event('resize'));`);
  await settle();
}
const phrase = await ev(`
const gb = window.__gb;
const fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' :: ' + x : '')); };
const bass = () => gb.tracks().find(t => t.id === 'bass');
const play = document.getElementById('play');
if (play.classList.contains('on')) play.click();
document.querySelector('#song .clr').click();
document.querySelector('#song .hclr').click();
const b = bass();
b.mode = 'Phrase';
b.phrase = gb.cleanPhrase({ len: 2, notes: [{ s: 6, l: 2, p: 67, v: 80, sl: 0 }] });
b.phraseW = 1; b.phraseH = 1; b.sync();
document.querySelector('#song .cap').click();
const note0 = JSON.stringify(b.phrase.notes[0]);
ok('width and height default to 1', b.el.dataset.rollw === '1' && b.el.dataset.rolleff === '1' && b.el.dataset.rollh === '1' && b.el.querySelector('.szw button[data-w="1"]').getAttribute('aria-pressed') === 'true');
const cv = b.el.querySelector('.proll canvas');
const w1 = cv.clientWidth, h1 = cv.clientHeight, span1 = b.rollBox.span, row1 = b.rollBox.rh * w1 / b.rollBox.W;
const aim = (s, p) => {
  const box = b.rollBox, r = cv.getBoundingClientRect();
  const lx = box.x0 + (s + 0.5) / box.L * box.gw;
  const ly = box.y0 + (box.span - (p - box.lo) - 0.5) * box.rh;
  return { x: r.left + lx / box.W * r.width, y: r.top + ly / box.H * r.height };
};
const ptr = (type, x, y, extra) => cv.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 4, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1 }, extra || {})));
const hit = aim(6, 67);
ptr('pointerdown', hit.x, hit.y, { altKey: true });
ptr('pointerup', hit.x, hit.y, { altKey: true });
ok('1× click maps onto the existing note', b.phrase.notes.length === 1 && b.phrase.notes[0].sl === 1 && b.phrase.notes[0].p === 67 && b.phrase.notes[0].s === 6 && b.phrase.notes[0].v === 80, JSON.stringify(b.phrase.notes));
b.el.querySelector('.szw button[data-w="3"]').click();
b.el.querySelector('.szh button[data-h="2"]').click();
ok('3×2 keeps the note', JSON.stringify(b.phrase.notes[0]) === JSON.stringify({ s: 6, l: 2, p: 67, v: 80, sl: 1 }));
const row2 = b.rollBox.rh * cv.clientWidth / b.rollBox.W;
ok('3×2 is wider, taller, and shows more pitches', cv.clientWidth > w1 * 2.4 && cv.clientHeight > h1 * 1.7 && b.rollBox.span >= 24 && b.rollBox.span > span1 && row2 > row1 * 0.85 && b.rollBox.lo <= 67 && 67 <= b.rollBox.lo + b.rollBox.span - 1, JSON.stringify({ w: cv.clientWidth, h: cv.clientHeight, span: b.rollBox.span, row2, row1, w1, h1, span1 }));
const fresh = aim(6, 67);
ptr('pointerdown', fresh.x, fresh.y);
ptr('pointerup', fresh.x, fresh.y);
ok('3×2 click still hits that pitch', b.phrase.notes.length === 0, JSON.stringify(b.phrase.notes));
const pNew = b.rollBox.lo + 4;
const a0 = aim(3, pNew);
ptr('pointerdown', a0.x, a0.y);
const a1 = aim(8, pNew);
ptr('pointermove', a1.x, a1.y);
ptr('pointerup', a1.x, a1.y);
const added = b.phrase.notes.find(n => n.s === 3);
ok('drag length follows the step under the pointer', !!added && added.p === pNew && added.l === 6 && added.v === 100 && added.sl === 0, JSON.stringify(b.phrase.notes));
const kept = JSON.stringify(b.phrase);
b.el.querySelector('.szw button[data-w="2"]').click();
ok('width change does not rewrite notes', JSON.stringify(b.phrase) === kept && b.phraseW === 2 && b.el.dataset.rollw === '2');
b.phrase.notes.push({ s: 1, l: 1, p: 70, v: 90, sl: 1 });
document.querySelector('#song .cap').click();
document.querySelector('#song .blk').click();
ok('section change keeps the size and the draft', b.phraseW === 2 && b.phraseH === 2 && b.phrase.notes.some(n => n.p === 70 && n.v === 90 && n.sl === 1) && gb.selRef() === 0);
b.el.querySelector('.szw button[data-w="3"]').click();
const ids = gb.tracks().map(t => t.id);
const dom = [...document.querySelectorAll('#tracks > .tr')].map(el => { const t = gb.tracks().find(x => x.el === el); return t ? t.id : 'master'; });
ok('card order stays put', dom.join(',') === ids.join(','), dom.join(',') + ' vs ' + ids.join(','));
const rects = [...document.querySelectorAll('#tracks > .tr')].map(el => el.getBoundingClientRect());
let overlap = '';
for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
  const a = rects[i], c = rects[j];
  const iw = Math.min(a.right, c.right) - Math.max(a.left, c.left);
  const ih = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
  if (iw > 2 && ih > 2) overlap = i + 'x' + j + ' ' + Math.round(iw) + 'x' + Math.round(ih);
}
const host = document.querySelector('#tracks').getBoundingClientRect();
ok('cards do not overlap', !overlap, overlap);
ok('cards stay inside the grid', rects.every(r => r.left >= host.left - 1 && r.right <= host.right + 1), JSON.stringify({ hostR: Math.round(host.right), maxR: Math.round(Math.max(...rects.map(r => r.right))) }));
const proj = JSON.stringify(gb.project());
ok('size is not stored in the song', !proj.includes('phraseW') && !proj.includes('rollw'));
document.querySelector('#song .seg button[data-m=song]').click();
b.el.querySelector('.szw button[data-w="3"]').click();
if (!document.querySelector('#song .fol').classList.contains('on')) document.querySelector('#song .fol').click();
play.click();
const from = gb.arr.idx, rep = gb.arr.rep, t0 = gb.ac().currentTime + 0.25, sd = gb.stepDur();
for (let i = 0; i < 80 && gb.arr.idx === from && gb.arr.rep === rep; i++) gb.stepPlay(t0 + i * sd);
ok('follow still moves and the size stays', gb.selRef() !== 0 && b.phraseW === 3 && b.phraseH === 2);
if (play.classList.contains('on')) play.click();
if (document.querySelector('#song .fol').classList.contains('on')) document.querySelector('#song .fol').click();
document.querySelectorAll('#song .blk')[0].click();
b.el.scrollIntoView({ block: 'center' });
return { fails, w1, h1, w: cv.clientWidth, h: cv.clientHeight, eff: b.el.dataset.rolleff, span: b.rollBox.span };
`);
if (phrase.fails.length) {
  console.error(JSON.stringify({ phraseFails: phrase.fails }, null, 2));
  try { chrome.kill(); } catch {}
  try { server.close(); } catch {}
  process.exit(1);
}
await shot('phrase-1280-3x2.png');
await view(1920, 1080);
await ev(`document.querySelector('#tracks .tr.phr').scrollIntoView({ block: 'center' });`);
await shot('phrase-desktop-3wide.png');
const wide = await ev(`const b = window.__gb.tracks().find(t => t.id === 'bass'); return { eff: b.el.dataset.rolleff, w: b.el.querySelector('.proll canvas').clientWidth, cols: matchMedia('(min-width:1240px)').matches ? 6 : 0 };`);
await view(768, 1024);
const tablet = await ev(`
const b = window.__gb.tracks().find(t => t.id === 'bass');
b.layoutRoll(); b.drawRoll();
const cv = b.el.querySelector('.proll canvas');
const box = b.rollBox, r = cv.getBoundingClientRect();
const s = 6, p = 67;
const lx = box.x0 + (s + 0.5) / box.L * box.gw;
const ly = box.y0 + (box.span - (p - box.lo) - 0.5) * box.rh;
const x = r.left + lx / box.W * r.width, y = r.top + ly / box.H * r.height;
cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 5, pointerType: 'mouse', buttons: 1, altKey: true }));
cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 5, pointerType: 'mouse', altKey: true }));
const n = b.phrase.notes.find(q => q.s === 6 && q.p === 67);
return { eff: b.el.dataset.rolleff, h: b.el.dataset.rollh, sl: n && n.sl, n: b.phrase.notes.length, w: cv.clientWidth };
`);
await ev(`document.querySelector('#tracks .tr.phr').scrollIntoView({ block: 'center' });`);
await shot('phrase-tablet.png');
await view(640, 900);
const clamp2 = await ev(`const b = window.__gb.tracks().find(t => t.id === 'bass'); return { eff: b.el.dataset.rolleff, want: b.el.dataset.rollw, clamp: b.el.querySelector('.szw button.on').classList.contains('clamp') };`);
await view(390, 844);
const phone = await ev(`
const b = window.__gb.tracks().find(t => t.id === 'bass');
b.layoutRoll(); b.drawRoll();
const cv = b.el.querySelector('.proll canvas');
const h2 = cv.clientHeight;
b.phraseH = 1; b.layoutRoll(); b.drawRoll();
const h1 = cv.clientHeight;
b.phraseH = 2; b.layoutRoll(); b.drawRoll();
const box = b.rollBox, r = cv.getBoundingClientRect();
const s = 4, p = box.lo + 6;
const lx = box.x0 + (s + 0.5) / box.L * box.gw;
const ly = box.y0 + (box.span - (p - box.lo) - 0.5) * box.rh;
const x = r.left + lx / box.W * r.width, y = r.top + ly / box.H * r.height;
const before = b.phrase.notes.length;
cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 6, pointerType: 'mouse', buttons: 1 }));
const mv = box.x0 + (s + 3.5) / box.L * box.gw;
const mx = r.left + mv / box.W * r.width;
cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: mx, clientY: y, pointerId: 6, pointerType: 'mouse', buttons: 1 }));
cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: mx, clientY: y, pointerId: 6, pointerType: 'mouse' }));
const added = b.phrase.notes.find(q => q.s === s && q.p === p);
return { eff: b.el.dataset.rolleff, want: b.el.dataset.rollw, h: b.el.dataset.rollh, span: b.rollBox.span, h2, h1, p, added: added && { l: added.l, p: added.p, v: added.v }, before, notes: b.phrase.notes.length };
`);
await ev(`document.querySelector('#tracks .tr.phr').scrollIntoView({ block: 'center' });`);
await shot('phrase-phone-h2.png');
await view(1280, 720);
const back = await ev(`const b = window.__gb.tracks().find(t => t.id === 'bass'); return { eff: b.el.dataset.rolleff, want: b.phraseW, h: b.phraseH, span: b.rollBox && b.rollBox.span };`);
const sizeFails = [];
const check = (n, c, x) => { if (!c) sizeFails.push(n + (x ? ' :: ' + JSON.stringify(x) : '')); };
check('desktop keeps 3×', wide.eff === '3' && wide.w > phrase.w1 * 2.4, wide);
check('tablet maps the same note', tablet.eff === '3' && tablet.h === '2' && tablet.sl === 0 && tablet.n >= 1, tablet);
check('two columns clamp 3× to 2×', clamp2.eff === '2' && clamp2.want === '3' && clamp2.clamp === true, clamp2);
check('phone width stays 1× and height stays useful', phone.eff === '1' && phone.want === '3' && phone.h === '2' && phone.span >= 24 && phone.h2 > phone.h1 * 1.7 && phone.added && phone.added.p === phone.p && phone.added.l === 4 && phone.added.v === 100, phone);
check('growing the window restores 3×', back.eff === '3' && back.want === 3 && back.h === 2 && back.span >= 24, back);
if (sizeFails.length) {
  console.error(JSON.stringify({ sizeFails }, null, 2));
  try { chrome.kill(); } catch {}
  try { server.close(); } catch {}
  process.exit(1);
}
await view(1280, 720);

const out = { fails: report.fails, version: report.version, heard: report.heard, alerts: report.alerts, shots };
console.log(JSON.stringify(out, null, 2));
chrome.kill();
server.close();
await new Promise(r => setTimeout(r, 200));
try { rmSync(profile, { recursive: true, force: true }); } catch {}
if (report.fails.length) process.exit(1);
