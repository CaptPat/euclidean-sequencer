// Repeatable regression for v14.22 in-song composing.
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
gb.stashEdit();
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

const info = gb.genSong('ABCD12');
ok('generation still builds a song', info && info.seed === 'ABCD12' && gb.songRef().length >= 4, info && (info.seed + ' n=' + gb.songRef().length));
const css = document.querySelector('style').textContent;
ok('7-col breakpoint stays 3200', css.includes('@media(min-width:3200px)') && css.includes('repeat(7,1fr)'));
ok('version is v14.22', gb.VERSION.startsWith('v14.22'), gb.VERSION);
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

const out = { fails: report.fails, version: report.version, heard: report.heard, alerts: report.alerts, shots };
console.log(JSON.stringify(out, null, 2));
chrome.kill();
server.close();
await new Promise(r => setTimeout(r, 200));
try { rmSync(profile, { recursive: true, force: true }); } catch {}
if (report.fails.length) process.exit(1);
