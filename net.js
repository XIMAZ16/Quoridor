// Online transport: PubNub across devices, BroadcastChannel fallback.
/* ==========================================================================
   ONLINE TRANSPORT (PubNub across devices, BroadcastChannel as local fallback)
   ========================================================================== */
class QNet {
  constructor(o = {}) {
    this.onMessage = o.onMessage || function () {};
    this.onPeerChange = o.onPeerChange || function () {};
    this.onStatus = o.onStatus || function () {};
    this.id = 'q-' + Math.random().toString(36).slice(2, 10);
    this.code = null; this.transport = null; this.heartbeatTimer = null; this.watchdogTimer = null;
    this.sdkPromise = null; this.peerLastSeen = 0; this.peerOnline = false;
  }
  static configured() { const c = window.QUORIDOR_NET_CONFIG || {}; return Boolean(c.pubnubPublishKey && c.pubnubSubscribeKey); }
  static transportName() { return QNet.configured() ? 'pubnub' : 'local'; }
  channelName(code) { return 'quoridor-arcade-' + String(code).toUpperCase(); }
  async connect(code) {
    this.disconnect();
    this.code = String(code).toUpperCase(); this.peerLastSeen = 0; this.subscriptionReady = false;
    const wanted = QNet.transportName();
    this.onStatus({ state: 'connecting', transport: wanted });
    if (wanted === 'pubnub') {
      try { await this.loadSdk(); this.transport = this.createPubNub(); }
      catch (e) {
        this.onStatus({ state: 'error', transport: 'local', message: 'เชื่อมต่อ PubNub ไม่ได้ ใช้โหมดทดสอบในเบราว์เซอร์แทน' });
        this.transport = this.createLocal();
      }
    } else this.transport = this.createLocal();
    if (!this.transport) { this.onStatus({ state: 'error', transport: wanted, message: 'เบราว์เซอร์นี้ไม่รองรับการเชื่อมต่อออนไลน์' }); return false; }
    this.onStatus({ state: 'connected', transport: this.transport.name });
    this.startHeartbeat();
    if (this.transport.name === 'pubnub') {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = setTimeout(() => {
        if (this.subscriptionReady) return;
        this.onStatus({ state: 'error', transport: 'pubnub', message: 'เชื่อมต่อ PubNub ไม่สำเร็จ — ตรวจสอบคีย์และอินเทอร์เน็ต' });
      }, 8000);
    }
    return true;
  }
  disconnect() {
    this.stopHeartbeat();
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    this.subscriptionReady = false;
    if (this.transport) { try { this.transport.close(); } catch (e) {} this.transport = null; }
    this.setPeerOnline(false); this.code = null;
  }
  send(msg) {
    if (!this.transport || !this.code) return false;
    try { this.transport.send(Object.assign({}, msg, { from: this.id, room: this.code })); return true; } catch (e) { return false; }
  }
  handleIncoming(raw) {
    if (!raw || typeof raw !== 'object' || raw.from === this.id) return;
    this.peerLastSeen = Date.now(); this.setPeerOnline(true);
    if (raw.type === 'ping') return;
    if (raw.type === 'leave') { this.peerLastSeen = 0; this.setPeerOnline(false); return; }
    this.onMessage(raw);
  }
  setPeerOnline(v) { if (this.peerOnline === v) return; this.peerOnline = v; this.onPeerChange(v); }
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.send({ type: 'ping' }), 2000);
    this.watchdogTimer = setInterval(() => { if (this.peerLastSeen && Date.now() - this.peerLastSeen > 7000) this.setPeerOnline(false); }, 2000);
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
  }
  createLocal() {
    if (typeof BroadcastChannel === 'undefined') return null;
    let ch; try { ch = new BroadcastChannel(this.channelName(this.code)); } catch (e) { return null; }
    ch.onmessage = (ev) => this.handleIncoming(ev.data);
    return { name: 'local', send: (m) => ch.postMessage(m), close: () => { try { ch.close(); } catch (e) {} } };
  }
  loadSdk() {
    if (window.PubNub) return Promise.resolve(window.PubNub);
    if (this.sdkPromise) return this.sdkPromise;
    this.sdkPromise = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.pubnub.com/sdk/javascript/pubnub.13.1.2.js'; sc.async = true;
      sc.onload = () => res(window.PubNub); sc.onerror = () => rej(new Error('PubNub SDK failed to load'));
      document.head.appendChild(sc);
    });
    return this.sdkPromise;
  }
  handlePubNubStatus(ev) {
    const cat = ev && ev.category;
    if (cat === 'PNConnectedCategory') {
      this.subscriptionReady = true;
      if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
      this.onStatus({ state: 'connected', transport: 'pubnub' }); return;
    }
    if (cat === 'PNAccessDeniedCategory' || cat === 'PNBadRequestCategory') {
      this.onStatus({ state: 'error', transport: 'pubnub', message: 'คีย์ PubNub ไม่ถูกต้องหรือไม่มีสิทธิ์' }); return;
    }
    if (cat === 'PNNetworkIssuesCategory') this.onStatus({ state: 'error', transport: 'pubnub', message: 'การเชื่อมต่อ PubNub ขาดหาย กำลังลองใหม่...' });
  }
  createPubNub() {
    const cfg = window.QUORIDOR_NET_CONFIG || {};
    const Ctor = window.PubNub && window.PubNub.PubNub ? window.PubNub.PubNub : window.PubNub;
    if (!Ctor) throw new Error('PubNub SDK unavailable');
    const pn = new Ctor({ subscribeKey: cfg.pubnubSubscribeKey, publishKey: cfg.pubnubPublishKey, userId: this.id, ssl: true });
    const channel = this.channelName(this.code);
    pn.addListener({ message: (e) => this.handleIncoming(e.message), status: (e) => this.handlePubNubStatus(e) });
    pn.subscribe({ channels: [channel] });
    return {
      name: 'pubnub',
      send: (msg) => { const r = pn.publish({ channel, message: msg }); if (r && typeof r.catch === 'function') r.catch(() => {}); },
      close: () => { try { pn.unsubscribeAll(); } catch (e) {} try { pn.destroy(); } catch (e) {} }
    };
  }
}
