"""Readable text from a LocZ storefront, straight from the HTML.

The visible copy is not in `<main>` -- the page streams as React Server Component flight data, so
`<main>` holds two words ("LocZ Loading") and everything a reader sees arrives inside
`self.__next_f.push([1,"..."])` chunks. Rendering each page in headless Chrome gets the real DOM
but costs seconds per page, which rules out sampling at any useful scale.

So: reassemble the flight payload and keep the string literals that read as prose. Class names,
hrefs, ids and encoded props are dropped -- not for tidiness, but because they are byte-identical
between any two storefronts and would inflate a similarity measurement toward 100% no matter what
the actual copy said.
"""
import json
import re

_CHUNK = re.compile(r'self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)')
_STRING = re.compile(r'"((?:[^"\\]|\\.){3,})"')

# Anything that is plainly machinery rather than something a person reads.
_MACHINE = re.compile(
    r"""^(?:
        [\w.\-/]*\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|map)$   # asset paths
      | https?://\S+$ | /[\w\-/.%]*$ | \#[\w-]+$                     # urls and paths
      | [\w-]+(?:__|--)[\w-]+ .*                                     # BEM-ish class names
      | \$?[A-Za-z]?\d+(?::\w+)+.*                                   # flight refs like $27:props
      | [0-9a-f]{8}-[0-9a-f]{4}-.*                                   # uuids
      | (?:M|m)\s*[\d.\-,\s]+[A-Za-z][\d.\-,\s]*$                    # svg path data
    )""",
    re.X,
)

_KEYS = re.compile(
    r"^(?:className|href|src|id|key|type|rel|role|width|height|viewBox|fill|stroke|d|"
    r"strokeWidth|strokeLinecap|strokeLinejoin|aria-hidden|loading|sizes|srcSet|"
    r"\$|children|props|@type|@context)$"
)


def _looks_readable(s: str) -> bool:
    if len(s) < 4 or _MACHINE.match(s) or _KEYS.match(s):
        return False
    letters = sum(ch.isalpha() or ch.isspace() for ch in s)
    if letters / len(s) < 0.72:
        return False
    # Require a real phrase. Flight data is dense with component and prop names
    # ("LoadingBoundaryProvider", "parallelRouterKey", "beforeInteractive") which are identical on
    # every page of the site; keeping them would drive any two pages toward 100% similarity and
    # make the measurement say nothing. Four words with a lowercase word among them is the line
    # that separates a sentence from an identifier.
    words = s.split()
    if len(words) < 4:
        return False
    if not any(w.islower() and w.isalpha() and len(w) > 2 for w in words):
        return False
    # Inline script/JSON fragments survive the letter ratio test; these never do.
    if any(ch in s for ch in "{}<>=;|") or "function" in s or "return" in s:
        return False
    return True


def page_text(html: str) -> str:
    """The prose on the page, as one whitespace-normalised string."""
    payload = []
    for m in _CHUNK.finditer(html):
        try:
            payload.append(json.loads('"' + m.group(1) + '"'))
        except Exception:
            payload.append(m.group(1))
    blob = "".join(payload)
    if not blob:
        blob = html

    seen = set()
    out = []
    for m in _STRING.finditer(blob):
        try:
            s = json.loads('"' + m.group(1) + '"')
        except Exception:
            s = m.group(1)
        s = s.strip()
        if not _looks_readable(s):
            continue
        # The same label can legitimately appear twice; keep duplicates out of the *measurement*
        # only when they are exact repeats of a whole string, which is what card grids produce.
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return re.sub(r"\s+", " ", " ".join(out))


def shingles(text: str, n: int = 5):
    words = re.findall(r"[a-z][a-z']{2,}", text.lower())
    return {tuple(words[i : i + n]) for i in range(len(words) - n + 1)}


def overlap(a: str, b: str) -> float:
    A, B = shingles(a), shingles(b)
    if not A or not B:
        return 0.0
    return 100.0 * len(A & B) / min(len(A), len(B))
