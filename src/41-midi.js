/* =====================================================================
   MIDI in (Web MIDI): keyboards, e-drum kits, MIDI guitars and pads.
   Asked for the first time a part needs it; every input is listened to.
   Keeps which notes are held (Piano) and tells listeners about each
   note-on with its audio-clock time (Drums).
   ===================================================================== */
const Midi = {
  ok: false, asked: false, name: '', access: null, down: new Map(), listeners: new Set(),
  available(){ return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess; },
  async init(){
    if (this.asked || !this.available()) return this.ok;
    this.asked = true;
    try { this.access = await navigator.requestMIDIAccess({ sysex: false }); } catch (e) { return false; }
    this.ok = true;
    const hook = () => {
      const names = [];
      this.access.inputs.forEach(inp => { inp.onmidimessage = e => this.msg(e); names.push(inp.name || 'MIDI device'); });
      this.name = names.join(', ');
      if (typeof UI !== 'undefined' && UI.midiChanged) UI.midiChanged();
    };
    hook(); this.access.onstatechange = hook;
    return true;
  },
  msg(e){
    const [st, a, b] = e.data, cmd = st & 0xf0;
    // the event's own timestamp (ms, performance clock) moved onto the audio clock
    const ctx = AudioEngine.ctx, t = ctx ? ctx.currentTime - Math.max(0, (performance.now() - e.timeStamp) / 1000) : 0;
    if (cmd === 0x90 && b > 0) { this.down.set(a, t); this.listeners.forEach(f => f(a, b, t)); }
    else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) this.down.delete(a);
  },
  held(){ return [...this.down.keys()].sort((x, y) => x - y); },
};
