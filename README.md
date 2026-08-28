# 🔀 Word Shuffle Game

A conductor-led word shuffle game built with Python, Flask, SQLite, and vanilla JavaScript. Designed for in-person group play where a game conductor controls the flow, players guess shuffled words, and scores are tracked in real time.

---

## ✨ Features

- **Game Slips** — Create, edit, and manage reusable collections of words
- **Player Management** — Add players per game slip; track scores in real time
- **Word Shuffling** — Words are automatically shuffled before display
- **Conductor Controls** — Dedicated CORRECT / WRONG / NEXT / END buttons
- **Score Tracking** — +3 per correct answer; scores displayed under player names
- **Finish / Unfinish Toggle** — Mark game slips as finished; locked until toggled back
- **Celebration Animations** — Stars burst for correct answers; bold red flash for wrong
- **Secure** — Environment-based secrets, CSRF protection, input sanitization

---

## 🗂 Project Structure

```
words_shuffle_game/
├── app/
│   ├── __init__.py          # App factory
│   ├── config.py            # Configuration classes
│   ├── models.py            # SQLAlchemy models
│   ├── blueprints/
│   │   ├── main/
│   │   │   ├── __init__.py
│   │   │   └── routes.py    # Dashboard & page routes
│   │   └── api/
│   │       ├── __init__.py
│   │       └── routes.py    # JSON API endpoints
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       └── app.js
│   └── templates/
│       ├── base.html
│       └── index.html
├── instance/                # SQLite DB lives here (git-ignored)
├── .env                     # Secrets — NEVER commit (git-ignored)
├── .env.example             # Safe template to share
├── .gitignore
├── requirements.txt
├── run.py                   # Application entry point
└── README.md
```

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd words_shuffle_game
```

### 2. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate       # Linux / macOS
.venv\Scripts\activate          # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set a strong `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 5. Run the application

```bash
python run.py
```

Visit [http://localhost:5000](http://localhost:5000) in your browser.

---

## 🎮 How to Play

1. **Create a Game Slip** — Click "New Game Slip", enter a title, add player names, and type in words (one per line or pasted in bulk).
2. **Save** — Click "Save Slip" to store it.
3. **Edit** — Click the slip title or an edit icon to modify words or players.
4. **Start the Game** — Click "START" on a slip. Choose which player goes first.
5. **Conduct** — The shuffled word appears on screen. Click:
   - **CORRECT** → +3 points for the current player, stars animation, next word, next player
   - **WRONG** → Red flash, no points; word stays until NEXT is clicked
   - **NEXT** → Advance to the next word (after a WRONG)
   - **END** → Close the game window
6. **Finish** — Click "FINISH" to lock a slip. Click "UNFINISH" to re-enable it.

---

## 🛡 Security Notes

- `SECRET_KEY` is loaded from `.env` and never hardcoded
- CSRF protection enabled on all POST routes via Flask-WTF
- All user inputs are sanitized before database writes
- `.env` is in `.gitignore` — it is never committed

---

## 🧰 Tech Stack

| Layer      | Technology                  |
|------------|-----------------------------|
| Backend    | Python 3.13, Flask 3.1.3    |
| ORM        | Flask-SQLAlchemy 3.1.1      |
| Database   | SQLite (via SQLAlchemy)     |
| Frontend   | HTML5, CSS3, Vanilla JS     |
| Forms      | Flask-WTF 1.2.2             |
| Config     | python-dotenv 1.1.1         |

---

## 📋 Requirements

See [`requirements.txt`](requirements.txt) for pinned dependencies.

---

## 📝 License

MIT — see `LICENSE` for details.
