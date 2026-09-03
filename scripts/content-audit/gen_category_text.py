"""Factual, reusable copy for each business category.

Every one of LocZ's 4.3M storefronts is built from the same open dataset and only 5 carry a
description, so Google measured two same-category pages at 42.8% identical phrasing and began
collapsing them. The page needs real prose, but a model given only a business name and a
category would have to invent what that shop sells -- false claims about a real company.

So the model never sees a business. It writes about the CATEGORY, where general statements are
true by construction ("pharmacies dispense prescription medicines"), and the renderer joins that
to the measured facts it holds about the individual place. Category text is written once here,
can be reviewed once, and is then reused.

Resumable: results append to category_text.json and finished slugs are skipped, because the run
is long and a background job on this machine can be torn down mid-way.
"""
import json, io, os, sys, time, threading, urllib.request
import llm_pool
from concurrent.futures import ThreadPoolExecutor

OUT = "category_text.json"
MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b-instruct")
URL = os.environ.get("OLLAMA_URL", "http://localhost:11434") + "/api/generate"
LIMIT = int(os.environ.get("LIMIT", "0"))

PROMPT = """You write for an Indian local directory. You know these trades first-hand.

Category: "{name}"
What people actually search for here: {kw}

Write JSON:

{{
 "overview": "2 sentences on what a place like this actually does day to day. Concrete.",
 "services": ["4-6 specific things it provides. Use the real words above where they fit."],
 "choosing": "2 sentences on what separates a good one from a bad one. Specific, not generic.",
 "practical": "2 sentences a regular customer would tell a friend before they go."
}}

Write like a person who has used these places, not like a brochure.

BANNED - never write these:
"various", "a wide range of", "essential services", "serve the community",
"When selecting a X, check its reputation", "qualifications of its staff",
"cater to", "diverse needs", "one-stop", "state-of-the-art", "plays a vital role".

BAD (empty, could describe anything):
  "This category includes various local establishments that serve the community."
  "When selecting one, check its reputation and the qualifications of its staff."

GOOD (specific, someone who knows):
  "Most run as a single counter with one or two staff, busiest between 6pm and 9pm."
  "Ask whether they stock the generic version - the price difference is often large."

Rules:
- Indian context. Rupees, local habits, how these places really operate.
- Only what is true of this category generally. Never name a business. No numbers you cannot know.
- Never "we" or "our".
- Vary how sentences begin.
- JSON only.
"""


POOL = llm_pool.Pool()


def llm(prompt):
    """One JSON answer from whichever of the nine models is not rate-limited right now."""
    out = POOL.ask(prompt)
    if out is None:
        raise RuntimeError("every provider is cooling down")
    return out


# Phrases that mean nothing. If the model reaches for one it has stopped describing this trade
# and started describing "a business", which is the failure this whole file exists to avoid.
FILLER = (
    "various", "wide range", "essential services", "serve the community", "cater to",
    "diverse needs", "one-stop", "state-of-the-art", "plays a vital role", "vital role",
    "check its reputation", "qualifications of its", "friendly staff", "meet your needs",
    "wide variety", "high-quality service", "range of services",
)


def valid(d):
    if not isinstance(d, dict):
        return False
    if not all(k in d for k in ("overview", "services", "choosing", "practical")):
        return False
    if not isinstance(d["services"], list) or len(d["services"]) < 3:
        return False
    blob = " ".join(str(v) for v in d.values()).lower()
    # First person means it wrote as a business rather than about the trade.
    if any(w in blob for w in (" we ", " our ", "we offer", "our team")):
        return False
    if any(f in blob for f in FILLER):
        return False
    # Two flat sentences is the shape generic copy takes; real description runs longer.
    if len(d["overview"].split()) < 18 or len(d["choosing"].split()) < 18:
        return False
    return True


def save(done):
    """Merge with whatever is on disk before writing.

    Two processes writing this file -- the long run plus a short test run -- each held their own
    copy of `done` and the last writer won, silently dropping the other's categories (617 back to
    489 once). Re-reading first makes a concurrent writer additive instead of destructive.
    """
    merged = {}
    if os.path.exists(OUT):
        try:
            merged = json.load(io.open(OUT, encoding="utf-8"))
        except Exception:
            merged = {}
    merged.update(done)
    tmp = OUT + ".tmp"
    json.dump(merged, io.open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, OUT)
    return len(merged)



cats = json.load(io.open("categories.json", encoding="utf-8"))
done = {}
if os.path.exists(OUT):
    done = json.load(io.open(OUT, encoding="utf-8"))
todo = [c for c in cats if c["slug"] not in done]
if LIMIT: todo = todo[:LIMIT]
print(f"{len(done)} done, {len(todo)} to generate", flush=True)
print("providers: " + ", ".join(POOL.names()), flush=True)

t0 = time.time()
lock = threading.Lock()
count = [0]

def work(c):
    kw = ", ".join((c.get("kw") or [])[:14]) or c["name"]
    prompt = PROMPT.format(name=c["name"], kw=kw)
    try:
        d = json.loads(llm(prompt))
        if not valid(d):
            # One retry, told plainly what went wrong. Cheaper than accepting filler that will
            # sit on tens of thousands of pages.
            nudge = (
                "\n\nYour last answer was generic. Be far more specific to "
                "this trade. Use concrete detail a regular customer would recognise."
            )
            d = json.loads(llm(prompt + nudge))
        if not valid(d):
            return None
        return c["slug"], {
            "overview": d["overview"].strip(),
            "services": [str(s).strip() for s in d["services"]][:6],
            "choosing": d["choosing"].strip(),
            "practical": d["practical"].strip(),
        }
    except Exception:
        return None

# Ollama serialises on one GPU, but the queue keeps it fed while a response is being decoded.
# Six was the point where added workers stopped improving throughput on this box.
with ThreadPoolExecutor(max_workers=16) as pool:
    for res in pool.map(work, todo):
        with lock:
            count[0] += 1
            if res:
                done[res[0]] = res[1]
            i = count[0]
            if i % 20 == 0 or i == len(todo):
                total = save(done)
                rate = i / max(1e-9, time.time() - t0)
                print(f"  {i}/{len(todo)}  ok={total}  {rate:.2f}/s  eta {(len(todo)-i)/max(rate,1e-9)/60:.0f}m", flush=True)
                print("    " + POOL.report(), flush=True)

total = save(done)
print(f"wrote {OUT}: {total} categories", flush=True)
