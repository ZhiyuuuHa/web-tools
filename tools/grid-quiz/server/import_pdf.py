"""Convert the supplied 2027 question bank. Requires pypdf only for importing."""
import argparse
import json
import re
from pathlib import Path


def convert(source):
    from pypdf import PdfReader
    kind = chapter = None
    lines = []
    for page_number, page in enumerate(PdfReader(source).pages, 1):
        for line in page.extract_text().splitlines():
            line = line.strip()
            if not line or re.fullmatch(r"第\s*\d+\s*页\s*共\s*\d+\s*页", line):
                continue
            lines.append((line, page_number))
    questions = []
    current = None
    option = None
    for line, page in lines:
        heading = re.fullmatch(r"[一二三]、(单选题|多选题|判断题)", line)
        section = re.fullmatch(r"第[一二三四五]部分\s*(.+)", line)
        if heading:
            kind = {"单选题": "single", "多选题": "multiple", "判断题": "judge"}[heading[1]]
        elif section:
            chapter = section[1]
        elif re.match(r"^\d+、", line):
            if current:
                raise ValueError(f"Question {current['id']} has no answer")
            number, text = line.split("、", 1)
            current = dict(id=number, type=kind, chapter=chapter, text=text,
                           options=[], answer=[], explanation="", page=page)
            option = None
        elif current and re.match(r"^答案[：:]", line):
            current["answer"] = re.findall(r"[A-H]", line.split("：", 1)[-1])
            questions.append(current)
            current = None
        elif current:
            match = re.match(r"^([A-H])[.．、]\s*(.*)", line)
            if match:
                option = dict(key=match[1], text=match[2])
                current["options"].append(option)
            elif option:
                option["text"] += line
            else:
                current["text"] += line
    assert current is None
    assert [int(q["id"]) for q in questions] == list(range(1, 833)), "Missing/duplicate questions"
    for q in questions:
        keys = [o["key"] for o in q["options"]]
        assert len(keys) == len(set(keys)) and 2 <= len(keys) <= 8, q["id"]
        assert q["answer"] and set(q["answer"]) <= set(keys), q["id"]
        assert q["type"] == "multiple" or len(q["answer"]) == 1, q["id"]
        assert q["type"] != "judge" or [o["text"] for o in q["options"]] == ["正确", "错误"], q["id"]
    return dict(id="sgcc-public-2027", title="公共与行业知识 · 2027 版",
                source=Path(source).name, questions=questions)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    args = parser.parse_args()
    bank = convert(args.source)
    Path(args.output).write_text(json.dumps(bank, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Converted {len(bank['questions'])} questions")
