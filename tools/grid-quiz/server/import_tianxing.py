"""Convert locally collected, user-authorized Tianxing questions into bank files.

This importer works offline with saved question responses. It handles no login
credentials and does not make requests to the mini-program's APIs.
"""
import argparse
import hashlib
import html
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen

BANKS = {387: ("tianxing-computer-basic", "天行电力 · 计算机基础", 1828),
         454: ("tianxing-computer-sprint", "天行电力 · 计算机冲刺", 2295)}
TYPES = {1: "single", 2: "multiple", 3: "judge"}
TAGS = {"p", "br", "strong", "b", "em", "i", "u", "sub", "sup", "span", "div",
        "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "pre", "code", "img"}
BLOCKS = {"p", "br", "div", "li", "tr", "pre"}


class Content(HTMLParser):
    def __init__(self, assets, media_dir, download):
        super().__init__(convert_charrefs=True)
        self.assets, self.media_dir, self.download = assets, media_dir, download
        self.parts, self.text = [], []
        self.suppressed = 0

    def handle_starttag(self, tag, attributes):
        if tag in ("script", "style", "iframe", "object"):
            self.suppressed += 1
        if self.suppressed:
            return
        if tag in BLOCKS:
            self.text.append("\n")
        if tag not in TAGS:
            return
        attributes = dict(attributes)
        extra = ""
        if tag == "img":
            source = attributes.get("src", "")
            if not source:
                raise ValueError("Image has no source")
            url = urljoin("https://alioss.tianxingdianli.com/", source)
            parsed = urlsplit(url)
            if parsed.scheme not in ("https", "http") or parsed.hostname != "alioss.tianxingdianli.com":
                raise ValueError("Unexpected image host: " + str(parsed.hostname))
            url = "https://" + parsed.netloc + parsed.path + ("?" + parsed.query if parsed.query else "")
            digest = hashlib.sha256(url.encode()).hexdigest()
            extension = Path(parsed.path).suffix.lower()
            if extension not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
                raise ValueError("Unsupported image format: " + extension)
            name = digest + extension
            self.assets[url] = name
            local = self.media_dir / name
            if self.download and not local.exists():
                with urlopen(url, timeout=40) as response:
                    data = response.read(20_000_001)
                if len(data) > 20_000_000 or not data:
                    raise ValueError("Invalid image size")
                if not (data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff")
                        or data.startswith((b"GIF87a", b"GIF89a"))
                        or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")):
                    raise ValueError("Image data is not a supported bitmap")
                local.write_bytes(data)
            extra = ' src="/tools/grid-quiz/media/' + name + '" alt="' + html.escape(attributes.get("alt", "题目插图"), quote=True) + '"'
            self.text.append("[插图]")
        if tag in ("td", "th"):
            for key in ("rowspan", "colspan"):
                value = attributes.get(key, "")
                if value.isdigit() and 0 < int(value) < 100:
                    extra += f' {key}="{int(value)}"'
        self.parts.append("<" + tag + extra + ">")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "iframe", "object"):
            self.suppressed = max(0, self.suppressed - 1)
            return
        if self.suppressed:
            return
        if tag in TAGS and tag not in ("img", "br"):
            self.parts.append("</" + tag + ">")
        if tag in BLOCKS:
            self.text.append("\n")

    def handle_data(self, data):
        if not self.suppressed:
            self.parts.append(html.escape(data))
            self.text.append(data)


def convert_content(source, assets, media_dir, download):
    parser = Content(assets, media_dir, download)
    parser.feed(source or "")
    parser.close()
    text = re.sub(r"\n[ \t]*\n+", "\n", "".join(parser.text)).strip().replace("\xa0", " ")
    return text, "".join(parser.parts)


def convert(source_dir, output_dir, media_dir, download=True):
    manifest = json.loads((source_dir / "collection-manifest.json").read_text(encoding="utf-8"))
    progress = json.loads((source_dir / "collection-progress.json").read_text(encoding="utf-8"))
    if not progress["complete"]:
        raise ValueError("Question collection is incomplete")
    assets, report = {}, {}
    output_dir.mkdir(parents=True, exist_ok=True)
    media_dir.mkdir(parents=True, exist_ok=True)
    completed = []
    for source_bank, (bank_id, name, expected) in BANKS.items():
        questions, seen, types, supplemented = [], set(), Counter(), []
        for entry in manifest:
            if entry["bank"] != source_bank:
                continue
            source_id = entry["source_id"]
            if source_id in seen:
                raise ValueError(f"Duplicate question within bank: {source_bank}/{source_id}")
            seen.add(source_id)
            response = json.loads((source_dir / "capture" / "results" / (entry["job"] + ".json")).read_text(encoding="utf-8"))
            if not response.get("ok") or response["response"]["code"] != 200:
                raise ValueError("Question request failed")
            data = response["response"]["data"]
            if data["id"] != source_id or data["type"] not in TYPES:
                raise ValueError("Question identity or type mismatch")
            text, text_html = convert_content(data["topicName"], assets, media_dir, download)
            explanation, explanation_html = convert_content(data.get("analyse", ""), assets, media_dir, download)
            options, answer = [], []
            for index, option in enumerate(data["topicOptionList"]):
                key = chr(65 + index)
                value, value_html = convert_content(option.get("optionName", ""), assets, media_dir, download)
                if data["type"] == 3 and value.rstrip("。.") in ("正确", "错误"):
                    value = value.rstrip("。.")
                    value_html = html.escape(value)
                if option.get("optionPic"):
                    _, image = convert_content('<img src="' + html.escape(option["optionPic"], quote=True) + '">', assets, media_dir, download)
                    value_html += image
                    value += " [插图]"
                options.append(dict(key=key, text=value, html=value_html))
                if option.get("status") == 1:
                    answer.append(key)
                elif option.get("status") != 2:
                    raise ValueError("Unrecognized option answer status")
            kind = TYPES[data["type"]]
            answer_note = ""
            if not answer and (source_bank, source_id) == (454, 313049):
                # Explicitly approved by the user; keep the raw source unchanged.
                if kind != "judge" or "一般针对同一进程进行" not in explanation:
                    raise ValueError("Approved supplement no longer matches the source question")
                answer = [o["key"] for o in options if o["text"] == "正确"]
                answer_note = "原题未标答案，依据原解析补全为“正确”。"
                explanation = answer_note + "\n" + explanation
                explanation_html = "<p>" + html.escape(answer_note) + "</p>" + explanation_html
                supplemented.append(str(source_id))
            if not text or not options or not answer or (kind != "multiple" and len(answer) != 1):
                raise ValueError("Question has invalid content or answers")
            if kind == "judge" and {o["text"] for o in options} != {"正确", "错误"}:
                raise ValueError("Unexpected true/false option labels")
            types[kind] += 1
            questions.append(dict(id=str(len(questions) + 1), type=kind, subject=entry["subject"],
                chapter=entry["subject"] + " / " + entry["chapter"],
                source_id=str(source_id), text=text, text_html=text_html,
                explanation=explanation, explanation_html=explanation_html, answer_note=answer_note,
                options=options, answer=answer))
        if len(questions) != expected:
            raise ValueError(f"Bank {source_bank}: expected {expected}, got {len(questions)}")
        completed.append((bank_id, dict(id=bank_id, name=name,
            source="天行电力 · 用户已购题库，按原题答案与解析收录。", questions=questions)))
        report[bank_id] = dict(count=len(questions), types=dict(types),
                               subjects=dict(Counter(q["subject"] for q in questions)), supplemented=supplemented)
    # Publish banks only after both pass all question validations.
    for bank_id, bank in completed:
        target = output_dir / (bank_id + ".json")
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(bank, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(target)
    report["assets"] = len(assets)
    (source_dir / "import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).with_name("banks"))
    parser.add_argument("--media-dir", type=Path, default=Path(__file__).resolve().parents[1] / "media")
    args = parser.parse_args()
    convert(args.source_dir, args.output_dir, args.media_dir)
