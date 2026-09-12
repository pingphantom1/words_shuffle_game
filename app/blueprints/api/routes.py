"""
API blueprint — JSON endpoints consumed by the frontend JS.

All mutating endpoints are protected by CSRF via the X-CSRFToken header
(Flask-WTF reads it automatically when WTF_CSRF_ENABLED is True).
"""
from __future__ import annotations

import html
import random
from datetime import datetime, timezone

from flask import jsonify, request

from . import bp
from ...models import GameSession, GameSlip, Player, Score, Word, db

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize(value: str, max_len: int = 500) -> str:
    """Strip, truncate, and escape HTML entities."""
    return html.escape(value.strip()[:max_len])


def _error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


def _ok(data: dict | list | None = None, **kwargs):
    payload = {"ok": True}
    if data is not None:
        payload["data"] = data
    payload.update(kwargs)
    return jsonify(payload), 200


def _shuffle_word(word: str) -> str:
    """
    Shuffle the characters of a word.
    Guarantees the result differs from the original for words longer than 2 chars
    (tries up to 20 times before giving up).
    """
    chars = list(word)
    if len(chars) <= 2:
        random.shuffle(chars)
        return "".join(chars)
    shuffled = chars[:]
    for _ in range(20):
        random.shuffle(shuffled)
        if shuffled != chars:
            break
    return "".join(shuffled)


# ---------------------------------------------------------------------------
# Game Slips
# ---------------------------------------------------------------------------

@bp.route("/slips", methods=["GET"])
def list_slips():
    slips = GameSlip.query.order_by(GameSlip.created_at.desc()).all()
    return _ok([s.to_dict() for s in slips])


@bp.route("/slips", methods=["POST"])
def create_slip():
    data = request.get_json(silent=True)
    if not data:
        return _error("Invalid JSON body.")

    title = _sanitize(data.get("title", ""), max_len=120)
    if not title:
        return _error("Slip title is required.")

    raw_words: list[str] = data.get("words", [])
    raw_players: list[str] = data.get("players", [])

    if not isinstance(raw_words, list):
        return _error("'words' must be a list.")
    if not isinstance(raw_players, list):
        return _error("'players' must be a list.")

    # De-duplicate and sanitize words
    seen: set[str] = set()
    clean_words: list[str] = []
    for i, w in enumerate(raw_words):
        if not isinstance(w, str):
            continue
        w = _sanitize(w, max_len=200)
        if w and w.lower() not in seen:
            seen.add(w.lower())
            clean_words.append(w)

    # Sanitize player names
    clean_players: list[str] = []
    for p in raw_players:
        if not isinstance(p, str):
            continue
        p = _sanitize(p, max_len=80)
        if p:
            clean_players.append(p)

    slip = GameSlip(title=title)
    db.session.add(slip)
    db.session.flush()  # get slip.id before adding children

    for i, word_text in enumerate(clean_words):
        db.session.add(Word(text=word_text, position=i, game_slip_id=slip.id))

    for i, player_name in enumerate(clean_players):
        db.session.add(Player(name=player_name, position=i, game_slip_id=slip.id))

    db.session.commit()
    return jsonify({"ok": True, "data": slip.to_dict()}), 201


@bp.route("/slips/<int:slip_id>", methods=["GET"])
def get_slip(slip_id: int):
    slip = db.get_or_404(GameSlip, slip_id)
    return _ok(slip.to_dict())


@bp.route("/slips/<int:slip_id>", methods=["PUT"])
def update_slip(slip_id: int):
    slip = db.get_or_404(GameSlip, slip_id)

    if slip.is_finished:
        return _error("Cannot edit a finished slip. Unfinish it first.", 403)

    data = request.get_json(silent=True)
    if not data:
        return _error("Invalid JSON body.")

    if "title" in data:
        title = _sanitize(data["title"], max_len=120)
        if not title:
            return _error("Title cannot be empty.")
        slip.title = title

    if "words" in data:
        if not isinstance(data["words"], list):
            return _error("'words' must be a list.")
        # Replace all words
        Word.query.filter_by(game_slip_id=slip.id).delete()
        seen: set[str] = set()
        for i, w in enumerate(data["words"]):
            if not isinstance(w, str):
                continue
            w = _sanitize(w, max_len=200)
            if w and w.lower() not in seen:
                seen.add(w.lower())
                db.session.add(Word(text=w, position=i, game_slip_id=slip.id))

    if "players" in data:
        if not isinstance(data["players"], list):
            return _error("'players' must be a list.")
        # Replace all players
        Player.query.filter_by(game_slip_id=slip.id).delete()
        for i, p in enumerate(data["players"]):
            if not isinstance(p, str):
                continue
            p = _sanitize(p, max_len=80)
            if p:
                db.session.add(Player(name=p, position=i, game_slip_id=slip.id))

    db.session.commit()
    return _ok(slip.to_dict())


@bp.route("/slips/<int:slip_id>", methods=["DELETE"])
def delete_slip(slip_id: int):
    slip = db.get_or_404(GameSlip, slip_id)
    db.session.delete(slip)
    db.session.commit()
    return _ok({"deleted_id": slip_id})


@bp.route("/slips/<int:slip_id>/toggle-finish", methods=["POST"])
def toggle_finish(slip_id: int):
    slip = db.get_or_404(GameSlip, slip_id)
    slip.is_finished = not slip.is_finished
    db.session.commit()
    return _ok({"id": slip.id, "is_finished": slip.is_finished})


# ---------------------------------------------------------------------------
# Game Sessions
# ---------------------------------------------------------------------------

@bp.route("/slips/<int:slip_id>/start", methods=["POST"])
def start_session(slip_id: int):
    """
    Start a new game session for the given slip.
    Body: { "first_player_id": <int> }
    Returns session data + first shuffled word.
    """
    slip = db.get_or_404(GameSlip, slip_id)

    if slip.is_finished:
        return _error("This slip is marked as finished.", 403)

    words = Word.query.filter_by(game_slip_id=slip.id).order_by(Word.position).all()
    if not words:
        return _error("No words in this slip. Add words before starting.", 422)

    players = Player.query.filter_by(game_slip_id=slip.id).order_by(Player.position).all()
    if not players:
        return _error("No players in this slip. Add players before starting.", 422)

    data = request.get_json(silent=True) or {}
    first_player_id = data.get("first_player_id")
    if first_player_id is None:
        first_player_id = players[0].id

    # Verify first_player_id belongs to this slip
    first_player_ids = {p.id for p in players}
    if first_player_id not in first_player_ids:
        return _error("Invalid first_player_id.", 422)

    # Create session
    session = GameSession(game_slip_id=slip.id)
    db.session.add(session)
    db.session.flush()

    # Initialise scores at 0 for every player
    for player in players:
        db.session.add(Score(session_id=session.id, player_id=player.id, points=0))

    db.session.commit()

    # Build shuffled word list (order randomised for fun)
    word_list = [w.text for w in words]
    random.shuffle(word_list)

    return jsonify({
        "ok": True,
        "data": {
            "session_id": session.id,
            "first_player_id": first_player_id,
            "players": [p.to_dict() for p in players],
            "scores": {str(p.id): 0 for p in players},
            "words": word_list,
        },
    }), 201


@bp.route("/sessions/<int:session_id>/score", methods=["POST"])
def record_score(session_id: int):
    """
    Record a CORRECT answer: add 3 points to one or more players.
    Body: { "player_id": <int> }               — single player (turns mode)
       OR { "player_ids": [<int>, ...] }        — multiple players (buzz-in mode)
    """
    session = db.get_or_404(GameSession, session_id)
    if not session.is_active:
        return _error("Session is no longer active.", 403)

    data = request.get_json(silent=True) or {}

    # Normalise: accept either player_id (single) or player_ids (list)
    if "player_ids" in data:
        raw_ids = data["player_ids"]
        if not isinstance(raw_ids, list) or len(raw_ids) == 0:
            return _error("player_ids must be a non-empty list.")
        player_ids = raw_ids
    elif "player_id" in data:
        player_ids = [data["player_id"]]
    else:
        return _error("player_id or player_ids is required.")

    # Award 3 points to each player
    for pid in player_ids:
        score = Score.query.filter_by(
            session_id=session_id, player_id=pid
        ).first()
        if score is None:
            return _error(f"Player {pid} not found in this session.", 404)
        score.points += 3

    db.session.commit()

    # Return all scores for this session
    all_scores = Score.query.filter_by(session_id=session_id).all()
    return _ok({s.player_id: s.points for s in all_scores})


@bp.route("/sessions/<int:session_id>/end", methods=["POST"])
def end_session(session_id: int):
    session = db.get_or_404(GameSession, session_id)
    session.is_active = False
    session.ended_at = datetime.now(timezone.utc)
    db.session.commit()
    return _ok({"session_id": session_id, "ended": True})
