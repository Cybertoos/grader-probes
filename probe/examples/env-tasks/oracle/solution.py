import codecs

FIELDS = ("title", "kind", "lane", "status", "who", "priority", "link")


def split_jsonl(chunks):
    decoder = codecs.getincrementaldecoder("utf-8")()
    out, rest = [], ""
    for chunk in chunks:
        rest += decoder.decode(chunk)
        while "\n" in rest:
            line, rest = rest.split("\n", 1)
            out.append(line[:-1] if line.endswith("\r") else line)
    rest += decoder.decode(b"", final=True)
    if rest:
        out.append(rest[:-1] if rest.endswith("\r") else rest)
    return out


def parse_item(text):
    if not text.startswith("---\n"):
        return {"body": text}
    end = text.find("\n---\n", 3)
    if end < 0:
        return {"body": text}
    item = {}
    for line in text[4:end].split("\n"):
        key, sep, value = line.partition(": ")
        if sep and key.strip() in FIELDS:
            item[key.strip()] = value
    try:
        item["priority"] = int(item.get("priority", 3))
    except ValueError:
        item["priority"] = 3
    body = text[end + 5:]
    item["body"] = body[1:] if body.startswith("\n") else body
    return item
