// Core Quoridor rules, state management, board rendering, and UI controller.
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inb = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;

function newState() {
  return { p: [{ r: 8, c: 4 }, { r: 0, c: 4 }], h: new Uint8Array(64), v: new Uint8Array(64), w: [10, 10], turn: 0 };
}
function cloneState(s) {
  return { p: [{ r: s.p[0].r, c: s.p[0].c }, { r: s.p[1].r, c: s.p[1].c }], h: s.h.slice(), v: s.v.slice(), w: s.w.slice(), turn: s.turn };
}
const hasH = (s, i, j) => i >= 0 && i < 8 && j >= 0 && j < 8 && s.h[i * 8 + j] > 0;
const hasV = (s, i, j) => i >= 0 && i < 8 && j >= 0 && j < 8 && s.v[i * 8 + j] > 0;

function blocked(s, r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nr > 8 || nc < 0 || nc > 8) return true;
  if (dr === -1) return hasH(s, r - 1, c) || hasH(s, r - 1, c - 1);
  if (dr === 1) return hasH(s, r, c) || hasH(s, r, c - 1);
  if (dc === -1) return hasV(s, r, c - 1) || hasV(s, r - 1, c - 1);
  return hasV(s, r, c) || hasV(s, r - 1, c);
}

function pawnMoves(s, pi) {
  const me = s.p[pi], op = s.p[1 - pi], res = [];
  for (const [dr, dc] of DIRS) {
    if (blocked(s, me.r, me.c, dr, dc)) continue;
    const nr = me.r + dr, nc = me.c + dc;
    if (nr === op.r && nc === op.c) {
      if (!blocked(s, nr, nc, dr, dc)) {
        res.push({ r: nr + dr, c: nc + dc });
      } else {
        const sides = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
        for (const [sr, sc] of sides) {
          if (!blocked(s, nr, nc, sr, sc)) res.push({ r: nr + sr, c: nc + sc });
        }
      }
    } else {
      res.push({ r: nr, c: nc });
    }
  }
  return res;
}

// Shortest path to goal row, ignoring pawns. Returns { dist, path } (path = cell indices start..goal)
function bfsCore(s, pi, wantPath) {
  const goal = pi === 0 ? 0 : 8, st = s.p[pi];
  const start = st.r * 9 + st.c;
  const d = new Int16Array(81).fill(-1);
  const prev = wantPath ? new Int16Array(81).fill(-1) : null;
  const q = [start]; d[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], r = (cur / 9) | 0, c = cur % 9;
    if (r === goal) {
      if (!wantPath) return { dist: d[cur], path: null };
      const path = []; for (let x = cur; x !== -1; x = prev[x]) path.push(x);
      return { dist: d[cur], path: path.reverse() };
    }
    for (const [dr, dc] of DIRS) {
      if (blocked(s, r, c, dr, dc)) continue;
      const nx = (r + dr) * 9 + (c + dc);
      if (d[nx] < 0) { d[nx] = d[cur] + 1; if (prev) prev[nx] = cur; q.push(nx); }
    }
  }
  return { dist: Infinity, path: null };
}
const distTo = (s, pi) => bfsCore(s, pi, false).dist;

function wallFree(s, o, i, j) {
  if (i < 0 || i > 7 || j < 0 || j > 7) return false;
  const k = i * 8 + j;
  if (s.h[k] || s.v[k]) return false;
  if (o === 0) { if (j > 0 && s.h[k - 1]) return false; if (j < 7 && s.h[k + 1]) return false; }
  else { if (i > 0 && s.v[k - 8]) return false; if (i < 7 && s.v[k + 8]) return false; }
  return true;
}
function wallLegal(s, o, i, j) {
  if (!wallFree(s, o, i, j)) return false;
  const arr = o === 0 ? s.h : s.v, k = i * 8 + j;
  arr[k] = 1;
  const ok = distTo(s, 0) < Infinity && distTo(s, 1) < Infinity;
  arr[k] = 0;
  return ok;
}
function applyMove(s, m) {
  const n = cloneState(s);
  if (m.t === 'p') { n.p[s.turn].r = m.r; n.p[s.turn].c = m.c; }
  else { (m.o === 0 ? n.h : n.v)[m.i * 8 + m.j] = s.turn + 1; n.w[s.turn]--; }
  n.turn = 1 - s.turn;
  return n;
}
function winnerOf(s) { if (s.p[0].r === 0) return 0; if (s.p[1].r === 8) return 1; return -1; }
function validateMove(s, m) {
  if (!m) return false;
  if (m.t === 'p') return pawnMoves(s, s.turn).some(x => x.r === m.r && x.c === m.c);
  if (m.t === 'w') return (m.o === 0 || m.o === 1) && s.w[s.turn] > 0 && wallLegal(s, m.o, m.i, m.j);
  return false;
}

/* ==========================================================================
   GAME CONTROLLER + UI
   ========================================================================== */
class QuoridorGame {
  constructor() {
    this.mode = 'bot';
    this.difficulty = 'medium';
    this.actionMode = 'move';
    this.pending = null;
    this.isTouch = window.matchMedia && window.matchMedia('(hover: none)').matches;
    this.scores = this.loadScores();

    this.dialogue = {
      thinking: [
        'อืม... ตานี้ต้องสุขุม คิดลึกแป๊บนะเพื่อน...',
        'ขอเวลาจิบน้ำแป๊บ เขาวงกตนี้ซับซ้อนจัดเลย!',
        'กำลังคำนวณเส้นทางสั้นที่สุด... อย่าเพิ่งใจร้อนนะ!',
        'อ่านเกมล่วงหน้าหลายตา... แป๊บเดียวนะเพื่อน!',
        'หืม... มีช่องว่างให้ตีกำแพงน่าสนใจ ขอประเมินแป๊บ!'
      ],
      playerTurnStart: [
        'ตาเธอแล้วเพื่อน! ค่อยๆ คิด ไม่ต้องรีบนะ',
        'จะเดินหรือจะวางกำแพงดีเอ่ย? ให้ดูฝีมือหน่อย!',
        'ลุยเลยเพื่อน อย่าให้ฉันถึงเส้นชัยก่อนนะ หึๆ'
      ],
      playerIdle: [
        'คิดนานจังเพื่อน กาแฟฉันจะหมดแก้วแล้วเนี่ย 555 ☕',
        'แอบเปิดสูตรมารึเปล่าเนี่ย? เงียบไปนานเลยนะ!',
        'ค่อย ๆ คิดได้ ไม่ต้องรีบ... แต่เดินไว ๆ หน่อยก็ดีนะ 😆',
        'อย่าลืมหายใจนะเพื่อน ตานี้ลุ้นระทึกจริง!'
      ],
      botMoved: ['จัดไป! ดูซิว่าจะแก้หมากนี้ยังไง!', 'ก้าวนี้สวยงามตามตำรา!', 'วางแผนไว้หมดแล้ว ตาเธอแล้วเพื่อน!'],
      botWall: ['ฮ่าๆ กำแพงนี้ขอกั้นหน้าเธอนะเพื่อน! 🧱', 'ขอโทษทีนะ ทางนี้ปิดซ่อม! 🚧', 'เจอกำแพงนี้ไปก่อน แล้วหาทางใหม่เลย!'],
      playerWall: ['โอ้โห กั้นทางฉันเฉยเลย! ต้องหาทางอ้อมแล้ว', 'กำแพงสวยนะเพื่อน แต่ฉันยังไม่ยอมแพ้!'],
      playerGameWin: ['สุดยอดไปเลยเพื่อน! ยอมรับในฝีมือเลย คารวะ 1 จอก! 🏆', 'เฉียบขาดมาก! เส้นชัยเป็นของเธอแล้ว 👑'],
      botGameWin: ['เกมนี้สนุกมากเพื่อน! ตาหน้าแก้ตัวใหม่นะ! 🤖', 'เกือบไปเหมือนกันนะเนี่ย! ฝีมือเธอพัฒนาขึ้นเยอะมาก!']
    };

    this.playerIdleTimer = null;
    this.aiMidThinkTimer = null;
    this.aiTimer = null;
    this.hintTimer = null;

    this.initDOM();
    this.resetGame();
    this.bindEvents();
    this.handleInviteLink();
  }

  /* ---------- storage ---------- */
  loadScores() {
    const def = { bot: { x: 0, o: 0 }, pvp: { x: 0, o: 0 }, online: { x: 0, o: 0 } };
    try {
      const saved = localStorage.getItem('retro_quoridor_scores');
      if (!saved) return def;
      const parsed = JSON.parse(saved), merged = {};
      Object.keys(def).forEach(k => { merged[k] = Object.assign({}, def[k], parsed[k] || {}); });
      return merged;
    } catch (e) { return def; }
  }
  saveScores() { try { localStorage.setItem('retro_quoridor_scores', JSON.stringify(this.scores)); } catch (e) {} }

  /* ---------- DOM ---------- */
  initDOM() {
    const $ = (id) => document.getElementById(id);
    this.boardEl = $('qboard');
    this.turnIndicatorEl = $('turn-indicator'); this.turnPlayerMarkEl = $('turn-player-mark'); this.turnTextEl = $('turn-text');
    this.boardHintEl = $('board-hint');
    this.scoreXEl = $('score-x'); this.scoreOEl = $('score-o'); this.moveCountEl = $('move-count');
    this.labelXEl = $('label-x'); this.labelOEl = $('label-o'); this.wallsXEl = $('walls-x'); this.wallsOEl = $('walls-o');
    this.modeBtns = document.querySelectorAll('.mode-btn'); this.diffBtns = document.querySelectorAll('.diff-btn');
    this.diffContainerEl = $('difficulty-container');
    this.actMoveBtn = $('act-move'); this.actWallBtn = $('act-wall');
    this.botChatSectionEl = $('bot-chat-section'); this.botAvatarEl = $('bot-avatar'); this.speechTextEl = $('speech-text'); this.chatToggleBtn = $('chat-toggle-btn');
    try { this.isChatMuted = localStorage.getItem('retro_quoridor_chat_muted') === 'true'; } catch (e) { this.isChatMuted = false; }
    if (this.isChatMuted) { this.botChatSectionEl.classList.add('chat-hidden'); this.chatToggleBtn.textContent = '🤫'; }
    this.modalEl = $('result-modal'); this.modalTitleEl = $('modal-title'); this.modalSubtitleEl = $('modal-subtitle'); this.modalIconEl = $('modal-icon'); this.playAgainBtn = $('play-again-btn');
    this.rulesModalEl = $('rules-modal'); this.openRulesBtn = $('open-rules-btn'); this.closeRulesBtn = $('close-rules-btn'); this.rulesOkBtn = $('rules-ok-btn');
    this.restartBtn = $('restart-btn'); this.muteBtn = $('mute-btn');
    this.onlineBarEl = $('online-bar'); this.onlineCodeEl = $('online-room-code'); this.onlineRoleEl = $('online-role'); this.onlineStatusEl = $('online-status');
    this.copyLinkBtn = $('copy-link-btn'); this.leaveRoomBtn = $('leave-room-btn');
    this.lobbyModalEl = $('lobby-modal'); this.lobbyCreateBtn = $('lobby-create-btn'); this.lobbyCloseBtn = $('lobby-close-btn');
    this.lobbyCodeBoxEl = $('lobby-code-box'); this.lobbyCodeDisplayEl = $('lobby-code-display'); this.lobbyCopyBtn = $('lobby-copy-btn');
    this.lobbyCodeInputEl = $('lobby-code-input'); this.lobbyJoinBtn = $('lobby-join-btn'); this.lobbyStatusEl = $('lobby-status'); this.lobbyTransportEl = $('lobby-transport');
    this.initOnline();
  }

  /* ---------- online ---------- */
  initOnline() {
    this.online = { active: false, code: null, isHost: false, myIdx: null, peerOnline: false, joined: false };
    this.net = new QNet({
      onMessage: (m) => this.handleNetMessage(m),
      onPeerChange: (v) => this.handlePeerChange(v),
      onStatus: (st) => this.handleNetStatus(st)
    });
    this.updateOnlineBar();
  }
  generateRoomCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '';
    for (let i = 0; i < 6; i++) code += a[Math.floor(Math.random() * a.length)];
    return code;
  }
  markModeButton(mode) { this.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode)); }
  applyModeUI() {
    const isBot = this.mode === 'bot';
    this.diffContainerEl.style.display = isBot ? 'flex' : 'none';
    this.botChatSectionEl.style.display = isBot ? 'flex' : 'none';
    this.updateOnlineBar();
  }
  get flip() { return this.mode === 'online' && this.online.active && this.online.myIdx === 1; }

  canPlayNow() {
    if (this.gameOver) return false;
    if (this.mode === 'bot') return !this.isAiThinking && this.s.turn === 0;
    if (this.mode === 'online') {
      if (!this.online.active || !this.online.joined || !this.online.peerOnline) return false;
      return this.s.turn === this.online.myIdx;
    }
    return true;
  }

  openLobby() {
    this.lobbyStatusEl.textContent = ''; this.lobbyCodeBoxEl.classList.add('hidden');
    this.lobbyTransportEl.textContent = QNet.transportName() === 'pubnub'
      ? 'โหมดออนไลน์: PubNub — เล่นข้ามเครื่องได้'
      : 'โหมดทดสอบ: ใช้ได้เฉพาะแท็บ/หน้าต่างในเบราว์เซอร์เดียวกัน';
    this.lobbyModalEl.classList.remove('hidden');
    this.updateOnlineBar();
  }
  closeLobby() { this.lobbyModalEl.classList.add('hidden'); }
  cancelLobby() {
    this.closeLobby();
    if (!this.online.active && this.mode === 'online') { this.mode = 'bot'; this.markModeButton('bot'); this.applyModeUI(); this.resetGame(); }
  }
  createRoom() {
    const code = this.generateRoomCode();
    this.transportWarning = null;
    this.online = { active: true, code, isHost: true, myIdx: 0, peerOnline: false, joined: true };
    this.mode = 'online'; this.markModeButton('online'); this.applyModeUI();
    this.lobbyCodeBoxEl.classList.remove('hidden'); this.lobbyCodeDisplayEl.textContent = code;
    this.lobbyStatusEl.textContent = 'รอคู่แข่งเข้าห้อง...';
    this.updateOnlineBar(); this.resetGame(); this.net.connect(code);
  }
  joinRoom(input) {
    const code = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) { this.lobbyStatusEl.textContent = 'รหัสห้องต้องมี 6 ตัวอักษร'; return; }
    this.transportWarning = null;
    this.online = { active: true, code, isHost: false, myIdx: 1, peerOnline: false, joined: true };
    this.mode = 'online'; this.markModeButton('online'); this.applyModeUI();
    this.lobbyCodeBoxEl.classList.remove('hidden'); this.lobbyCodeDisplayEl.textContent = code;
    this.lobbyStatusEl.textContent = `กำลังเข้าห้อง ${code}...`;
    this.updateOnlineBar(); this.resetGame();
    this.net.connect(code).then((ok) => { if (ok) this.net.send({ type: 'hello' }); });
  }
  leaveRoom() {
    if (this.net) { this.net.send({ type: 'leave' }); this.net.disconnect(); }
    this.online = { active: false, code: null, isHost: false, myIdx: null, peerOnline: false, joined: false };
    this.closeLobby(); this.updateOnlineBar();
  }
  getRoomLink() {
    const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : null;
    return base ? `${base}?room=${this.online.code}` : null;
  }
  async copyRoomLink() {
    if (!this.online.code) return;
    const link = this.getRoomLink(), text = link || this.online.code;
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
    const msg = copied
      ? (link ? 'คัดลอกลิงก์เชิญแล้ว ส่งให้เพื่อนได้เลย!' : `คัดลอกรหัส ${this.online.code} แล้ว`)
      : (link ? `ส่งลิงก์นี้ให้เพื่อน: ${link}` : `รหัสห้อง: ${this.online.code}`);
    this.lobbyStatusEl.textContent = msg; this.onlineStatusEl.title = msg;
  }
  handleInviteLink() {
    let raw = null;
    try { raw = new URLSearchParams(location.search).get('room'); } catch (e) {}
    if (!raw) return;
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) return;
    this.markModeButton('online'); this.openLobby(); this.joinRoom(code);
  }
  updateOnlineBar() {
    const active = this.mode === 'online' && this.online.active;
    this.onlineBarEl.classList.toggle('hidden', !active);
    if (!active) return;
    this.onlineCodeEl.textContent = this.online.code || '------';
    this.onlineRoleEl.textContent = this.online.isHost ? 'เจ้าของห้อง (X)' : 'ผู้เข้าร่วม (O)';
    const transport = QNet.transportName() === 'pubnub' ? 'PubNub' : 'ทดสอบในเบราว์เซอร์';
    if (this.transportWarning) {
      this.onlineStatusEl.textContent = 'เชื่อมต่อไม่สำเร็จ'; this.onlineStatusEl.className = 'online-status is-error'; this.onlineStatusEl.title = this.transportWarning; return;
    }
    this.onlineStatusEl.textContent = this.online.peerOnline ? 'คู่แข่งออนไลน์' : 'รอคู่แข่ง...';
    this.onlineStatusEl.className = this.online.peerOnline ? 'online-status is-online' : 'online-status is-waiting';
    this.onlineStatusEl.title = (this.online.peerOnline ? 'คู่แข่งเชื่อมต่อแล้ว' : 'กำลังรอคู่แข่งเข้าห้อง') + ` — ช่องทาง: ${transport}`;
  }
  handleNetStatus(st) {
    if (st.state === 'error' && st.message) {
      this.transportWarning = st.message; this.lobbyStatusEl.textContent = st.message; this.updateOnlineBar(); return;
    }
    if (st.state === 'connected' && st.transport === 'pubnub') { this.transportWarning = null; this.updateOnlineBar(); }
  }
  handlePeerChange(on) {
    if (!this.online.active) return;
    this.online.peerOnline = on;
    if (on) { this.lobbyStatusEl.textContent = 'คู่แข่งเชื่อมต่อแล้ว เริ่มเกมได้เลย!'; this.closeLobby(); }
    else this.lobbyStatusEl.textContent = 'คู่แข่งหลุดการเชื่อมต่อ...';
    this.updateOnlineBar(); this.renderBoard(); this.updateStatus();
  }
  handleNetMessage(msg) {
    if (!this.online.active || !msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'hello':
        if (this.online.isHost) { this.broadcastState(); this.lobbyStatusEl.textContent = 'คู่แข่งเข้าห้องแล้ว! เริ่มเกมได้เลย'; this.closeLobby(); }
        break;
      case 'state':
        if (!this.online.isHost) { this.applyRemoteState(msg.state); this.closeLobby(); }
        break;
      case 'move':
        if (this.online.isHost) this.applyGuestMove(msg.m);
        break;
      case 'restart':
        if (this.online.isHost) this.resetGame();
        break;
      case 'leave':
        this.lobbyStatusEl.textContent = 'คู่แข่งออกจากห้องแล้ว'; this.updateOnlineBar();
        break;
    }
  }
  broadcastState() {
    if (!this.online || !this.online.active || !this.online.isHost || !this.net) return;
    this.net.send({
      type: 'state',
      state: {
        p: this.s.p, h: Array.from(this.s.h), v: Array.from(this.s.v), w: this.s.w, turn: this.s.turn,
        gameOver: this.gameOver, winner: this.winner, last: this.last, moveCount: this.moveCount
      }
    });
  }
  applyGuestMove(m) {
    if (this.gameOver || !m || this.s.turn !== 1) return;
    if (!validateMove(this.s, m)) return;
    this.commit(m);
    this.broadcastState();
  }
  applyRemoteState(st) {
    if (!st || !st.p || !st.h || !st.v) return;
    const wasOver = this.gameOver;
    const prevKey = this.last ? JSON.stringify(this.last) : null;
    this.s = {
      p: [{ r: st.p[0].r, c: st.p[0].c }, { r: st.p[1].r, c: st.p[1].c }],
      h: Uint8Array.from(st.h), v: Uint8Array.from(st.v), w: st.w.slice(), turn: st.turn
    };
    this.gameOver = st.gameOver; this.winner = st.winner; this.last = st.last || null; this.moveCount = st.moveCount || 0;
    this.isAiThinking = false; this.pending = null;
    const nextKey = this.last ? JSON.stringify(this.last) : null;
    if (nextKey && nextKey !== prevKey && window.retroAudio) {
      this.last.t === 'w' ? window.retroAudio.playWall() : window.retroAudio.playMove(this.last.player);
    }
    if (!this.gameOver) this.hideModal();
    this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay();
    if (!wasOver && this.gameOver) this.handleGameOver(this.winner);
  }
  requestRematch() {
    if (this.mode !== 'online') { this.resetGame(); return; }
    if (this.online.isHost) this.resetGame();
    else { this.net.send({ type: 'restart' }); this.lobbyStatusEl.textContent = 'ขอเล่นใหม่อีกครั้ง...'; }
  }

  /* ---------- bot chat ---------- */
  botSpeak(category, custom = null) {
    if (this.mode !== 'bot') return;
    let text = custom;
    if (!text && this.dialogue[category]) { const l = this.dialogue[category]; text = l[Math.floor(Math.random() * l.length)]; }
    if (!text) return;
    this.speechTextEl.textContent = text;
    this.botAvatarEl.classList.remove('is-speaking'); void this.botAvatarEl.offsetWidth; this.botAvatarEl.classList.add('is-speaking');
  }
  startPlayerIdleTimer() {
    this.clearPlayerIdleTimer();
    if (this.mode !== 'bot' || this.gameOver || this.s.turn !== 0) return;
    this.playerIdleTimer = setTimeout(() => {
      if (!this.gameOver && this.s.turn === 0 && !this.isAiThinking) this.botSpeak('playerIdle');
    }, 6500);
  }
  clearPlayerIdleTimer() { if (this.playerIdleTimer) { clearTimeout(this.playerIdleTimer); this.playerIdleTimer = null; } }

  /* ---------- game flow ---------- */
  resetGame() {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this.aiMidThinkTimer) { clearTimeout(this.aiMidThinkTimer); this.aiMidThinkTimer = null; }
    this.clearPlayerIdleTimer();
    this.botAvatarEl.classList.remove('is-thinking', 'is-speaking');
    this.s = newState();
    this.gameOver = false; this.winner = null; this.isAiThinking = false; this.last = null; this.moveCount = 0;
    this.actionMode = 'move'; this.pending = null;
    this.hideModal(); this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay();
    if (this.mode === 'bot') { this.botSpeak('playerTurnStart'); this.startPlayerIdleTimer(); }
    if (this.mode === 'online' && this.online.active && this.online.isHost) this.broadcastState();
  }

  flash(msg) {
    this.boardHintEl.textContent = msg;
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { this.hintTimer = null; this.updateHint(); }, 2600);
  }
  shake(el) { el.classList.remove('shake-anim'); void el.offsetWidth; el.classList.add('shake-anim'); }

  tryHumanMove(m) {
    if (!this.canPlayNow()) { window.retroAudio.playInvalid(); this.shake(this.boardEl); return; }
    if (!validateMove(this.s, m)) {
      window.retroAudio.playInvalid(); this.shake(this.boardEl);
      this.flash(m.t === 'w' ? 'วางตรงนี้ไม่ได้ — กำแพงจะปิดทางไปเส้นชัยของผู้เล่นจนสุดทาง!' : 'เดินไปช่องนั้นไม่ได้');
      this.pending = null; this.renderBoard();
      return;
    }
    this.pending = null;
    if (this.mode === 'online' && !this.online.isHost) {
      this.net.send({ type: 'move', m });
      this.actionMode = 'move';
      return;
    }
    this.commit(m);
    this.actionMode = 'move';
    if (this.mode === 'online') this.broadcastState();
    this.renderBoard(); this.updateStatus();
    if (this.mode === 'bot' && !this.gameOver && this.s.turn === 1) this.triggerAiMove();
  }

  commit(m) {
    this.clearPlayerIdleTimer();
    const mover = this.s.turn;
    this.s = applyMove(this.s, m);
    this.moveCount++;
    this.last = Object.assign({}, m, { player: mover });
    m.t === 'w' ? window.retroAudio.playWall() : window.retroAudio.playMove(mover);

    if (this.mode === 'bot' && m.t === 'w' && mover === 0) this.botSpeak('playerWall');

    const w = winnerOf(this.s);
    if (w >= 0) {
      this.gameOver = true; this.winner = w;
      this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay();
      this.handleGameOver(w);
      return;
    }
    this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay();
    if (this.mode === 'bot' && this.s.turn === 0) this.startPlayerIdleTimer();
  }

  getAiThinkingDelay() {
    const ranges = { easy: [1200, 2500], medium: [1800, 3500], hard: [2500, 4500] };
    const [min, max] = ranges[this.difficulty];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  triggerAiMove() {
    this.clearPlayerIdleTimer();
    this.isAiThinking = true;
    this.botAvatarEl.classList.add('is-thinking');
    this.botSpeak('thinking');
    this.renderBoard(); this.updateStatus();
    const delay = this.getAiThinkingDelay();
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.aiMidThinkTimer) clearTimeout(this.aiMidThinkTimer);
    if (delay >= 2800) {
      this.aiMidThinkTimer = setTimeout(() => {
        if (this.isAiThinking && !this.gameOver) {
          const l = ['กำลังวิเคราะห์เส้นทางของเธอ... 🤔', 'โอเค ใกล้ได้ก้าวที่เฉียบคมแล้ว!', 'อ่านเกมทะลุปรุโปร่งแล้ว พร้อมลุย!'];
          this.botSpeak(null, l[Math.floor(Math.random() * l.length)]);
        }
      }, Math.floor(delay * 0.52));
    }
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.gameOver) { this.isAiThinking = false; this.botAvatarEl.classList.remove('is-thinking'); return; }
      const m = botBestMove(this.s, this.difficulty);
      this.isAiThinking = false; this.botAvatarEl.classList.remove('is-thinking');
      if (m) {
        this.botSpeak(m.t === 'w' ? 'botWall' : 'botMoved');
        this.commit(m);
        this.renderBoard(); this.updateStatus();
      }
    }, delay);
  }

  handleGameOver(w) {
    this.clearPlayerIdleTimer();
    const bucket = this.scores[this.mode];
    if (w === 0) bucket.x++; else bucket.o++;
    this.saveScores(); this.updateScoreboardDisplay();
    if (this.mode === 'bot') {
      if (w === 0) { window.retroAudio.playGameWin(); this.botSpeak('playerGameWin'); }
      else { window.retroAudio.playDraw(); this.botSpeak('botGameWin'); }
    } else window.retroAudio.playGameWin();
    setTimeout(() => this.showModal(w), 600);
  }

  /* ---------- rendering ---------- */
  renderBoard() {
    const s = this.s, f = this.flip, canAct = this.canPlayNow();
    const wallMode = canAct && this.actionMode === 'wall' && s.w[s.turn] > 0;
    const targets = (canAct && this.actionMode === 'move') ? pawnMoves(s, s.turn) : [];
    const isTarget = (r, c) => targets.some(t => t.r === r && t.c === c);
    this.boardEl.classList.toggle('wall-mode', wallMode);
    const frag = document.createDocumentFragment();
    const mk = (tag, cls, area, data) => {
      const e = document.createElement(tag); e.className = cls; e.style.gridArea = area;
      if (data) Object.keys(data).forEach(k => { e.dataset[k] = data[k]; });
      return e;
    };

    // cells (display coords R,C -> logical r,c)
    for (let R = 0; R < 9; R++) for (let C = 0; C < 9; C++) {
      const r = f ? 8 - R : R, c = f ? 8 - C : C;
      let cls = 'qcell';
      if (r === 0) cls += ' goal-x'; if (r === 8) cls += ' goal-o';
      if (this.last && this.last.t === 'p' && this.last.r === r && this.last.c === c) cls += ' last';
      const t = isTarget(r, c); if (t) cls += ' target';
      const cell = mk('button', cls, `${2 * R + 1} / ${2 * C + 1}`, t ? { k: 'c', r, c } : null);
      cell.setAttribute('aria-label', `แถว ${r + 1} คอลัมน์ ${c + 1}`);
      if (!t) cell.tabIndex = -1;
      for (let pi = 0; pi < 2; pi++) {
        if (s.p[pi].r === r && s.p[pi].c === c) {
          const pawn = document.createElement('div');
          pawn.className = 'pawn ' + (pi === 0 ? 'pawn-x' : 'pawn-o') + (this.gameOver && this.winner === pi ? ' winner' : '');
          pawn.textContent = pi === 0 ? 'X' : 'O';
          cell.appendChild(pawn);
        }
      }
      frag.appendChild(cell);
    }
    // placed walls
    for (let o = 0; o < 2; o++) {
      const arr = o === 0 ? s.h : s.v;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        const owner = arr[i * 8 + j]; if (!owner) continue;
        const I = f ? 7 - i : i, J = f ? 7 - j : j;
        const area = o === 0 ? `${2 * I + 2} / ${2 * J + 1} / span 1 / span 3` : `${2 * I + 1} / ${2 * J + 2} / span 3 / span 1`;
        let cls = 'wall ' + (o === 0 ? 'h' : 'v') + (owner === 1 ? ' w-x' : ' w-o');
        if (this.last && this.last.t === 'w' && this.last.o === o && this.last.i === i && this.last.j === j) cls += ' last';
        frag.appendChild(mk('div', cls, area));
      }
    }
    // wall slots (only the ones structurally free)
    for (let o = 0; o < 2; o++) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      if (!wallFree(s, o, i, j)) continue;
      const I = f ? 7 - i : i, J = f ? 7 - j : j;
      const area = o === 0 ? `${2 * I + 2} / ${2 * J + 1} / span 1 / span 3` : `${2 * I + 1} / ${2 * J + 2} / span 3 / span 1`;
      let cls = 'slot ' + (o === 0 ? 'h' : 'v');
      if (this.pending && this.pending.o === o && this.pending.i === i && this.pending.j === j) cls += ' pending';
      const slot = mk('button', cls, area, { k: o === 0 ? 'h' : 'v', i, j });
      slot.tabIndex = -1;
      slot.setAttribute('aria-label', o === 0 ? `กำแพงแนวนอน ${i + 1},${j + 1}` : `กำแพงแนวตั้ง ${i + 1},${j + 1}`);
      frag.appendChild(slot);
    }
    this.boardEl.innerHTML = '';
    this.boardEl.appendChild(frag);
  }

  onBoardClick(e) {
    const el = e.target.closest('[data-k]'); if (!el) return;
    const k = el.dataset.k;
    if (k === 'c') {
      if (this.actionMode !== 'move') return;
      this.tryHumanMove({ t: 'p', r: +el.dataset.r, c: +el.dataset.c });
      return;
    }
    if (this.actionMode !== 'wall') return;
    if (!this.canPlayNow()) return;
    const o = k === 'h' ? 0 : 1, i = +el.dataset.i, j = +el.dataset.j;
    if (this.isTouch) {
      const same = this.pending && this.pending.o === o && this.pending.i === i && this.pending.j === j;
      if (!same) { this.pending = { o, i, j }; window.retroAudio.playClick(); this.renderBoard(); this.flash('แตะซ้ำที่เดิมเพื่อยืนยันวางกำแพง'); return; }
    }
    this.pending = null;
    this.tryHumanMove({ t: 'w', o, i, j });
  }

  setActionMode(mode) {
    if (mode === 'wall' && (!this.canPlayNow() || this.s.w[this.s.turn] <= 0)) { window.retroAudio.playInvalid(); return; }
    this.actionMode = mode; this.pending = null;
    this.renderBoard(); this.updateStatus();
  }

  nameOf(idx) {
    if (this.mode === 'bot') return idx === 0 ? 'คุณ' : 'บอท';
    if (this.mode === 'online') return idx === this.online.myIdx ? 'คุณ' : 'คู่แข่ง';
    return `ผู้เล่น ${idx === 0 ? 'X' : 'O'}`;
  }

  updateHint() {
    if (this.hintTimer) return;
    const s = this.s;
    if (this.gameOver) { this.boardHintEl.textContent = 'กดเริ่มเกมใหม่เพื่อประลองอีกครั้ง'; return; }
    if (this.mode === 'online' && !this.online.peerOnline) { this.boardHintEl.textContent = 'รอคู่แข่งเข้าห้อง...'; return; }
    if (this.isAiThinking) { this.boardHintEl.textContent = ''; return; }
    const goalText = s.turn === 0 ? 'แถวบนสุด (เส้นสีฟ้า)' : 'แถวล่างสุด (เส้นสีชมพู)';
    const meGoal = this.flip ? (s.turn === 0 ? 'แถวล่างสุด' : 'แถวบนสุด') : goalText;
    if (!this.canPlayNow()) { this.boardHintEl.innerHTML = `เป้าหมายของ ${this.nameOf(s.turn)}: ไปให้ถึง${meGoal}`; return; }
    if (this.actionMode === 'wall') {
      this.boardHintEl.innerHTML = '<span class="badge-free">🧱 โหมดกำแพง</span> ' + (this.isTouch ? 'แตะร่องระหว่างช่อง แล้วแตะซ้ำเพื่อยืนยัน' : 'คลิกร่องระหว่างช่องเพื่อวางกำแพง (ยาว 2 ช่อง)');
    } else {
      this.boardHintEl.innerHTML = `เลือกช่องที่เรืองแสง เป้าหมาย: ${meGoal}`;
    }
  }

  updateStatus() {
    const s = this.s;
    if (this.gameOver) {
      this.turnIndicatorEl.classList.remove('is-thinking');
      this.turnPlayerMarkEl.textContent = '🏁'; this.turnPlayerMarkEl.className = 'player-badge';
      const name = this.mode === 'bot' ? (this.winner === 0 ? 'ผู้เล่น X' : 'บอท (CPU)') : `ผู้เล่น ${this.winner === 0 ? 'X' : 'O'}`;
      this.turnTextEl.textContent = `${name} ชนะเกม!`;
    } else {
      const mark = s.turn === 0 ? 'X' : 'O';
      this.turnPlayerMarkEl.textContent = mark; this.turnPlayerMarkEl.className = `player-badge badge-${mark.toLowerCase()}`;
      if (this.isAiThinking) {
        this.turnIndicatorEl.classList.add('is-thinking');
        this.turnTextEl.innerHTML = '<span class="thinking-text">🤖 บอทกำลังคิด</span><span class="thinking-dots"></span>';
      } else {
        this.turnIndicatorEl.classList.remove('is-thinking');
        if (this.mode === 'bot') this.turnTextEl.textContent = s.turn === 0 ? 'ตาของคุณ (X)' : 'ตาของบอท (O)';
        else if (this.mode === 'online') {
          if (!this.online.peerOnline) this.turnTextEl.textContent = 'รอคู่แข่งเชื่อมต่อ...';
          else this.turnTextEl.textContent = s.turn === this.online.myIdx ? `ตาคุณ (${mark})` : `ตาคู่แข่ง (${mark})`;
        } else this.turnTextEl.textContent = `ตาผู้เล่น ${mark}`;
      }
    }
    const can = this.canPlayNow();
    this.actMoveBtn.disabled = !can;
    this.actWallBtn.disabled = !can || s.w[s.turn] <= 0;
    this.actMoveBtn.classList.toggle('active', this.actionMode === 'move');
    this.actWallBtn.classList.toggle('active', this.actionMode === 'wall');
    this.actWallBtn.textContent = `🧱 วางกำแพง (${s.w[s.turn]})`;
    this.moveCountEl.textContent = this.moveCount + (this.gameOver ? 0 : 1);
    this.wallsXEl.textContent = `🧱 ${s.w[0]}`; this.wallsOEl.textContent = `🧱 ${s.w[1]}`;
    this.updateHint();
  }

  updateScoreboardDisplay() {
    const sc = this.scores[this.mode] || { x: 0, o: 0 };
    this.scoreXEl.textContent = sc.x; this.scoreOEl.textContent = sc.o;
    if (this.mode === 'bot') { this.labelXEl.textContent = 'ผู้เล่น X'; this.labelOEl.textContent = 'บอท (O)'; }
    else if (this.mode === 'online') {
      this.labelXEl.textContent = this.online.myIdx === 0 ? 'คุณ (X)' : 'คู่แข่ง (X)';
      this.labelOEl.textContent = this.online.myIdx === 1 ? 'คุณ (O)' : 'คู่แข่ง (O)';
    } else { this.labelXEl.textContent = 'ผู้เล่น X'; this.labelOEl.textContent = 'ผู้เล่น O'; }
  }

  showModal(w) {
    const mark = w === 0 ? 'X' : 'O';
    const mine = (this.mode === 'bot' && w === 0) || this.mode === 'pvp' || (this.mode === 'online' && w === this.online.myIdx);
    if (mine) {
      this.modalTitleEl.textContent = `VICTORY! ${mark} WINS`;
      if (this.mode === 'bot') this.modalSubtitleEl.textContent = `ยอดเยี่ยมมาก! คุณเอาชนะบอทระดับ ${this.getDifficultyThai()} ได้สำเร็จ!`;
      else if (this.mode === 'online') this.modalSubtitleEl.textContent = 'คุณถึงเส้นชัยก่อนคู่แข่งออนไลน์! สุดยอดมาก!';
      else this.modalSubtitleEl.textContent = `ขอแสดงความยินดีกับ ผู้เล่น ${mark} ถึงเส้นชัยก่อน!`;
      this.modalIconEl.textContent = w === 0 ? '⚡' : '👑';
      this.modalIconEl.className = `modal-icon ${mark.toLowerCase()}-glow`;
    } else {
      this.modalTitleEl.textContent = 'GAME OVER!';
      this.modalSubtitleEl.textContent = this.mode === 'online' ? 'คู่แข่งถึงเส้นชัยก่อน ลองใหม่อีกครั้ง!' : `บอทระดับ ${this.getDifficultyThai()} ถึงเส้นชัยก่อน ลองใหม่อีกครั้ง!`;
      this.modalIconEl.textContent = '🤖'; this.modalIconEl.className = 'modal-icon o-glow';
    }
    this.modalEl.classList.remove('hidden');
  }
  hideModal() { this.modalEl.classList.add('hidden'); }
  getDifficultyThai() { return this.difficulty === 'easy' ? 'ง่าย (Easy)' : this.difficulty === 'medium' ? 'ปานกลาง (Medium)' : 'ยาก (Hard)'; }

  /* ---------- events ---------- */
  bindEvents() {
    const click = () => window.retroAudio.playClick();
    this.boardEl.addEventListener('click', (e) => this.onBoardClick(e));
    this.actMoveBtn.addEventListener('click', () => { click(); this.setActionMode('move'); });
    this.actWallBtn.addEventListener('click', () => { click(); this.setActionMode('wall'); });

    this.modeBtns.forEach(btn => btn.addEventListener('click', () => {
      click();
      const nm = btn.dataset.mode;
      if (nm === this.mode && nm !== 'online') return;
      if (this.mode === 'online' && nm !== 'online') this.leaveRoom();
      if (this.mode === 'online' && nm === 'online') { this.openLobby(); return; }
      this.modeBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
      this.mode = nm; this.applyModeUI();
      if (nm === 'online') this.openLobby(); else this.resetGame();
    }));

    this.chatToggleBtn.addEventListener('click', () => {
      this.isChatMuted = !this.isChatMuted;
      try { localStorage.setItem('retro_quoridor_chat_muted', this.isChatMuted); } catch (e) {}
      this.botChatSectionEl.classList.toggle('chat-hidden', this.isChatMuted);
      this.chatToggleBtn.textContent = this.isChatMuted ? '🤫' : '💬';
      click();
    });

    this.diffBtns.forEach(btn => btn.addEventListener('click', () => {
      click();
      this.diffBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
      this.difficulty = btn.dataset.diff; this.resetGame();
    }));

    this.restartBtn.addEventListener('click', () => { click(); this.requestRematch(); });
    this.playAgainBtn.addEventListener('click', () => { click(); this.requestRematch(); });

    this.lobbyCreateBtn.addEventListener('click', () => { click(); this.createRoom(); });
    this.lobbyJoinBtn.addEventListener('click', () => { click(); this.joinRoom(this.lobbyCodeInputEl.value); });
    this.lobbyCodeInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.joinRoom(this.lobbyCodeInputEl.value); } });
    this.lobbyCodeInputEl.addEventListener('input', () => {
      this.lobbyCodeInputEl.value = this.lobbyCodeInputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
    this.lobbyCloseBtn.addEventListener('click', () => { click(); this.cancelLobby(); });
    this.lobbyModalEl.addEventListener('click', (e) => { if (e.target === this.lobbyModalEl) this.cancelLobby(); });
    this.lobbyCopyBtn.addEventListener('click', () => { click(); this.copyRoomLink(); });
    this.copyLinkBtn.addEventListener('click', () => { click(); this.copyRoomLink(); });
    this.leaveRoomBtn.addEventListener('click', () => {
      click(); this.leaveRoom(); this.mode = 'bot'; this.markModeButton('bot'); this.applyModeUI(); this.resetGame();
    });

    this.openRulesBtn.addEventListener('click', () => { click(); this.rulesModalEl.classList.remove('hidden'); });
    this.closeRulesBtn.addEventListener('click', () => { click(); this.rulesModalEl.classList.add('hidden'); });
    this.rulesOkBtn.addEventListener('click', () => { click(); this.rulesModalEl.classList.add('hidden'); });
    this.rulesModalEl.addEventListener('click', (e) => { if (e.target === this.rulesModalEl) this.rulesModalEl.classList.add('hidden'); });

    this.muteBtn.addEventListener('click', () => {
      const m = window.retroAudio.toggleMute();
      this.muteBtn.textContent = m ? '🔇' : '🔊';
    });
    if (window.retroAudio.isMuted) this.muteBtn.textContent = '🔇';
  }
}

document.addEventListener('DOMContentLoaded', () => { window.game = new QuoridorGame(); });
