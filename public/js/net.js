import { PROTOCOL, CLOSE } from "./shared/protocol.js";

const BACKOFF = [1, 2, 4, 8, 15];

export class Connection {
  constructor(worldId, token, on) {
    this.worldId = worldId;
    this.token = token;
    this.on = on;
    this.tries = 0;
    this.status = "connecting";
    this.pending = new Map();
    this.open();
  }

  setStatus(status, detail = "") {
    this.status = status;
    this.on.status?.(status, detail);
  }

  open() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = (this.ws = new WebSocket(`${proto}://${location.host}/ws/${this.worldId}?token=${encodeURIComponent(this.token)}&v=${PROTOCOL}`));
    ws.binaryType = "arraybuffer";
    this.setStatus(this.tries ? "reconnecting" : "connecting");
    ws.onopen = () => { this.tries = 0; this.setStatus("online"); };
    ws.onmessage = e => {
      if (typeof e.data !== "string") return this.on.frame?.(e.data);
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "replaced") this.ended = "replaced";
      if (m.t === "removed" || m.t === "deleted") { this.ended = m.t; this.endedText = m.text; }
      if (m.t === "error" && m.code === "protocol") this.ended = "outdated";
      if (m.t === "result") {
        const q = this.pending.get(m.of);
        if (q?.length) q.shift()(m);
      }
      this.on.message?.(m);
    };
    ws.onclose = e => {
      for (const q of this.pending.values()) for (const done of q.splice(0)) done({ ok: false, error: "disconnected" });
      if (e.code === CLOSE.PROTOCOL) this.ended = "outdated";
      if (e.code === CLOSE.REPLACED) this.ended ??= "replaced";
      if (e.code === CLOSE.REMOVED) this.ended ??= "removed";
      if (e.code === CLOSE.DELETED) this.ended ??= "deleted";
      if (this.ended || this.stopped) return this.setStatus(this.ended ?? "closed");
      const wait = BACKOFF[Math.min(this.tries, BACKOFF.length - 1)];
      this.tries++;
      this.setStatus("waiting", `retrying in ${wait} s`);
      this.timer = setTimeout(() => this.open(), wait * 1000);
    };
  }

  send(obj) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  request(obj) {
    return new Promise(done => {
      if (!this.send(obj)) return done({ ok: false, error: "not connected" });
      if (!this.pending.has(obj.t)) this.pending.set(obj.t, []);
      this.pending.get(obj.t).push(done);
    });
  }

  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }
}
