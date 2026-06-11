"""
Songho / Songo – Version Streamlit
"""

import streamlit as st

# ─────────────────────────────────────────────────────────────────────────────
# MOTEUR DE JEU
# ─────────────────────────────────────────────────────────────────────────────

CYCLE = [
    ("north", 0), ("north", 1), ("north", 2), ("north", 3),
    ("north", 4), ("north", 5), ("north", 6),
    ("south", 6), ("south", 5), ("south", 4), ("south", 3),
    ("south", 2), ("south", 1), ("south", 0),
]

def other(player):
    return "south" if player == "north" else "north"

def s(arr):
    return sum(arr)

def board_seeds(state):
    return s(state["board"]["north"]) + s(state["board"]["south"])

def total_seeds(state):
    return state["scores"]["north"] + state["scores"]["south"] + board_seeds(state)

def same_pos(a, b):
    return a == b

def cycle_index(pos):
    return CYCLE.index(pos)

def next_positions_after(source):
    start = cycle_index(source)
    return [CYCLE[(start + i) % len(CYCLE)] for i in range(1, 14)]

def attack_pit(player):
    return ("north", 6) if player == "north" else ("south", 0)

def opponent_first_pit(player):
    return ("south", 6) if player == "north" else ("north", 0)

def opponent_path(player):
    if player == "north":
        return [("south", i) for i in [6, 5, 4, 3, 2, 1, 0]]
    return [("north", i) for i in [0, 1, 2, 3, 4, 5, 6]]

def is_opponent_pit(player, pos):
    return pos[0] == other(player)

def is_capture_value(n):
    return n in (2, 3, 4)

def clone_state(state):
    return {
        "board": {
            "north": list(state["board"]["north"]),
            "south": list(state["board"]["south"]),
        },
        "scores": dict(state["scores"]),
        "currentPlayer": state["currentPlayer"],
        "status": state["status"],
        "winner": state["winner"],
        "reason": state["reason"],
        "moveNumber": state["moveNumber"],
        "history": list(state["history"]),
    }

# ── Semaille ──────────────────────────────────────────────────────────────────

def sow_normal(state, player, pit_index):
    seeds = state["board"][player][pit_index]
    source = (player, pit_index)
    state["board"][player][pit_index] = 0
    path = next_positions_after(source)
    visited = []
    for i in range(seeds):
        p, idx = path[i]
        state["board"][p][idx] += 1
        visited.append((p, idx))
    return {"visited": visited, "lastPosition": visited[-1], "specialCapture": 0}

def sow_granary(state, player, pit_index):
    seeds = state["board"][player][pit_index]
    source = (player, pit_index)
    state["board"][player][pit_index] = 0
    visited = []
    remaining = seeds
    for pos in next_positions_after(source):
        p, idx = pos
        state["board"][p][idx] += 1
        visited.append(pos)
        remaining -= 1
    path = opponent_path(player)
    special_capture = 0
    for i in range(remaining):
        pos = path[i % len(path)]
        is_last = (i == remaining - 1)
        is_protected = (pos == opponent_first_pit(player))
        if is_last and is_protected:
            special_capture += 1
            visited.append(pos)
            continue
        p, idx = pos
        state["board"][p][idx] += 1
        visited.append(pos)
    return {"visited": visited, "lastPosition": visited[-1], "specialCapture": special_capture}

def sow(state, player, pit_index):
    seeds = state["board"][player][pit_index]
    if seeds <= 0:
        raise ValueError("Case vide")
    return sow_normal(state, player, pit_index) if seeds <= 13 else sow_granary(state, player, pit_index)

# ── Capture ───────────────────────────────────────────────────────────────────

def can_start_capture(state, player, last_pos):
    if not is_opponent_pit(player, last_pos):
        return False
    if last_pos == opponent_first_pit(player):
        return False
    p, idx = last_pos
    return is_capture_value(state["board"][p][idx])

def capture_chain_positions(state, player, last_pos):
    path = opponent_path(player)
    try:
        last_index = path.index(last_pos)
    except ValueError:
        return []
    if last_index <= 0:
        return []
    captured = []
    for idx in range(last_index, -1, -1):
        pos = path[idx]
        p, i = pos
        count = state["board"][p][i]
        if not is_capture_value(count):
            break
        captured.append({"pos": pos, "seeds": count})
    return captured

def would_empty_opponent(state, player, capture_list):
    opp = other(player)
    remaining = list(state["board"][opp])
    for c in capture_list:
        remaining[c["pos"][1]] -= c["seeds"]
    return sum(remaining) == 0

def apply_capture_if_allowed(state, player, capture_list):
    if not capture_list:
        return 0
    if would_empty_opponent(state, player, capture_list):
        return 0
    total = 0
    for c in capture_list:
        p, idx = c["pos"]
        state["board"][p][idx] -= c["seeds"]
        total += c["seeds"]
    state["scores"][player] += total
    return total

def resolve_captures(state, player, sowing_result):
    if sowing_result["specialCapture"] > 0:
        state["scores"][player] += sowing_result["specialCapture"]
        return {"captured": sowing_result["specialCapture"], "type": "special-granary"}
    last = sowing_result["lastPosition"]
    if not can_start_capture(state, player, last):
        return {"captured": 0, "type": "none"}
    capture_list = capture_chain_positions(state, player, last)
    captured = apply_capture_if_allowed(state, player, capture_list)
    cancelled = captured == 0 and len(capture_list) > 0
    ctype = "chain" if captured > 0 and len(capture_list) > 1 else "normal"
    return {"captured": captured, "type": ctype, "cancelledBecauseStarvation": cancelled}

# ── Coups légaux ──────────────────────────────────────────────────────────────

def opponent_camp_is_empty(state, player):
    return sum(state["board"][other(player)]) == 0

def is_attack_pit_move(player, pit_index):
    return attack_pit(player)[1] == pit_index

def would_move_capture(state, player, pit_index):
    sim = clone_state(state)
    sowing = sow(sim, player, pit_index)
    if sowing["specialCapture"] > 0:
        return True
    return can_start_capture(sim, player, sowing["lastPosition"])

def is_forbidden_attack_move(state, player, pit_index):
    if not is_attack_pit_move(player, pit_index):
        return False
    seeds = state["board"][player][pit_index]
    if seeds == 1:
        return True
    if seeds == 2:
        return not would_move_capture(state, player, pit_index)
    return False

def own_non_empty_moves(state, player):
    return [{"player": player, "pitIndex": i}
            for i in range(7) if state["board"][player][i] > 0]

def count_delivered_to_opponent(state, player, pit_index):
    sim = clone_state(state)
    before = sum(sim["board"][other(player)])
    sow(sim, player, pit_index)
    return sum(sim["board"][other(player)]) - before

def get_solidarity_moves(state, player):
    candidates = own_non_empty_moves(state, player)
    ordinary = [m for m in candidates if not is_forbidden_attack_move(state, player, m["pitIndex"])]
    enriched = [{**m, "delivered": count_delivered_to_opponent(state, player, m["pitIndex"])} for m in ordinary]
    at_least_7 = [m for m in enriched if m["delivered"] >= 7]
    if at_least_7:
        return at_least_7
    positive = [m for m in enriched if m["delivered"] > 0]
    if positive:
        max_d = max(m["delivered"] for m in positive)
        return [m for m in positive if m["delivered"] == max_d]
    forced = [m for m in candidates
              if is_attack_pit_move(player, m["pitIndex"])
              and state["board"][player][m["pitIndex"]] in (1, 2)]
    return [{**m, "forcedDonation": True} for m in forced]

def get_legal_moves(state):
    player = state["currentPlayer"]
    if state["status"] != "playing":
        return []
    if opponent_camp_is_empty(state, player):
        return get_solidarity_moves(state, player)
    return [m for m in own_non_empty_moves(state, player)
            if not is_forbidden_attack_move(state, player, m["pitIndex"])]

# ── Fin de partie ─────────────────────────────────────────────────────────────

def collect_remaining_seeds(state):
    state["scores"]["north"] += sum(state["board"]["north"])
    state["scores"]["south"] += sum(state["board"]["south"])
    state["board"]["north"] = [0] * 7
    state["board"]["south"] = [0] * 7

def compute_winner(state):
    n, so = state["scores"]["north"], state["scores"]["south"]
    if n >= 40: return "north"
    if so >= 40: return "south"
    if n > so: return "north"
    if so > n: return "south"
    return "draw"

def resolve_end_after_move(state):
    if state["scores"]["north"] >= 40 or state["scores"]["south"] >= 40:
        state["status"] = "ended"
        state["reason"] = "score_40"
        state["winner"] = compute_winner(state)
        return
    if board_seeds(state) < 10:
        collect_remaining_seeds(state)
        state["status"] = "ended"
        state["reason"] = "low_board"
        state["winner"] = compute_winner(state)

def resolve_end_before_turn(state):
    if get_legal_moves(state):
        return
    collect_remaining_seeds(state)
    state["status"] = "ended"
    state["reason"] = "no_legal_move"
    state["winner"] = compute_winner(state)

def assert_total_seeds(state):
    t = total_seeds(state)
    if t != 70:
        raise RuntimeError(f"Invariant cassé : {t} graines au lieu de 70")

# ── Application d'un coup ─────────────────────────────────────────────────────

def create_game(starting_player="south"):
    return {
        "board": {"north": [5]*7, "south": [5]*7},
        "scores": {"north": 0, "south": 0},
        "currentPlayer": starting_player,
        "status": "playing",
        "winner": None,
        "reason": None,
        "moveNumber": 0,
        "history": [],
    }

def apply_move(state, player, pit_index):
    legal = get_legal_moves(state)
    legal_move = next((m for m in legal if m["player"] == player and m["pitIndex"] == pit_index), None)
    if not legal_move:
        return state, False, "Coup illégal"

    new_state = clone_state(state)
    if legal_move.get("forcedDonation"):
        seeds = new_state["board"][player][pit_index]
        new_state["board"][player][pit_index] = 0
        new_state["scores"][other(player)] += seeds
        action = {"type": "forced-donation", "donated": seeds}
    else:
        sowing = sow(new_state, player, pit_index)
        capture = resolve_captures(new_state, player, sowing)
        action = {"type": "sow", "sowing": sowing, "capture": capture}

    new_state["moveNumber"] += 1
    new_state["history"].append({
        "move": new_state["moveNumber"],
        "player": player,
        "pitIndex": pit_index,
        "action": action,
    })

    resolve_end_after_move(new_state)
    if new_state["status"] == "playing":
        new_state["currentPlayer"] = other(player)
        resolve_end_before_turn(new_state)

    assert_total_seeds(new_state)
    return new_state, True, action

# ─────────────────────────────────────────────────────────────────────────────
# INTERFACE STREAMLIT
# ─────────────────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Songho – Jeu de semaille",
    page_icon="🌾",
    layout="centered",
)

# ── CSS ───────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

html, body, [class*="css"] {
    background-color: #1a1008 !important;
    color: #f0e6c8 !important;
}

.stApp { background-color: #1a1008; }

h1, h2, h3 { font-family: 'Cinzel', serif !important; }

.title-block {
    text-align: center;
    padding: 18px 0 4px 0;
}
.title-block h1 {
    font-family: 'Cinzel', serif;
    font-size: clamp(26px, 6vw, 42px);
    color: #e8b84b;
    letter-spacing: 0.2em;
    text-shadow: 0 0 24px #c8952a88;
    margin: 0;
}
.title-block p {
    color: #8a6a3a;
    font-size: 13px;
    letter-spacing: 0.08em;
    margin: 4px 0 0 0;
    font-family: 'Crimson Text', serif;
    font-style: italic;
}

.scoreboard {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    margin: 18px auto;
    background: #2c1e0f;
    border: 1px solid #5c3d1e;
    border-radius: 14px;
    padding: 14px 28px;
    width: fit-content;
}
.score-box {
    text-align: center;
    padding: 8px 20px;
    border-radius: 10px;
    border: 2px solid transparent;
    min-width: 90px;
    transition: all 0.3s;
}
.score-box.active-north {
    border-color: #4a90d9;
    background: #4a90d922;
}
.score-box.active-south {
    border-color: #e05c3a;
    background: #e05c3a22;
}
.score-label { font-size: 11px; font-weight: bold; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 4px; }
.score-label.north { color: #7ab8f5; }
.score-label.south { color: #f58c75; }
.score-value { font-size: 32px; font-weight: bold; color: #f0e6c8; font-family: 'Cinzel', serif; line-height: 1; }
.score-of { font-size: 11px; color: #8a6a3a; margin-top: 2px; }
.vs-text { color: #8a6a3a; font-weight: bold; font-size: 16px; }

.board-wrapper {
    background: #2c1e0f;
    border: 2px solid #5c3d1e;
    border-radius: 18px;
    padding: 18px 12px;
    margin: 0 auto;
    max-width: 600px;
}
.row-label {
    text-align: center;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin: 6px 0;
}
.row-label.north { color: #7ab8f5; }
.row-label.south { color: #f58c75; }

.pit-row {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin: 6px 0;
}
.pit {
    width: 62px; height: 62px;
    border-radius: 50%;
    border: 2px solid #5c3d1e;
    background: #3a2712;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: bold;
    color: #f0e6c8;
    position: relative;
    font-family: 'Cinzel', serif;
    flex-direction: column;
    gap: 0;
}
.pit.empty { color: #5c3d1e; }
.pit-label { font-size: 9px; color: #8a6a3a; font-family: monospace; margin-top: 1px; }

.divider-board {
    height: 1px; background: #5c3d1e;
    margin: 10px 20px; border-radius: 1px;
}

.status-bar {
    background: #2c1e0f;
    border: 1px solid #5c3d1e;
    border-radius: 10px;
    padding: 10px 18px;
    margin: 14px auto;
    max-width: 600px;
    font-size: 14px;
    font-family: 'Crimson Text', serif;
    text-align: center;
}
.turn-north { color: #7ab8f5; font-weight: bold; }
.turn-south { color: #f58c75; font-weight: bold; }
.solidarity-warn { color: #e8b84b; }

.end-banner {
    background: #c8952a22;
    border: 2px solid #c8952a;
    border-radius: 14px;
    padding: 22px;
    text-align: center;
    margin: 14px auto;
    max-width: 600px;
}
.end-title {
    font-family: 'Cinzel', serif;
    font-size: 24px;
    color: #e8b84b;
    margin-bottom: 6px;
}
.end-sub { color: #8a6a3a; font-size: 13px; }

.last-action {
    text-align: center;
    font-size: 13px;
    color: #8a6a3a;
    font-style: italic;
    margin: 8px auto;
    max-width: 600px;
    font-family: 'Crimson Text', serif;
}

/* Boutons Streamlit */
.stButton > button {
    background: #c8952a !important;
    color: #1a1008 !important;
    border: none !important;
    border-radius: 8px !important;
    font-weight: bold !important;
    letter-spacing: 0.08em !important;
    font-family: 'Cinzel', serif !important;
    padding: 8px 20px !important;
    transition: all 0.2s !important;
}
.stButton > button:hover {
    background: #e8b84b !important;
    transform: translateY(-1px) !important;
}

/* Bouton légal (vert discret) */
.btn-legal > button {
    background: #2a4a1e !important;
    color: #a8e88a !important;
    border: 1px solid #52c41a !important;
}
.btn-legal > button:hover {
    background: #3a6a28 !important;
}

/* Info / warning overrides */
.stInfo, .stSuccess, .stWarning {
    background: #2c1e0f !important;
    border-color: #5c3d1e !important;
    color: #f0e6c8 !important;
}

footer { visibility: hidden; }
</style>
""", unsafe_allow_html=True)

# ── Session state ─────────────────────────────────────────────────────────────
if "game" not in st.session_state:
    st.session_state.game = create_game("south")
if "last_action" not in st.session_state:
    st.session_state.last_action = None
if "last_player" not in st.session_state:
    st.session_state.last_player = None

game = st.session_state.game

# ── Helpers d'affichage ───────────────────────────────────────────────────────
def pit_label(player, pit_index):
    return f"N{pit_index+1}" if player == "north" else f"S{7-pit_index}"

def describe_action(action, player):
    pname = "Nord" if player == "north" else "Sud"
    if not action:
        return ""
    if action["type"] == "forced-donation":
        return f"🎁 {pname} a fait un don forcé de {action['donated']} graine(s) à l'adversaire."
    cap = action.get("capture", {})
    ctype = cap.get("type", "none")
    if ctype == "special-granary":
        return f"🏺 Grenier : {cap['captured']} graine(s) capturée(s) (cas spécial)."
    if ctype == "chain":
        return f"⛓ Prise à la chaîne : {cap['captured']} graines capturées !"
    if ctype == "normal":
        return f"✅ Capture normale : {cap['captured']} graine(s)."
    if cap.get("cancelledBecauseStarvation"):
        return "🚫 Capture annulée — interdit d'affamer l'adversaire."
    return "🌱 Semaille effectuée."

def reason_label(reason):
    labels = {
        "score_40": "Score de 40 atteint",
        "low_board": "Moins de 10 graines sur le tablier",
        "no_legal_move": "Plus de coup légal",
        "solidarity_impossible": "Solidarité impossible",
    }
    return labels.get(reason, reason)

# ── Titre ─────────────────────────────────────────────────────────────────────
st.markdown("""
<div class="title-block">
  <h1>SONGHO</h1>
  <p>Jeu de semaille camerounais &middot; Variante Ewondo/Bulu</p>
</div>
""", unsafe_allow_html=True)

# ── Scores ────────────────────────────────────────────────────────────────────
cur = game["currentPlayer"]
north_active = "active-north" if cur == "north" and game["status"] == "playing" else ""
south_active = "active-south" if cur == "south" and game["status"] == "playing" else ""

st.markdown(f"""
<div class="scoreboard">
  <div class="score-box {north_active}">
    <div class="score-label north">Nord</div>
    <div class="score-value">{game['scores']['north']}</div>
    <div class="score-of">sur 40</div>
  </div>
  <div class="vs-text">VS</div>
  <div class="score-box {south_active}">
    <div class="score-label south">Sud</div>
    <div class="score-value">{game['scores']['south']}</div>
    <div class="score-of">sur 40</div>
  </div>
</div>
""", unsafe_allow_html=True)

# ── Tablier (affichage HTML) ──────────────────────────────────────────────────
legal_moves = get_legal_moves(game) if game["status"] == "playing" else []
legal_set = {(m["player"], m["pitIndex"]) for m in legal_moves}

def render_row_html(player, pits, indices):
    cells = ""
    for i in indices:
        seeds = pits[i]
        legal = (player, i) in legal_set
        border = ""
        if legal:
            color = "#4a90d9" if player == "north" else "#e05c3a"
            border = f"border-color:{color}; background: {color}33; box-shadow: 0 0 10px {color}55;"
        empty_cls = " empty" if seeds == 0 else ""
        cells += f"""
        <div class="pit{empty_cls}" style="{border}">
            {seeds}
            <span class="pit-label">{pit_label(player, i)}</span>
        </div>"""
    return f'<div class="pit-row">{cells}</div>'

north_html = render_row_html("north", game["board"]["north"], range(7))
south_html = render_row_html("south", game["board"]["south"], range(6, -1, -1))

st.markdown(f"""
<div class="board-wrapper">
  <div class="row-label north">← Camp de Nord</div>
  {north_html}
  <div class="divider-board"></div>
  {south_html}
  <div class="row-label south">Camp de Sud →</div>
</div>
""", unsafe_allow_html=True)

# ── Statut & message dernier coup ────────────────────────────────────────────
if game["status"] == "playing":
    pname = "Nord" if cur == "north" else "Sud"
    pclass = "turn-north" if cur == "north" else "turn-south"
    solidarity_msg = ""
    if opponent_camp_is_empty(game, cur):
        solidarity_msg = '<br><span class="solidarity-warn">⚠ Solidarité : vous devez nourrir l\'adversaire.</span>'
    st.markdown(f"""
    <div class="status-bar">
        <span class="{pclass}">{pname}</span> joue &mdash; {len(legal_moves)} coup(s) disponible(s).
        {solidarity_msg}
    </div>
    """, unsafe_allow_html=True)

if st.session_state.last_action:
    st.markdown(f"""
    <div class="last-action">
        {describe_action(st.session_state.last_action, st.session_state.last_player)}
    </div>
    """, unsafe_allow_html=True)

# ── Boutons de jeu ────────────────────────────────────────────────────────────
if game["status"] == "playing" and legal_moves:
    player = game["currentPlayer"]
    pname = "Nord" if player == "north" else "Sud"

    st.markdown(f"**{pname} — choisissez une case :**")

    # Afficher les cases jouables du joueur courant sous forme de boutons
    # Nord : indices 0→6 ; Sud : indices 6→0 (affichage miroir)
    pit_indices = list(range(7)) if player == "north" else list(range(6, -1, -1))
    legal_indices = [m["pitIndex"] for m in legal_moves]

    cols = st.columns(7)
    for col, i in zip(cols, pit_indices):
        seeds = game["board"][player][i]
        label = pit_label(player, i)
        is_legal = i in legal_indices

        with col:
            if is_legal:
                if st.button(f"{label}\n{seeds}🌱", key=f"move_{player}_{i}"):
                    new_state, ok, action = apply_move(game, player, i)
                    if ok:
                        st.session_state.game = new_state
                        st.session_state.last_action = action
                        st.session_state.last_player = player
                        st.rerun()
            else:
                st.button(f"{label}\n{seeds}", key=f"dis_{player}_{i}", disabled=True)

# ── Fin de partie ─────────────────────────────────────────────────────────────
if game["status"] == "ended":
    winner = game["winner"]
    if winner == "draw":
        title = "⚖️ Match nul !"
    else:
        wname = "Nord" if winner == "north" else "Sud"
        title = f"🏆 {wname} gagne !"

    st.markdown(f"""
    <div class="end-banner">
        <div class="end-title">{title}</div>
        <div class="end-sub">
            Fin : {reason_label(game['reason'])} &mdash;
            Nord {game['scores']['north']} &ndash; {game['scores']['south']} Sud
        </div>
    </div>
    """, unsafe_allow_html=True)

# ── Nouvelle partie ───────────────────────────────────────────────────────────
col1, col2, col3 = st.columns([1, 2, 1])
with col2:
    label = "🔄 Nouvelle partie" if game["status"] == "ended" else "↺ Recommencer"
    if st.button(label, use_container_width=True):
        st.session_state.game = create_game("south")
        st.session_state.last_action = None
        st.session_state.last_player = None
        st.rerun()

# ── Pied de page ──────────────────────────────────────────────────────────────
st.markdown(f"""
<div style="text-align:center; margin-top:24px; font-size:11px; color:#5c3d1e;">
    Coup n°{game['moveNumber']} &middot; {total_seeds(game)} graines totales
    {'&middot; ' + str(board_seeds(game)) + ' sur le tablier' if game['status'] == 'playing' else ''}

</div>
""", unsafe_allow_html=True)
