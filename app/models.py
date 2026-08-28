"""
SQLAlchemy ORM models.

Schema overview
---------------
GameSlip  ─── has many ──▶  Word
          ─── has many ──▶  Player
          ─── has many ──▶  GameSession ─── has many ──▶  Score (per player per session)
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sanitize(value: str, max_len: int = 500) -> str:
    """Strip leading/trailing whitespace and truncate to max_len."""
    return value.strip()[:max_len]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class GameSlip(db.Model):
    """A named collection of words managed by the conductor."""

    __tablename__ = "game_slip"

    id: int = db.Column(db.Integer, primary_key=True)
    title: str = db.Column(db.String(120), nullable=False)
    is_finished: bool = db.Column(db.Boolean, default=False, nullable=False)
    created_at: datetime = db.Column(
        db.DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: datetime = db.Column(
        db.DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # Relationships
    words: list[Word] = db.relationship(
        "Word", backref="game_slip", lazy="select", cascade="all, delete-orphan"
    )
    players: list[Player] = db.relationship(
        "Player", backref="game_slip", lazy="select", cascade="all, delete-orphan"
    )
    sessions: list[GameSession] = db.relationship(
        "GameSession", backref="game_slip", lazy="select", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "is_finished": self.is_finished,
            "words": [w.to_dict() for w in self.words],
            "players": [p.to_dict() for p in self.players],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<GameSlip id={self.id} title={self.title!r}>"


class Word(db.Model):
    """A single word belonging to a GameSlip."""

    __tablename__ = "word"

    id: int = db.Column(db.Integer, primary_key=True)
    text: str = db.Column(db.String(200), nullable=False)
    position: int = db.Column(db.Integer, default=0, nullable=False)
    game_slip_id: int = db.Column(
        db.Integer, db.ForeignKey("game_slip.id", ondelete="CASCADE"), nullable=False
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "position": self.position,
        }

    def __repr__(self) -> str:
        return f"<Word id={self.id} text={self.text!r}>"


class Player(db.Model):
    """A player registered against a GameSlip."""

    __tablename__ = "player"

    id: int = db.Column(db.Integer, primary_key=True)
    name: str = db.Column(db.String(80), nullable=False)
    position: int = db.Column(db.Integer, default=0, nullable=False)
    game_slip_id: int = db.Column(
        db.Integer, db.ForeignKey("game_slip.id", ondelete="CASCADE"), nullable=False
    )

    # Scores across all sessions
    scores: list[Score] = db.relationship(
        "Score", backref="player", lazy="select", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "position": self.position,
        }

    def __repr__(self) -> str:
        return f"<Player id={self.id} name={self.name!r}>"


class GameSession(db.Model):
    """Represents one play-through of a GameSlip."""

    __tablename__ = "game_session"

    id: int = db.Column(db.Integer, primary_key=True)
    game_slip_id: int = db.Column(
        db.Integer, db.ForeignKey("game_slip.id", ondelete="CASCADE"), nullable=False
    )
    started_at: datetime = db.Column(
        db.DateTime(timezone=True), default=_utcnow, nullable=False
    )
    ended_at: datetime | None = db.Column(db.DateTime(timezone=True), nullable=True)
    is_active: bool = db.Column(db.Boolean, default=True, nullable=False)

    scores: list[Score] = db.relationship(
        "Score", backref="session", lazy="select", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "game_slip_id": self.game_slip_id,
            "is_active": self.is_active,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "scores": [s.to_dict() for s in self.scores],
        }

    def __repr__(self) -> str:
        return f"<GameSession id={self.id} slip={self.game_slip_id}>"


class Score(db.Model):
    """Running score for a player within a GameSession."""

    __tablename__ = "score"

    id: int = db.Column(db.Integer, primary_key=True)
    session_id: int = db.Column(
        db.Integer,
        db.ForeignKey("game_session.id", ondelete="CASCADE"),
        nullable=False,
    )
    player_id: int = db.Column(
        db.Integer, db.ForeignKey("player.id", ondelete="CASCADE"), nullable=False
    )
    points: int = db.Column(db.Integer, default=0, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "player_id": self.player_id,
            "player_name": self.player.name if self.player else "",
            "points": self.points,
        }

    def __repr__(self) -> str:
        return f"<Score player={self.player_id} pts={self.points}>"
