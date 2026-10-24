"""Personal question practice service, using only the Python standard library."""
import argparse
import gzip
import hashlib
import json
import mimetypes
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

FILTERS = ("all", "single", "multiple", "multiple_all", "multiple_partial", "judge", "judge_true", "judge_false")
DEFAULT_BANK = "sgcc-public-2027"


def matches(question, kind="all", chapter=""):
    if chapter and question["chapter"] != chapter:
        return False
    qtype = question["type"]
    if kind in ("all", qtype):
        return True
    if qtype == "multiple":
        all_selected = len(question["answer"]) == len(question["options"])
        return kind == ("multiple_all" if all_selected else "multiple_partial")
    if qtype == "judge":
        correct = next(o["text"] for o in question["options"] if o["key"] == question["answer"][0])
        return kind == ("judge_true" if correct == "正确" else "judge_false")
    return False


class QuizServer(ThreadingHTTPServer):
    def __init__(self, address, data_dir, static_root, bank_path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "quiz.sqlite3"
        self.static_root = Path(static_root).resolve()
        self.bank = json.loads(Path(bank_path).read_text(encoding="utf-8"))
        self.bank.setdefault("id", DEFAULT_BANK)
        self.bank.setdefault("name", self.bank.get("title", "公共与行业知识 · 2027 版"))
        self.banks = {self.bank["id"]: self.bank}
        for path in sorted(Path(bank_path).with_name("banks").glob("*.json")):
            bank = json.loads(path.read_text(encoding="utf-8"))
            if bank["id"] in self.banks:
                raise ValueError("题库编号重复")
            self.banks[bank["id"]] = bank
        self.bank_questions = {key: {q["id"]: q for q in bank["questions"]}
                               for key, bank in self.banks.items()}
        self.bank_versions = {
            key: hashlib.sha256(json.dumps(bank, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
            for key, bank in self.banks.items()
        }
        self.questions = {q["id"]: q for q in self.bank["questions"]}
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS tokens (
                    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS rounds (
                    user_id INTEGER NOT NULL, bank_id TEXT NOT NULL, id TEXT NOT NULL, mode TEXT NOT NULL,
                    kind TEXT NOT NULL, chapter TEXT NOT NULL, queue TEXT NOT NULL, answers TEXT NOT NULL,
                    position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, bank_id));
                CREATE TABLE IF NOT EXISTS attempts (
                    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, question_id TEXT NOT NULL,
                    selected TEXT NOT NULL, correct INTEGER NOT NULL, created INTEGER NOT NULL,
                    mode TEXT NOT NULL, round_id TEXT NOT NULL, position INTEGER NOT NULL,
                    UNIQUE(round_id, position));
                CREATE INDEX IF NOT EXISTS attempts_user ON attempts(user_id, id);
                CREATE TABLE IF NOT EXISTS favorites (
                    user_id INTEGER NOT NULL, bank_id TEXT NOT NULL, question_id TEXT NOT NULL,
                    created INTEGER NOT NULL, PRIMARY KEY(user_id, bank_id, question_id));
            """)
            db.execute("BEGIN IMMEDIATE")
            if "position" not in {column[1] for column in db.execute("PRAGMA table_info(rounds)")}:
                db.execute("ALTER TABLE rounds ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
                for row in db.execute("SELECT user_id, answers FROM rounds").fetchall():
                    db.execute("UPDATE rounds SET position=? WHERE user_id=?",
                               (len(json.loads(row["answers"])), row["user_id"]))
            if "bank_id" not in {column[1] for column in db.execute("PRAGMA table_info(rounds)")}:
                db.execute("ALTER TABLE rounds RENAME TO rounds_legacy")
                db.execute("""CREATE TABLE rounds (
                    user_id INTEGER NOT NULL, bank_id TEXT NOT NULL, id TEXT NOT NULL, mode TEXT NOT NULL,
                    kind TEXT NOT NULL, chapter TEXT NOT NULL, queue TEXT NOT NULL, answers TEXT NOT NULL,
                    position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, bank_id))""")
                db.execute("""INSERT INTO rounds
                    SELECT user_id, ?, id, mode, kind, chapter, queue, answers, position FROM rounds_legacy""",
                           (DEFAULT_BANK,))
                db.execute("DROP TABLE rounds_legacy")
            if "bank_id" not in {column[1] for column in db.execute("PRAGMA table_info(attempts)")}:
                db.execute("ALTER TABLE attempts ADD COLUMN bank_id TEXT NOT NULL DEFAULT 'sgcc-public-2027'")
            if "subject" not in {column[1] for column in db.execute("PRAGMA table_info(rounds)")}:
                db.execute("ALTER TABLE rounds ADD COLUMN subject TEXT NOT NULL DEFAULT ''")
        super().__init__(address, Handler)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=20)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def state(self, db, user, bank_id=DEFAULT_BANK):
        # Count saved submissions across banks using the Beijing calendar day (UTC+8).
        now = int(time.time())
        today_start = (now + 8 * 3600) // 86400 * 86400 - 8 * 3600
        today_attempts = db.execute(
            "SELECT COUNT(*) FROM attempts WHERE user_id=? AND created>=? AND created<?",
            (user, today_start, today_start + 86400)).fetchone()[0]
        latest = {}
        questions = self.bank_questions[bank_id]
        rows = db.execute("SELECT * FROM attempts WHERE user_id=? AND bank_id=? ORDER BY id", (user, bank_id)).fetchall()
        for row in rows:
            if row["question_id"] in questions:
                latest[row["question_id"]] = bool(row["correct"])
        current = db.execute("SELECT * FROM rounds WHERE user_id=? AND bank_id=?", (user, bank_id)).fetchone()
        active = None
        if current:
            active = dict(current)
            active.pop("user_id")
            active["queue"] = json.loads(active["queue"])
            active["answers"] = json.loads(active["answers"])
        history = [dict(id=r["id"], question_id=r["question_id"], selected=json.loads(r["selected"]),
                        correct=bool(r["correct"]), created=r["created"], mode=r["mode"])
                   for r in reversed(rows[-100:])]
        return dict(latest=latest, round=active, history=history, favorites=self.favorite_ids(db, user, bank_id), attempts=len(rows),
                    correct_attempts=sum(r["correct"] for r in rows), today_attempts=today_attempts)

    def favorite_ids(self, db, user, bank_id):
        return [row[0] for row in db.execute(
            "SELECT question_id FROM favorites WHERE user_id=? AND bank_id=? ORDER BY created, question_id",
            (user, bank_id)) if row[0] in self.bank_questions[bank_id]]


class Handler(BaseHTTPRequestHandler):
    server_version = "GridQuiz/1.0"

    def log_message(self, fmt, *args):
        # Avoid putting account information or tokens in logs.
        pass

    def reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        encodings = self.headers.get("Accept-Encoding", "").lower().replace(" ", "").split(",")
        compressed = len(body) > 1024 and "gzip" in encodings
        if compressed:
            body = gzip.compress(body, compresslevel=5, mtime=0)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Accept-Encoding")
        if compressed:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 16000:
            raise ValueError("请求内容过大或为空")
        value = json.loads(self.rfile.read(length))
        if not isinstance(value, dict):
            raise ValueError("请求格式错误")
        return value

    def user(self, db):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        row = db.execute("SELECT user_id FROM tokens WHERE token=? AND expires>?",
                         (auth[7:], int(time.time()))).fetchone()
        return row[0] if row else None

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/grid-quiz/health":
            return self.reply(200, dict(ok=True))
        if path == "/api/grid-quiz/state":
            with self.server.connect() as db:
                user = self.user(db)
                if user is None:
                    return self.reply(401, dict(error="请先登录"))
                query = parse_qs(urlsplit(self.path).query)
                bank_id = query.get("bank", [DEFAULT_BANK])[0]
                if bank_id not in self.server.banks:
                    return self.reply(400, dict(error="题库不存在，请重新选择"))
                username = db.execute("SELECT username FROM users WHERE id=?", (user,)).fetchone()[0]
                banks = [dict(id=key, name=bank["name"], count=len(bank["questions"]))
                         for key, bank in self.server.banks.items()]
                version = self.server.bank_versions[bank_id]
                payload = dict(username=username, banks=banks, bank_version=version,
                               state=self.server.state(db, user, bank_id))
                if query.get("bank_version", [""])[0] != version:
                    payload["bank"] = self.server.banks[bank_id]
                return self.reply(200, payload)
        if path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/tools/grid-quiz/index.html" if path == "/" else
                             "https://zhiyuuuha.github.io/web-tools/")
            self.end_headers()
            return
        decoded = unquote(path)
        allowed = decoded.startswith(("/assets/", "/tools/grid-quiz/"))
        target = (self.server.static_root / decoded.lstrip("/")).resolve()
        allowed = allowed and self.server.static_root in target.parents
        allowed = allowed and target.suffix.lower() in (".html", ".css", ".js", ".svg", ".png", ".ico", ".jpg", ".jpeg", ".gif", ".webp")
        if not allowed or not target.is_file():
            return self.reply(404, dict(error="页面不存在"))
        content = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", (mimetypes.guess_type(str(target))[0] or "application/octet-stream") + "; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/api/grid-quiz/register":
            return self.reply(403, dict(error="注册功能已关闭，请使用已有账号登录"))
        try:
            body = self.body()
            with self.server.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                if path == "/api/grid-quiz/login":
                    name = body.get("username", "")
                    password = body.get("password", "")
                    if not isinstance(name, str) or not isinstance(password, str):
                        raise ValueError("账号密码格式错误")
                    name = name.strip()
                    if not 1 <= len(name) <= 40 or not 1 <= len(password) <= 100:
                        raise ValueError("账号需为 1–40 个字符，密码需为 1–100 个字符")
                    row = db.execute("SELECT id FROM users WHERE username=? AND password=?", (name, password)).fetchone()
                    if row is None:
                        return self.reply(401, dict(error="账号或密码不正确"))
                    user = row[0]
                    token = secrets.token_urlsafe(32)
                    db.execute("DELETE FROM tokens WHERE expires<=?", (int(time.time()),))
                    db.execute("INSERT INTO tokens VALUES (?,?,?)", (token, user, int(time.time()) + 30 * 86400))
                    db.commit()
                    return self.reply(200, dict(token=token, username=name))
                user = self.user(db)
                if user is None:
                    return self.reply(401, dict(error="登录已过期，请重新登录"))
                bank_id = body.get("bank", DEFAULT_BANK)
                if not isinstance(bank_id, str) or bank_id not in self.server.banks:
                    raise ValueError("题库不存在，请重新选择")
                questions = self.server.bank_questions[bank_id]
                if path == "/api/grid-quiz/logout":
                    db.execute("DELETE FROM tokens WHERE token=?", (self.headers["Authorization"][7:],))
                elif path == "/api/grid-quiz/favorite":
                    question_id, favorite = body.get("question_id"), body.get("favorite")
                    if not isinstance(question_id, str) or question_id not in questions:
                        raise ValueError("题目不存在")
                    if type(favorite) is not bool:
                        raise ValueError("收藏状态不正确")
                    if favorite:
                        db.execute("INSERT OR IGNORE INTO favorites(user_id,bank_id,question_id,created) VALUES (?,?,?,?)",
                                   (user, bank_id, question_id, int(time.time())))
                    else:
                        db.execute("DELETE FROM favorites WHERE user_id=? AND bank_id=? AND question_id=?",
                                   (user, bank_id, question_id))
                    db.commit()
                    # Updating a bookmark must not replace another device's round in the caller's UI.
                    return self.reply(200, dict(favorites=self.server.favorite_ids(db, user, bank_id)))
                elif path == "/api/grid-quiz/start":
                    mode, kind, chapter = body.get("mode"), body.get("kind", "all"), body.get("chapter", "")
                    subject = body.get("subject", "")
                    if mode not in ("ordered", "random", "wrong", "favorites") or kind not in FILTERS:
                        raise ValueError("刷题模式或题型不正确")
                    if chapter and chapter not in {q["chapter"] for q in questions.values()}:
                        raise ValueError("章节不存在")
                    if subject and subject not in {q.get("subject", "") for q in questions.values()}:
                        raise ValueError("科目不存在")
                    state = self.server.state(db, user, bank_id)
                    queue = [q["id"] for q in questions.values() if matches(q, kind, chapter)
                             and (not subject or q.get("subject") == subject)
                             and (mode != "wrong" or state["latest"].get(q["id"]) is False)
                             and (mode != "favorites" or q["id"] in state["favorites"])]
                    if not queue:
                        raise ValueError({"wrong": "当前范围没有错题", "favorites": "当前范围没有收藏题目"}.get(mode, "当前筛选范围没有题目"))
                    if mode == "random":
                        secrets.SystemRandom().shuffle(queue)
                    db.execute("INSERT OR REPLACE INTO rounds(user_id,bank_id,id,mode,kind,chapter,queue,answers,subject) VALUES (?,?,?,?,?,?,?,?,?)",
                               (user, bank_id, secrets.token_hex(16), mode, kind, chapter, json.dumps(queue), "[]", subject))
                elif path in ("/api/grid-quiz/answer", "/api/grid-quiz/navigate"):
                    row = db.execute("SELECT * FROM rounds WHERE user_id=? AND bank_id=?", (user, bank_id)).fetchone()
                    if not row or body.get("round_id") != row["id"]:
                        return self.reply(409, dict(error="刷题进度已变化，请刷新后继续"))
                    queue, answers = json.loads(row["queue"]), json.loads(row["answers"])
                    position = body.get("position")
                    limit = len(queue) if path.endswith("/navigate") else len(queue) - 1
                    if type(position) is not int or not 0 <= position <= limit:
                        raise ValueError("题目位置不正确")
                    if path.endswith("/navigate"):
                        if position == len(queue) and (len(answers) != len(queue) or not all(answers)):
                            raise ValueError("还有未作答的题目，请完成后查看本轮结果")
                        db.execute("UPDATE rounds SET position=? WHERE user_id=? AND bank_id=?", (position, user, bank_id))
                        db.commit()
                        return self.reply(200, dict(state=self.server.state(db, user, bank_id)))
                    # Retrying a saved submission never creates another attempt.
                    if position < len(answers) and answers[position] is not None:
                        return self.reply(200, dict(state=self.server.state(db, user, bank_id)))
                    q = questions[queue[position]]
                    selected = body.get("selected")
                    if not isinstance(selected, list) or not selected or not all(isinstance(s, str) for s in selected):
                        raise ValueError("请先选择答案")
                    keys = {o["key"] for o in q["options"]}
                    if len(set(selected)) != len(selected) or not set(selected) <= keys:
                        raise ValueError("选项不正确")
                    if q["type"] != "multiple" and len(selected) != 1:
                        raise ValueError("本题只能选择一个选项")
                    selected = sorted(selected)
                    correct = selected == sorted(q["answer"])
                    if position >= len(answers):
                        answers.extend([None] * (position + 1 - len(answers)))
                    answers[position] = dict(question_id=q["id"], selected=selected, correct=correct)
                    db.execute("INSERT INTO attempts(user_id,bank_id,question_id,selected,correct,created,mode,round_id,position) VALUES (?,?,?,?,?,?,?,?,?)",
                               (user, bank_id, q["id"], json.dumps(selected), int(correct), int(time.time()), row["mode"], row["id"], position))
                    db.execute("UPDATE rounds SET answers=?,position=? WHERE user_id=? AND bank_id=?", (json.dumps(answers), position, user, bank_id))
                elif path == "/api/grid-quiz/reset":
                    if body.get("confirm") != "清空我的记录":
                        raise ValueError("请确认清空记录")
                    db.execute("DELETE FROM attempts WHERE user_id=? AND bank_id=?", (user, bank_id))
                    db.execute("DELETE FROM rounds WHERE user_id=? AND bank_id=?", (user, bank_id))
                else:
                    return self.reply(404, dict(error="接口不存在"))
                db.commit()
                return self.reply(200, dict(state=self.server.state(db, user, bank_id)))
        except (ValueError, TypeError, KeyError) as exc:
            self.reply(400, dict(error=str(exc)))
        except sqlite3.Error:
            self.reply(503, dict(error="记录暂时未能保存，请稍后重试"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", default=os.environ.get("GRID_QUIZ_DATA", str(Path.home() / ".web-tools-grid-quiz")))
    parser.add_argument("--static-root", default=str(Path(__file__).resolve().parents[3]))
    parser.add_argument("--bank", default=str(Path(__file__).with_name("bank.json")))
    args = parser.parse_args()
    server = QuizServer((args.host, args.port), args.data_dir, args.static_root, args.bank)
    print(f"Grid Quiz listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()
