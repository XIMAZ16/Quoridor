// Bot evaluation and search algorithms. Depends on game.js engine functions.
/* ===== Bot ===== */
function candidates(s, pi, pathLimit) {
  const list = pawnMoves(s, pi).map(m => ({ t: 'p', r: m.r, c: m.c }));
  if (s.w[pi] > 0) {
    const opp = 1 - pi, path = bfsCore(s, opp, true).path || [], seen = new Set();
    for (const idx of path.slice(0, pathLimit)) {
      const r = (idx / 9) | 0, c = idx % 9;
      for (let i = r - 1; i <= r; i++) for (let j = c - 1; j <= c; j++) for (let o = 0; o < 2; o++) {
        const key = o * 64 + i * 8 + j;
        if (i < 0 || i > 7 || j < 0 || j > 7 || seen.has(key)) continue;
        seen.add(key);
        if (wallLegal(s, o, i, j)) list.push({ t: 'w', o, i, j });
      }
    }
  }
  return list;
}
function evalState(s, b) {
  const w = winnerOf(s);
  if (w === b) return 10000; if (w === 1 - b) return -10000;
  return (distTo(s, 1 - b) - distTo(s, b)) * 10 + (s.w[b] - s.w[1 - b]) * 1.2;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function search(s, depth, alpha, beta, b, pathLimit) {
  const w = winnerOf(s);
  if (w >= 0) return (w === b ? 10000 : -10000) + (w === b ? depth : -depth);
  if (depth === 0) return evalState(s, b);
  const moves = candidates(s, s.turn, pathLimit);
  if (s.turn === b) {
    let best = -Infinity;
    for (const m of moves) { best = Math.max(best, search(applyMove(s, m), depth - 1, alpha, beta, b, pathLimit)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { best = Math.min(best, search(applyMove(s, m), depth - 1, alpha, beta, b, pathLimit)); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}
function botBestMove(s, difficulty) {
  const b = s.turn;
  const pathLimit = difficulty === 'hard' ? 5 : 6;
  const moves = shuffle(candidates(s, b, pathLimit));
  if (!moves.length) return null;
  if (difficulty === 'easy') {
    const pawns = moves.filter(m => m.t === 'p');
    if (Math.random() < 0.3 && pawns.length) return pawns[(Math.random() * pawns.length) | 0];
    let best = null, bs = -Infinity;
    for (const m of moves) { const v = evalState(applyMove(s, m), b) + Math.random() * 14; if (v > bs) { bs = v; best = m; } }
    return best;
  }
  const depth = difficulty === 'hard' ? 3 : 2;
  let best = moves[0], alpha = -Infinity;
  for (const m of moves) {
    const v = search(applyMove(s, m), depth - 1, alpha, Infinity, b, pathLimit);
    if (v > alpha) { alpha = v; best = m; }
  }
  return best;
}
