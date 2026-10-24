import gzip
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from app import DEFAULT_BANK, FILTERS, QuizServer, matches


class QuizTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.bank_path = Path(__file__).with_name("bank.json")
        self.server = QuizServer(("127.0.0.1", 0), self.temp.name,
                                 Path(__file__).resolve().parents[3], self.bank_path)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = "http://127.0.0.1:" + str(self.server.server_port) + "/api/grid-quiz/"
        with self.server.connect() as db:
            db.executemany("INSERT INTO users(username,password) VALUES (?,?)",
                           [('first', 'personal'), ('second', 'personal')])
        self.token = self.request("login", dict(username="first", password="personal"))[1]["token"]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, route, body=None, token=None):
        headers = {"Content-Type": "application/json"}
        auth = token or getattr(self, "token", "")
        if auth:
            headers["Authorization"] = "Bearer " + auth
        request = Request(self.url + route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with urlopen(request) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def start(self, mode="ordered", kind="all", chapter=""):
        status, result = self.request("start", dict(mode=mode, kind=kind, chapter=chapter))
        self.assertEqual(status, 200, result)
        return result["state"]["round"]

    def answer(self, round, selected, position=0):
        return self.request("answer", dict(round_id=round["id"], position=position, selected=selected))

    def test_today_count_uses_beijing_day_all_banks_and_current_account(self):
        # 1970-01-02 00:00 Beijing; include both day edges, without the history limit.
        start = 57600
        with self.server.connect() as db:
            user = db.execute("SELECT id FROM users WHERE username='first'").fetchone()[0]
            other = db.execute("INSERT INTO users(username,password) VALUES ('other','test')").lastrowid
            rows = [(user, DEFAULT_BANK, start + i) for i in range(105)]
            rows += [(user, 'tianxing-computer-basic', start + 86399),
                     (user, DEFAULT_BANK, start - 1), (user, DEFAULT_BANK, start + 86400),
                     (other, DEFAULT_BANK, start)]
            for i, (owner, bank, created) in enumerate(rows):
                db.execute("""INSERT INTO attempts(user_id,bank_id,question_id,selected,correct,created,mode,round_id,position)
                              VALUES (?,?,?,?,?,?,?,?,?)""",
                           (owner, bank, '1', '[]', 1, created, 'ordered', 'daily-test', i))
            with patch('app.time.time', return_value=start + 86399):
                self.assertEqual(self.server.state(db, user)['today_attempts'], 106)
                self.assertEqual(self.server.state(db, user, 'tianxing-computer-basic')['today_attempts'], 106)
                self.assertEqual(self.server.state(db, other)['today_attempts'], 1)
            with patch('app.time.time', return_value=start + 86400):
                self.assertEqual(self.server.state(db, user)['today_attempts'], 1)

    def test_today_count_tracks_saved_answers_without_retry_or_navigation_duplicates(self):
        self.assertEqual(self.request('state')[1]['state']['today_attempts'], 0)
        round = self.start()
        self.assertEqual(self.request('state')[1]['state']['today_attempts'], 0)
        selected = self.server.questions[round['queue'][0]]['answer']
        self.assertEqual(self.answer(round, selected)[1]['state']['today_attempts'], 1)
        self.assertEqual(self.answer(round, selected)[1]['state']['today_attempts'], 1)
        self.assertEqual(self.request('navigate', dict(round_id=round['id'], position=1))[1]['state']['today_attempts'], 1)
        round = self.start()
        self.assertEqual(self.answer(round, selected)[1]['state']['today_attempts'], 2)
        self.assertEqual(self.request('reset', dict(confirm='清空我的记录'))[1]['state']['today_attempts'], 0)

    def test_bank_is_complete_and_filter_partitions(self):
        questions = list(self.server.questions.values())
        self.assertEqual(len(questions), 832)
        groups = {kind: {q["id"] for q in questions if matches(q, kind)} for kind in FILTERS}
        self.assertEqual(groups["single"] | groups["multiple"] | groups["judge"], groups["all"])
        self.assertFalse(groups["multiple_all"] & groups["multiple_partial"])
        self.assertEqual(groups["multiple_all"] | groups["multiple_partial"], groups["multiple"])
        self.assertFalse(groups["judge_true"] & groups["judge_false"])
        self.assertEqual(groups["judge_true"] | groups["judge_false"], groups["judge"])
        for kind in FILTERS:
            for chapter in {q["chapter"] for q in questions}:
                round = self.start(kind=kind, chapter=chapter)
                self.assertEqual(set(round["queue"]), {q["id"] for q in questions if matches(q, kind, chapter)})

    def test_imported_banks_are_complete_and_have_valid_filter_partitions(self):
        expected = {"tianxing-computer-basic": 1910, "tianxing-computer-sprint": 2295}
        for bank_id, count in expected.items():
            if bank_id not in self.server.banks:
                continue  # Original PDF-only installations remain supported.
            bank = self.server.banks[bank_id]
            questions = bank["questions"]
            self.assertEqual(len(questions), count)
            self.assertEqual(len({q["id"] for q in questions}), count)
            self.assertEqual(len({q["source_id"] for q in questions}), count)
            if bank_id == "tianxing-computer-basic":
                self.assertEqual(sum(q["subject"] == "计算机网络" for q in questions), 250)
                self.assertEqual(sum(q["subject"] == "信息新技术" for q in questions), 186)
                self.assertEqual(sum(q["chapter"] == "信息新技术 / 云计算基础 / 练习题" for q in questions), 16)
            groups = {kind: {q["id"] for q in questions if matches(q, kind)} for kind in FILTERS}
            self.assertEqual(groups["single"] | groups["multiple"] | groups["judge"], groups["all"])
            self.assertEqual(groups["multiple_all"] | groups["multiple_partial"], groups["multiple"])
            self.assertFalse(groups["multiple_all"] & groups["multiple_partial"])
            self.assertEqual(groups["judge_true"] | groups["judge_false"], groups["judge"])
            self.assertFalse(groups["judge_true"] & groups["judge_false"])
            for q in questions:
                self.assertTrue(q["subject"] and q["chapter"] and q["text"])
                self.assertTrue(set(q["answer"]) <= {o["key"] for o in q["options"]})
            if bank_id == "tianxing-computer-sprint":
                supplemented = next(q for q in questions if q["source_id"] == "313049")
                self.assertEqual([o["text"] for o in supplemented["options"] if o["key"] in supplemented["answer"]], ["正确"])
                self.assertIn("原题未标答案，依据原解析补全", supplemented["explanation"])

    def test_random_is_complete_without_repetition_and_persisted(self):
        round = self.start("random", "multiple_partial")
        self.assertEqual(len(round["queue"]), len(set(round["queue"])))
        self.assertEqual(self.request("state")[1]["state"]["round"], round)
        reopened = QuizServer(("127.0.0.1", 0), self.temp.name, self.server.static_root, self.bank_path)
        try:
            with reopened.connect() as db:
                self.assertEqual(reopened.state(db, 1)["round"], round)
        finally:
            reopened.server_close()

    def test_state_compression_preserves_payload_and_reduces_transfer(self):
        expected = self.request("state")[1]
        request = Request(self.url + "state", headers={"Authorization": "Bearer " + self.token,
                                                       "Accept-Encoding": "gzip, deflate"})
        with urlopen(request) as response:
            compressed = response.read()
            self.assertEqual(response.headers.get("Content-Encoding"), "gzip")
            self.assertEqual(int(response.headers["Content-Length"]), len(compressed))
            self.assertIn("Accept-Encoding", response.headers["Vary"])
        self.assertEqual(json.loads(gzip.decompress(compressed)), expected)
        self.assertLess(len(compressed), len(json.dumps(expected, ensure_ascii=False).encode()) / 3)
        request = Request(self.url + "state", headers={"Authorization": "Bearer " + self.token,
                                                       "Accept-Encoding": "gzip;q=0"})
        with urlopen(request) as response:
            self.assertIsNone(response.headers.get("Content-Encoding"))
            self.assertEqual(json.load(response), expected)

    def test_cached_bank_switch_fetches_fresh_progress_without_resending_questions(self):
        initial = self.request("state")[1]
        version = initial.get("bank_version", "unversioned")
        round = self.start(kind="single")
        question = self.server.questions[round["queue"][0]]
        self.answer(round, question["answer"])
        status, cached = self.request("state?bank=" + DEFAULT_BANK + "&bank_version=" + version)
        self.assertEqual(status, 200)
        self.assertTrue("bank" not in cached, "Cached switch resent the full question bank")
        self.assertLess(len(json.dumps(cached).encode()), 100_000)
        self.assertEqual(cached["state"]["attempts"], 1)
        self.assertTrue(cached["state"]["latest"][question["id"]])
        self.assertEqual(cached["bank_version"], version)
        stale = self.request("state?bank_version=outdated")[1]
        self.assertEqual(stale["bank"], initial["bank"])
        self.assertNotEqual(stale["bank_version"], "outdated")
        self.assertEqual(self.request("state?bank_version=" + version, token="invalid")[0], 401)

    def test_wrong_retry_correct_and_account_isolation(self):
        round = self.start(kind="single")
        question = self.server.questions[round["queue"][0]]
        wrong = next(o["key"] for o in question["options"] if o["key"] not in question["answer"])
        status, result = self.answer(round, [wrong])
        self.assertEqual(status, 200)
        self.assertFalse(result["state"]["latest"][question["id"]])
        self.assertEqual(self.answer(round, [wrong])[1]["state"]["attempts"], 1)
        wrong_round = self.start("wrong")
        self.assertEqual(wrong_round["queue"], [question["id"]])
        self.assertEqual(self.request("start", dict(mode="wrong", kind="multiple"))[0], 400)
        status, fixed = self.answer(wrong_round, question["answer"])
        self.assertEqual(status, 200)
        self.assertTrue(fixed["state"]["latest"][question["id"]])
        self.assertEqual(fixed["state"]["attempts"], 2)
        self.assertEqual(self.request("start", dict(mode="wrong"))[0], 400)
        second = self.request("login", dict(username="second", password="personal"))[1]["token"]
        self.assertEqual(self.request("state", token=second)[1]["state"]["attempts"], 0)
        self.assertEqual(self.request("reset", dict(confirm="清空我的记录"), token=second)[0], 200)
        self.assertEqual(self.request("state")[1]["state"]["attempts"], 2)
        self.assertEqual(self.request("reset", dict(confirm="no"))[0], 400)
        cleared = self.request("reset", dict(confirm="清空我的记录"))[1]["state"]
        self.assertEqual(cleared["attempts"], 0)
        self.assertIsNone(cleared["round"])
        self.assertEqual(cleared["latest"], {})

    def test_multiple_requires_exact_set_and_stale_round_is_rejected(self):
        round = self.start(kind="multiple_all")
        q = self.server.questions[round["queue"][0]]
        status, result = self.answer(round, q["answer"][:1])
        self.assertEqual(status, 200)
        self.assertFalse(result["state"]["latest"][q["id"]])
        newer = self.start(kind="multiple_all")
        self.assertEqual(self.answer(round, q["answer"])[0], 409)
        self.assertEqual(self.answer(newer, ["Z"])[0], 400)
        self.assertEqual(self.answer(newer, q["answer"] + q["answer"])[0], 400)
        self.assertEqual(self.answer(newer, list(reversed(q["answer"])))[1]["state"]["latest"][q["id"]], True)

    def test_favorites_are_idempotent_persisted_and_survive_answer_reset(self):
        round = self.start(kind="single")
        question = self.server.questions[round["queue"][0]]
        before = self.request("state")[1]["state"]
        for _ in range(2):
            status, result = self.request("favorite", dict(question_id=question["id"], favorite=True))
            self.assertEqual((status, result), (200, {"favorites": [question["id"]]}))
        state = self.request("state")[1]["state"]
        self.assertEqual(state, dict(before, favorites=[question["id"]]))
        reopened = QuizServer(("127.0.0.1", 0), self.temp.name, self.server.static_root, self.bank_path)
        try:
            with reopened.connect() as db:
                self.assertEqual(reopened.state(db, 1)["favorites"], [question["id"]])
        finally:
            reopened.server_close()
        self.answer(round, question["answer"])
        cleared = self.request("reset", dict(confirm="清空我的记录"))[1]["state"]
        self.assertEqual(cleared["favorites"], [question["id"]])
        self.assertEqual(cleared["attempts"], 0)
        self.assertIsNone(cleared["round"])
        for _ in range(2):
            self.assertEqual(self.request("favorite", dict(question_id=question["id"], favorite=False)),
                             (200, {"favorites": []}))
        for body in (dict(question_id="missing", favorite=True), dict(question_id=1, favorite=True),
                     dict(question_id=question["id"], favorite="true"), dict(question_id=question["id"], favorite=1)):
            self.assertEqual(self.request("favorite", body)[0], 400)
        self.assertEqual(self.request("favorite", dict(question_id=question["id"], favorite=True), token="invalid")[0], 401)

    def test_favorites_are_separate_for_accounts_and_banks_and_fresh_with_cached_bank(self):
        question = self.server.bank["questions"][0]
        bank_id = "fixture-favorites"
        self.server.banks[bank_id] = dict(id=bank_id, name="测试收藏题库", questions=[question])
        self.server.bank_questions[bank_id] = {question["id"]: question}
        self.server.bank_versions[bank_id] = "fixture-version"
        initial = self.request("state")[1]
        body = dict(question_id=question["id"], favorite=True)
        self.request("favorite", body)
        second = self.request("login", dict(username="second", password="personal"))[1]["token"]
        self.assertEqual(self.request("state", token=second)[1]["state"]["favorites"], [])
        self.assertEqual(self.request("state?bank=" + bank_id)[1]["state"]["favorites"], [])
        self.request("favorite", dict(body, bank=bank_id))
        self.request("favorite", dict(body, favorite=False))
        self.assertEqual(self.request("state?bank=" + bank_id)[1]["state"]["favorites"], [question["id"]])
        self.assertEqual(self.request("state")[1]["state"]["favorites"], [])
        self.request("favorite", body)
        cached = self.request("state?bank_version=" + initial["bank_version"])[1]
        self.assertTrue("bank" not in cached)
        self.assertEqual(cached["state"]["favorites"], [question["id"]])
        self.request("reset", dict(bank=bank_id, confirm="清空我的记录"))
        self.assertEqual(self.request("state")[1]["state"]["favorites"], [question["id"]])

    def test_favorite_practice_respects_scope_and_keeps_started_round_snapshot(self):
        bank_id = "fixture-favorites"
        first = dict(self.server.bank["questions"][0], id="1", subject="数据结构", chapter="第一章")
        others = [dict(first, id="2", subject="计算机网络"), dict(first, id="3", chapter="第二章"),
                  dict(first, id="4", type="multiple", answer=["A", "B"]), dict(first, id="5")]
        self.server.banks[bank_id] = dict(id=bank_id, name="测试收藏范围", questions=[first] + others)
        self.server.bank_questions[bank_id] = {q["id"]: q for q in [first] + others}
        self.server.bank_versions[bank_id] = "fixture-version"
        scope = dict(bank=bank_id, mode="favorites", kind="single", subject="数据结构", chapter="第一章")
        self.assertEqual(self.request("start", scope)[0], 400)
        for id in ("4", "3", "2", "1"):
            self.assertEqual(self.request("favorite", dict(bank=bank_id, question_id=id, favorite=True))[0], 200)
        status, result = self.request("start", scope)
        self.assertEqual(status, 200)
        round = result["state"]["round"]
        self.assertEqual(round["queue"], ["1"])
        self.assertEqual(round["mode"], "favorites")
        self.assertEqual(result["state"]["attempts"], 0)
        self.assertEqual(self.request("start", dict(scope, kind="all", subject="", chapter=""))[1]["state"]["round"]["queue"],
                         ["1", "2", "3", "4"])
        round = self.request("start", scope)[1]["state"]["round"]
        self.request("favorite", dict(bank=bank_id, question_id="1", favorite=False))
        self.assertEqual(self.request("state?bank=" + bank_id)[1]["state"]["round"], round)
        status, result = self.request("answer", dict(bank=bank_id, round_id=round["id"], position=0, selected=first["answer"]))
        self.assertEqual(status, 200)
        self.assertTrue(result["state"]["latest"]["1"])
        self.assertEqual(self.request("start", scope)[0], 400)

    def test_auth_and_private_files(self):
        self.assertEqual(self.request("login", dict(username="first", password="wrong"))[0], 401)
        for name in ('first', 'blocked-new-user'):
            status, result = self.request("register", dict(username=name, password="personal"))
            self.assertEqual(status, 403)
            self.assertIn("注册功能已关闭", result["error"])
        with self.server.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM users").fetchone()[0], 2)
        self.assertEqual(self.request("login", dict(username="first", password="personal"))[0], 200)
        self.assertEqual(self.request("state", token="invalid")[0], 401)
        self.assertEqual(self.request("logout", {})[0], 200)
        self.assertEqual(self.request("state")[0], 401)
        for path in ("/tools/grid-quiz/server/bank.json", "/tools/grid-quiz/server/app.py", "/.git/config", "/assets/../../package.json"):
            with self.assertRaises(HTTPError) as error:
                urlopen(self.url.split("/api/")[0] + path)
            self.assertEqual(error.exception.code, 404)

    def test_jump_skip_submit_and_resume(self):
        round = self.start(kind="single")
        status, result = self.request("navigate", dict(round_id=round["id"], position=8))
        self.assertEqual(status, 200, result)
        self.assertEqual(result["state"]["round"]["position"], 8)
        q = self.server.questions[round["queue"][8]]
        status, result = self.answer(round, q["answer"], position=8)
        self.assertEqual(status, 200, result)
        answers = result["state"]["round"]["answers"]
        self.assertEqual(answers[:8], [None] * 8)
        self.assertTrue(answers[8]["correct"])
        self.assertEqual(result["state"]["attempts"], 1)
        self.assertEqual(self.answer(round, q["answer"], position=8)[1]["state"]["attempts"], 1)
        self.assertEqual(self.request("state")[1]["state"]["round"]["position"], 8)
        self.assertEqual(self.request("navigate", dict(round_id=round["id"], position=0))[0], 200)
        first = self.server.questions[round["queue"][0]]
        result = self.answer(round, first["answer"])[1]["state"]
        self.assertEqual(result["attempts"], 2)
        self.assertTrue(result["round"]["answers"][8]["correct"])
        self.assertEqual(self.request("navigate", dict(round_id=round["id"], position=len(round["queue"])))[0], 400)
        newer = self.start(kind="single")
        self.assertEqual(self.request("navigate", dict(round_id=round["id"], position=1))[0], 409)
        for position in (-1, len(newer["queue"]) + 1, True):
            self.assertEqual(self.request("navigate", dict(round_id=newer["id"], position=position))[0], 400)

    def test_finish_only_after_all_skipped_questions_are_answered(self):
        round = self.start(kind="judge_false", chapter="品牌建设")
        for position in reversed(range(len(round["queue"]))):
            q = self.server.questions[round["queue"][position]]
            status, result = self.answer(round, q["answer"], position=position)
            self.assertEqual(status, 200, result)
        self.assertEqual(result["state"]["attempts"], len(round["queue"]))
        status, result = self.request("navigate", dict(round_id=round["id"], position=len(round["queue"])))
        self.assertEqual(status, 200, result)
        self.assertEqual(result["state"]["round"]["position"], len(round["queue"]))

    def test_existing_round_progress_survives_schema_upgrade(self):
        with tempfile.TemporaryDirectory() as old_data:
            answers = [dict(question_id="1", selected=["B"], correct=True)]
            with sqlite3.connect(Path(old_data) / "quiz.sqlite3") as db:
                db.execute("CREATE TABLE rounds (user_id INTEGER PRIMARY KEY,id TEXT,mode TEXT,kind TEXT,chapter TEXT,queue TEXT,answers TEXT)")
                db.execute("INSERT INTO rounds VALUES (?,?,?,?,?,?,?)",
                           (7, "existing-round", "ordered", "all", "", '["1","2"]', json.dumps(answers)))
            db.close()
            upgraded = QuizServer(("127.0.0.1", 0), old_data, self.server.static_root, self.bank_path)
            try:
                with upgraded.connect() as db:
                    round = upgraded.state(db, 7)["round"]
                    self.assertEqual(round["position"], 1)
                    self.assertEqual(round["id"], "existing-round")
                    self.assertEqual(round["answers"], answers)
                    self.assertEqual(round["queue"], ["1", "2"])
                    self.assertEqual(upgraded.state(db, 7)["favorites"], [])
            finally:
                upgraded.server_close()

    def test_banks_keep_rounds_wrong_answers_and_resets_separate(self):
        # Same displayed ID in two banks must not merge histories or progress.
        question = dict(self.server.bank["questions"][0], subject="数据结构")
        bank_id = "fixture-computer"
        self.server.banks[bank_id] = dict(id=bank_id, name="测试题库", questions=[question])
        self.server.bank_questions[bank_id] = {question["id"]: question}
        self.server.bank_versions[bank_id] = "fixture-version"
        original = self.start(kind="single")
        q = self.server.questions[original["queue"][0]]
        self.answer(original, q["answer"])
        status, result = self.request("state?bank=" + bank_id)
        self.assertEqual(status, 200)
        self.assertEqual(result["state"]["attempts"], 0)
        self.assertIsNone(result["state"]["round"])
        self.assertEqual(len(result["banks"]), len(self.server.banks))
        status, result = self.request("start", dict(bank=bank_id, mode="ordered", subject="数据结构"))
        self.assertEqual(status, 200, result)
        computer = result["state"]["round"]
        self.assertEqual(computer["subject"], "数据结构")
        wrong = next(o["key"] for o in question["options"] if o["key"] not in question["answer"])
        status, result = self.request("answer", dict(bank=bank_id, round_id=computer["id"], position=0, selected=[wrong]))
        self.assertEqual(status, 200)
        self.assertEqual(result["state"]["latest"], {question["id"]: False})
        original_state = self.request("state")[1]["state"]
        self.assertEqual(original_state["round"]["id"], original["id"])
        self.assertEqual(original_state["latest"], {q["id"]: True})
        self.assertEqual(self.request("navigate", dict(bank=bank_id, round_id=original["id"], position=0))[0], 409)
        self.assertEqual(self.request("start", dict(bank=bank_id, mode="ordered", subject="不存在"))[0], 400)
        self.request("reset", dict(bank=bank_id, confirm="清空我的记录"))
        self.assertEqual(self.request("state?bank=" + bank_id)[1]["state"]["attempts"], 0)
        after_reset = self.request("state")[1]["state"]
        self.assertEqual(original_state.pop("today_attempts"), 2)
        self.assertEqual(after_reset.pop("today_attempts"), 1)
        self.assertEqual(after_reset, original_state)
        self.assertEqual(self.request("state?bank=missing")[0], 400)
        self.assertEqual(self.request("start", dict(bank="missing", mode="ordered"))[0], 400)

    def test_existing_attempts_migrate_to_original_bank(self):
        with tempfile.TemporaryDirectory() as old_data:
            with sqlite3.connect(Path(old_data) / "quiz.sqlite3") as db:
                db.execute("""CREATE TABLE attempts (id INTEGER PRIMARY KEY,user_id INTEGER,
                    question_id TEXT,selected TEXT,correct INTEGER,created INTEGER,mode TEXT,
                    round_id TEXT,position INTEGER,UNIQUE(round_id,position))""")
                db.execute("INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?,?)",
                           (1, 7, "1", '["B"]', 1, 100, "ordered", "legacy", 0))
            db.close()
            upgraded = QuizServer(("127.0.0.1", 0), old_data, self.server.static_root, self.bank_path)
            try:
                with upgraded.connect() as db:
                    state = upgraded.state(db, 7)
                    self.assertEqual(state["attempts"], 1)
                    self.assertEqual(state["latest"], {"1": True})
                    self.assertEqual(db.execute("SELECT bank_id FROM attempts").fetchone()[0], DEFAULT_BANK)
            finally:
                upgraded.server_close()


if __name__ == "__main__":
    unittest.main()
