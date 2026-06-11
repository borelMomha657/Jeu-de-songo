import { useState, useCallback } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const RULES = {
  pitsPerPlayer: 7,
  initialSeeds: 5,
  totalSeeds: 70,
  victoryScore: 40,
  lowBoardLimit: 10,
  captureValues: [2, 3, 4],
};

const CYCLE = [
  { player: "north", pitIndex: 0 },
  { player: "north", pitIndex: 1 },
  { player: "north", pitIndex: 2 },
  { player: "north", pitIndex: 3 },
  { player: "north", pitIndex: 4 },
  { player: "north", pitIndex: 5 },
  { player: "north", pitIndex: 6 },
  { player: "south", pitIndex: 6 },
  { player: "south", pitIndex: 5 },
  { player: "south", pitIndex: 4 },
  { player: "south", pitIndex: 3 },
  { player: "south", pitIndex: 2 },
  { player: "south", pitIndex: 1 },
  { player: "south", pitIndex: 0 },
];

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function other(player) { return player === "north" ? "south" : "north"; }
function sum(arr) { return arr.reduce((t, v) => t + v, 0); }
function boardSeeds(state) { return sum(state.board.north) + sum(state.board.south); }
function totalSeedsCount(state) { return state.scores.north + state.scores.south + boardSeeds(state); }

function samePos(a, b) { return a.player === b.player && a.pitIndex === b.pitIndex; }
function cycleIndexOf(pos) { return CYCLE.findIndex(p => samePos(p, pos)); }

function nextPositionsAfter(source) {
  const start = cycleIndexOf(source);
  const positions = [];
  for (let step = 1; step <= 13; step++) {
    positions.push(CYCLE[(start + step) % CYCLE.length]);
  }
  return positions;
}

function attackPit(player) {
  return player === "north" ? { player: "north", pitIndex: 6 } : { player: "south", pitIndex: 0 };
}

function opponentFirstPit(player) {
  return player === "north" ? { player: "south", pitIndex: 6 } : { player: "north", pitIndex: 0 };
}

function opponentPath(player) {
  return player === "north"
    ? [6, 5, 4, 3, 2, 1, 0].map(i => ({ player: "south", pitIndex: i }))
    : [0, 1, 2, 3, 4, 5, 6].map(i => ({ player: "north", pitIndex: i }));
}

function isOpponentPit(player, position) { return position.player === other(player); }
function isCaptureValue(n) { return n === 2 || n === 3 || n === 4; }

function cloneState(state) {
  return {
    board: { north: [...state.board.north], south: [...state.board.south] },
    scores: { ...state.scores },
    currentPlayer: state.currentPlayer,
    status: state.status,
    winner: state.winner,
    reason: state.reason,
    moveNumber: state.moveNumber,
    history: [...state.history],
  };
}

// ─── SOWING ───────────────────────────────────────────────────────────────────
function sowNormal(state, player, pitIndex) {
  const seeds = state.board[player][pitIndex];
  const source = { player, pitIndex };
  state.board[player][pitIndex] = 0;
  const path = nextPositionsAfter(source);
  const visited = [];
  for (let i = 0; i < seeds; i++) {
    const pos = path[i];
    state.board[pos.player][pos.pitIndex] += 1;
    visited.push(pos);
  }
  return { visited, lastPosition: visited[visited.length - 1], specialCapture: 0 };
}

function sowGranary(state, player, pitIndex) {
  const seeds = state.board[player][pitIndex];
  const source = { player, pitIndex };
  state.board[player][pitIndex] = 0;
  const visited = [];
  let remaining = seeds;

  for (const pos of nextPositionsAfter(source)) {
    state.board[pos.player][pos.pitIndex] += 1;
    visited.push(pos);
    remaining -= 1;
  }

  const path = opponentPath(player);
  let specialCapture = 0;
  for (let i = 0; i < remaining; i++) {
    const pos = path[i % path.length];
    const isLast = i === remaining - 1;
    const isProtected = samePos(pos, opponentFirstPit(player));
    if (isLast && isProtected) {
      specialCapture += 1;
      visited.push(pos);
      continue;
    }
    state.board[pos.player][pos.pitIndex] += 1;
    visited.push(pos);
  }

  return { visited, lastPosition: visited[visited.length - 1], specialCapture };
}

function sow(state, player, pitIndex) {
  const seeds = state.board[player][pitIndex];
  if (seeds <= 0) throw new Error("Empty pit");
  return seeds <= 13 ? sowNormal(state, player, pitIndex) : sowGranary(state, player, pitIndex);
}

// ─── CAPTURE ─────────────────────────────────────────────────────────────────
function canStartCapture(state, player, lastPos) {
  if (!isOpponentPit(player, lastPos)) return false;
  if (samePos(lastPos, opponentFirstPit(player))) return false;
  return isCaptureValue(state.board[lastPos.player][lastPos.pitIndex]);
}

function captureChainPositions(state, player, lastPos) {
  const path = opponentPath(player);
  const lastIndex = path.findIndex(p => samePos(p, lastPos));
  if (lastIndex <= 0) return [];
  const captured = [];
  for (let idx = lastIndex; idx >= 0; idx--) {
    const pos = path[idx];
    const count = state.board[pos.player][pos.pitIndex];
    if (!isCaptureValue(count)) break;
    captured.push({ player: pos.player, pitIndex: pos.pitIndex, seeds: count });
  }
  return captured;
}

function wouldEmptyOpponent(state, player, captureList) {
  const opp = other(player);
  const remaining = [...state.board[opp]];
  for (const c of captureList) remaining[c.pitIndex] -= c.seeds;
  return sum(remaining) === 0;
}

function applyCaptureIfAllowed(state, player, captureList) {
  if (captureList.length === 0) return 0;
  if (wouldEmptyOpponent(state, player, captureList)) return 0;
  let total = 0;
  for (const c of captureList) {
    state.board[c.player][c.pitIndex] -= c.seeds;
    total += c.seeds;
  }
  state.scores[player] += total;
  return total;
}

function resolveCaptures(state, player, sowingResult) {
  if (sowingResult.specialCapture > 0) {
    state.scores[player] += sowingResult.specialCapture;
    return { captured: sowingResult.specialCapture, type: "special-granary" };
  }
  const last = sowingResult.lastPosition;
  if (!canStartCapture(state, player, last)) return { captured: 0, type: "none" };
  const captureList = captureChainPositions(state, player, last);
  const captured = applyCaptureIfAllowed(state, player, captureList);
  return {
    captured,
    type: captured > 0 && captureList.length > 1 ? "chain" : "normal",
    cancelledBecauseStarvation: captured === 0 && captureList.length > 0,
  };
}

// ─── LEGAL MOVES ─────────────────────────────────────────────────────────────
function opponentCampIsEmpty(state, player) { return sum(state.board[other(player)]) === 0; }

function isAttackPitMove(player, pitIndex) {
  return attackPit(player).pitIndex === pitIndex;
}

function wouldMoveCapture(state, player, pitIndex) {
  const sim = cloneState(state);
  const sowing = sow(sim, player, pitIndex);
  if (sowing.specialCapture > 0) return true;
  return canStartCapture(sim, player, sowing.lastPosition);
}

function isForbiddenAttackMove(state, player, pitIndex) {
  if (!isAttackPitMove(player, pitIndex)) return false;
  const seeds = state.board[player][pitIndex];
  if (seeds === 1) return true;
  if (seeds === 2) return !wouldMoveCapture(state, player, pitIndex);
  return false;
}

function ownNonEmptyMoves(state, player) {
  const moves = [];
  for (let i = 0; i < 7; i++) {
    if (state.board[player][i] > 0) moves.push({ player, pitIndex: i });
  }
  return moves;
}

function countDeliveredToOpponent(state, player, pitIndex) {
  const sim = cloneState(state);
  const before = sum(sim.board[other(player)]);
  sow(sim, player, pitIndex);
  return sum(sim.board[other(player)]) - before;
}

function getSolidarityMoves(state, player) {
  const candidates = ownNonEmptyMoves(state, player);
  const ordinary = candidates.filter(m => !isForbiddenAttackMove(state, player, m.pitIndex));
  const enriched = ordinary.map(m => ({ ...m, delivered: countDeliveredToOpponent(state, player, m.pitIndex) }));
  const atLeast7 = enriched.filter(m => m.delivered >= 7);
  if (atLeast7.length > 0) return atLeast7;
  const positive = enriched.filter(m => m.delivered > 0);
  if (positive.length > 0) {
    const max = Math.max(...positive.map(m => m.delivered));
    return positive.filter(m => m.delivered === max);
  }
  const forced = candidates.filter(m => isAttackPitMove(player, m.pitIndex) && [1, 2].includes(state.board[player][m.pitIndex]));
  return forced.map(m => ({ ...m, forcedDonation: true }));
}

function getLegalMoves(state) {
  const player = state.currentPlayer;
  if (state.status !== "playing") return [];
  if (opponentCampIsEmpty(state, player)) return getSolidarityMoves(state, player);
  return ownNonEmptyMoves(state, player).filter(m => !isForbiddenAttackMove(state, player, m.pitIndex));
}

// ─── END GAME ────────────────────────────────────────────────────────────────
function collectRemainingSeeds(state) {
  state.scores.north += sum(state.board.north);
  state.scores.south += sum(state.board.south);
  state.board.north = [0, 0, 0, 0, 0, 0, 0];
  state.board.south = [0, 0, 0, 0, 0, 0, 0];
}

function computeWinnerStrict(state) {
  if (state.scores.north >= 40) return "north";
  if (state.scores.south >= 40) return "south";
  if (state.scores.north > state.scores.south) return "north";
  if (state.scores.south > state.scores.north) return "south";
  return "draw";
}

function resolveEndGameAfterMove(state) {
  if (state.scores.north >= 40 || state.scores.south >= 40) {
    state.status = "ended";
    state.reason = "score_40";
    state.winner = computeWinnerStrict(state);
    return;
  }
  if (boardSeeds(state) < 10) {
    collectRemainingSeeds(state);
    state.status = "ended";
    state.reason = "low_board";
    state.winner = computeWinnerStrict(state);
  }
}

function resolveEndGameBeforeTurn(state) {
  if (getLegalMoves(state).length > 0) return;
  collectRemainingSeeds(state);
  state.status = "ended";
  state.reason = "no_legal_move";
  state.winner = computeWinnerStrict(state);
}

function assertTotalSeeds(state) {
  const total = totalSeedsCount(state);
  if (total !== 70) throw new Error(`Seed invariant broken: ${total} instead of 70`);
}

// ─── ENGINE ───────────────────────────────────────────────────────────────────
function createGame(startingPlayer = "south") {
  return {
    board: { north: [5, 5, 5, 5, 5, 5, 5], south: [5, 5, 5, 5, 5, 5, 5] },
    scores: { north: 0, south: 0 },
    currentPlayer: startingPlayer,
    status: "playing",
    winner: null,
    reason: null,
    moveNumber: 0,
    history: [],
  };
}

function applyMove(state, move) {
  const legalMoves = getLegalMoves(state);
  const legalMove = legalMoves.find(m => m.player === move.player && m.pitIndex === move.pitIndex);
  if (!legalMove) return { state, ok: false, error: "Illegal move" };

  const newState = cloneState(state);
  let actionResult;

  if (legalMove.forcedDonation) {
    const seeds = newState.board[move.player][move.pitIndex];
    newState.board[move.player][move.pitIndex] = 0;
    newState.scores[other(move.player)] += seeds;
    actionResult = { type: "forced-donation", donated: seeds };
  } else {
    const sowingResult = sow(newState, move.player, move.pitIndex);
    const capture = resolveCaptures(newState, move.player, sowingResult);
    actionResult = { type: "sow", sowing: sowingResult, capture };
  }

  newState.moveNumber += 1;
  newState.history.push({ moveNumber: newState.moveNumber, player: move.player, pitIndex: move.pitIndex, result: actionResult });

  resolveEndGameAfterMove(newState);
  if (newState.status === "playing") {
    newState.currentPlayer = other(newState.currentPlayer);
    resolveEndGameBeforeTurn(newState);
  }

  assertTotalSeeds(newState);
  return { state: newState, ok: true, action: actionResult };
}

// ─── UI COMPONENT ─────────────────────────────────────────────────────────────
const PALETTE = {
  bg: "#1a1008",
  surface: "#2c1e0f",
  surfaceAlt: "#3a2712",
  border: "#5c3d1e",
  gold: "#c8952a",
  goldLight: "#e8b84b",
  cream: "#f0e6c8",
  muted: "#8a6a3a",
  north: "#4a90d9",
  northLight: "#7ab8f5",
  south: "#e05c3a",
  southLight: "#f58c75",
  capture: "#52c41a",
  forbidden: "#ff4d4f",
};

const styles = {
  root: {
    minHeight: "100vh",
    background: PALETTE.bg,
    color: PALETTE.cream,
    fontFamily: "'Georgia', serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px 8px",
    boxSizing: "border-box",
  },
  title: {
    fontSize: "clamp(22px, 5vw, 36px)",
    fontWeight: "bold",
    color: PALETTE.goldLight,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    marginBottom: "4px",
    textShadow: `0 0 20px ${PALETTE.gold}88`,
  },
  subtitle: {
    color: PALETTE.muted,
    fontSize: "13px",
    marginBottom: "20px",
    letterSpacing: "0.05em",
  },
  scoreboard: {
    display: "flex",
    gap: "24px",
    marginBottom: "20px",
    background: PALETTE.surface,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: "12px",
    padding: "12px 24px",
    alignItems: "center",
  },
  scoreBox: (player, active) => ({
    textAlign: "center",
    padding: "8px 16px",
    borderRadius: "8px",
    border: `2px solid ${active ? (player === "north" ? PALETTE.north : PALETTE.south) : "transparent"}`,
    background: active ? `${player === "north" ? PALETTE.north : PALETTE.south}22` : "transparent",
    transition: "all 0.3s",
    minWidth: "80px",
  }),
  scoreLabel: (player) => ({
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: player === "north" ? PALETTE.northLight : PALETTE.southLight,
    marginBottom: "4px",
  }),
  scoreValue: {
    fontSize: "28px",
    fontWeight: "bold",
    color: PALETTE.cream,
    lineHeight: 1,
  },
  scoreOf: { color: PALETTE.muted, fontSize: "11px" },
  vsText: { color: PALETTE.muted, fontSize: "14px", fontWeight: "bold" },
  boardWrapper: {
    background: PALETTE.surface,
    border: `2px solid ${PALETTE.border}`,
    borderRadius: "16px",
    padding: "16px",
    maxWidth: "560px",
    width: "100%",
  },
  rowLabel: (player) => ({
    textAlign: "center",
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: player === "north" ? PALETTE.northLight : PALETTE.southLight,
    marginBottom: "6px",
    marginTop: "6px",
  }),
  pitsRow: {
    display: "flex",
    gap: "6px",
    justifyContent: "center",
  },
  pit: (seeds, isLegal, isActive, player, isAttack, isProtected) => {
    let bg = PALETTE.surfaceAlt;
    let border = PALETTE.border;
    let cursor = "default";
    let shadow = "none";
    if (isLegal) {
      bg = `${player === "north" ? PALETTE.north : PALETTE.south}33`;
      border = player === "north" ? PALETTE.northLight : PALETTE.southLight;
      cursor = "pointer";
      shadow = `0 0 10px ${player === "north" ? PALETTE.north : PALETTE.south}66`;
    }
    if (isActive) {
      bg = `${player === "north" ? PALETTE.north : PALETTE.south}55`;
    }
    return {
      width: "clamp(42px, 11vw, 64px)",
      height: "clamp(42px, 11vw, 64px)",
      borderRadius: "50%",
      border: `2px solid ${border}`,
      background: bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor,
      fontSize: "clamp(13px, 3vw, 18px)",
      fontWeight: "bold",
      color: seeds === 0 ? PALETTE.muted : PALETTE.cream,
      boxShadow: shadow,
      transition: "all 0.2s",
      position: "relative",
      userSelect: "none",
    };
  },
  pitIndex: {
    position: "absolute",
    bottom: "2px",
    fontSize: "9px",
    color: PALETTE.muted,
    letterSpacing: "0.05em",
  },
  divider: {
    height: "1px",
    background: PALETTE.border,
    margin: "10px 0",
    borderRadius: "1px",
  },
  statusBar: {
    marginTop: "16px",
    maxWidth: "560px",
    width: "100%",
    background: PALETTE.surface,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: "10px",
    padding: "10px 16px",
    fontSize: "13px",
    color: PALETTE.cream,
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  dot: (player) => ({
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: player === "north" ? PALETTE.northLight : PALETTE.southLight,
    flexShrink: 0,
  }),
  endBanner: {
    marginTop: "16px",
    maxWidth: "560px",
    width: "100%",
    background: `${PALETTE.gold}22`,
    border: `2px solid ${PALETTE.gold}`,
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center",
  },
  endTitle: { fontSize: "22px", fontWeight: "bold", color: PALETTE.goldLight, marginBottom: "6px" },
  endSub: { color: PALETTE.muted, fontSize: "13px", marginBottom: "16px" },
  btn: {
    background: PALETTE.gold,
    color: PALETTE.bg,
    border: "none",
    borderRadius: "8px",
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  lastMove: {
    marginTop: "12px",
    maxWidth: "560px",
    width: "100%",
    fontSize: "12px",
    color: PALETTE.muted,
    textAlign: "center",
    minHeight: "18px",
  },
};

function pitHumanLabel(player, pitIndex) {
  // Display: Nord N0..N6 as 1..7, Sud S0..S6 as 7..1 (mirrored)
  return player === "north" ? `N${pitIndex + 1}` : `S${7 - pitIndex}`;
}

function describeAction(action, player) {
  if (!action) return "";
  if (action.type === "forced-donation") return `${player === "north" ? "Nord" : "Sud"} a fait un don forcé de ${action.donated} graine(s) à l'adversaire.`;
  const cap = action.capture;
  if (cap.type === "special-granary") return `Grenier : ${cap.captured} graine(s) capturée(s) (cas spécial).`;
  if (cap.type === "chain") return `Prise à la chaîne : ${cap.captured} graines capturées !`;
  if (cap.type === "normal") return `Capture normale : ${cap.captured} graine(s).`;
  if (cap.cancelledBecauseStarvation) return `Capture annulée (ne pas affamer l'adversaire).`;
  return `Semaille effectuée.`;
}

function reasonLabel(reason) {
  if (reason === "score_40") return "Score de 40 atteint";
  if (reason === "low_board") return "Moins de 10 graines restantes";
  if (reason === "no_legal_move") return "Plus de coup légal";
  if (reason === "solidarity_impossible") return "Solidarité impossible";
  return reason;
}

export default function SonghoGame() {
  const [gameState, setGameState] = useState(() => createGame("south"));
  const [lastAction, setLastAction] = useState(null);
  const [lastPlayer, setLastPlayer] = useState(null);
  const [hovered, setHovered] = useState(null);

  const legalMoves = gameState.status === "playing" ? getLegalMoves(gameState) : [];
  const legalSet = new Set(legalMoves.map(m => `${m.player}-${m.pitIndex}`));

  const handlePitClick = useCallback((player, pitIndex) => {
    if (gameState.status !== "playing") return;
    if (player !== gameState.currentPlayer) return;
    const result = applyMove(gameState, { player, pitIndex });
    if (result.ok) {
      setLastAction(result.action);
      setLastPlayer(player);
      setGameState(result.state);
    }
  }, [gameState]);

  const handleNewGame = () => {
    setGameState(createGame("south"));
    setLastAction(null);
    setLastPlayer(null);
    setHovered(null);
  };

  const renderRow = (player, pits, reversed) => {
    const indices = reversed ? [6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6];
    return (
      <div style={styles.pitsRow}>
        {indices.map(i => {
          const isLegal = legalSet.has(`${player}-${i}`);
          const isActive = gameState.currentPlayer === player && isLegal;
          const isHov = hovered && hovered.player === player && hovered.pitIndex === i;
          return (
            <div
              key={i}
              style={{ ...styles.pit(pits[i], isLegal, isHov && isLegal, player) }}
              onClick={() => isLegal && handlePitClick(player, i)}
              onMouseEnter={() => setHovered({ player, pitIndex: i })}
              onMouseLeave={() => setHovered(null)}
              title={isLegal ? `Jouer ${pitHumanLabel(player, i)} (${pits[i]} graines)` : `${pitHumanLabel(player, i)}: ${pits[i]} graines`}
            >
              {pits[i]}
              <span style={styles.pitIndex}>{pitHumanLabel(player, i)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const curP = gameState.currentPlayer;

  return (
    <div style={styles.root}>
      <div style={styles.title}>Songho</div>
      <div style={styles.subtitle}>Jeu de semaille camerounais · Variante Ewondo/Bulu</div>

      {/* Scoreboard */}
      <div style={styles.scoreboard}>
        <div style={styles.scoreBox("north", curP === "north" && gameState.status === "playing")}>
          <div style={styles.scoreLabel("north")}>Nord</div>
          <div style={styles.scoreValue}>{gameState.scores.north}</div>
          <div style={styles.scoreOf}>sur 40</div>
        </div>
        <div style={styles.vsText}>VS</div>
        <div style={styles.scoreBox("south", curP === "south" && gameState.status === "playing")}>
          <div style={styles.scoreLabel("south")}>Sud</div>
          <div style={styles.scoreValue}>{gameState.scores.south}</div>
          <div style={styles.scoreOf}>sur 40</div>
        </div>
      </div>

      {/* Board */}
      <div style={styles.boardWrapper}>
        <div style={styles.rowLabel("north")}>← Camp de Nord</div>
        {renderRow("north", gameState.board.north, false)}
        <div style={styles.divider} />
        {renderRow("south", gameState.board.south, true)}
        <div style={styles.rowLabel("south")}>Camp de Sud →</div>
      </div>

      {/* Status */}
      {gameState.status === "playing" && (
        <div style={styles.statusBar}>
          <div style={styles.dot(curP)} />
          <span>
            <strong style={{ color: curP === "north" ? PALETTE.northLight : PALETTE.southLight }}>
              {curP === "north" ? "Nord" : "Sud"}
            </strong>
            {" "}joue. {legalMoves.length} coup{legalMoves.length > 1 ? "s" : ""} disponible{legalMoves.length > 1 ? "s" : ""}.
            {opponentCampIsEmpty(gameState, curP) && (
              <span style={{ color: PALETTE.goldLight }}> ⚠ Solidarité : nourrir l'adversaire.</span>
            )}
          </span>
        </div>
      )}

      {/* Last action */}
      <div style={styles.lastMove}>
        {lastAction && lastPlayer && describeAction(lastAction, lastPlayer)}
      </div>

      {/* End banner */}
      {gameState.status === "ended" && (
        <div style={styles.endBanner}>
          <div style={styles.endTitle}>
            {gameState.winner === "draw"
              ? "⚖ Match nul !"
              : `🏆 ${gameState.winner === "north" ? "Nord" : "Sud"} gagne !`}
          </div>
          <div style={styles.endSub}>
            Fin : {reasonLabel(gameState.reason)} · Nord {gameState.scores.north} – {gameState.scores.south} Sud
          </div>
          <button style={styles.btn} onClick={handleNewGame}>Nouvelle partie</button>
        </div>
      )}

      {gameState.status === "playing" && (
        <div style={{ marginTop: "16px" }}>
          <button
            style={{ ...styles.btn, background: PALETTE.surfaceAlt, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
            onClick={handleNewGame}
          >
            Recommencer
          </button>
        </div>
      )}

      <div style={{ marginTop: "20px", fontSize: "11px", color: PALETTE.muted, textAlign: "center", maxWidth: "400px" }}>
        Coup n°{gameState.moveNumber} · {totalSeedsCount(gameState)} graines totales
        {gameState.status === "playing" && ` · ${boardSeeds(gameState)} sur le tablier`}
      </div>
    </div>
  );
}
