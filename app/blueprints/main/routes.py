"""
Main blueprint — serves HTML pages.
"""
from flask import render_template

from . import bp
from ...models import GameSlip


@bp.route("/")
def index():
    """Dashboard — list all game slips."""
    slips = GameSlip.query.order_by(GameSlip.created_at.desc()).all()
    return render_template("index.html", slips=slips)
