"""A pool of interchangeable JSON-returning models.

Writing copy for 1,416 categories (and later, per-city service pages) is thousands of calls, and
every free tier here runs out well before the job does -- the first Gemini key hit its daily
quota after a few dozen requests. One provider therefore cannot finish the run, and a single
provider that stalls takes the whole job with it.

So: several providers, tried in order of speed, each parked for a cooldown when it returns 429 or
fails, with the local models as the floor that never rate-limits. A job can then run for hours
unattended and simply slow down when the cloud tiers are spent, rather than stopping.
"""
import json, os, random, threading, time, urllib.error, urllib.request

# Short on purpose. A provider that has not answered in 45s is wedged, and waiting the old 150s
# for it meant one bad endpoint cost more wall-clock than the next three good ones combined --
# a single ask took 305s while it worked down the list. Rotating early is always cheaper here,
# because another provider is always available.
TIMEOUT = int(os.environ.get("LLM_TIMEOUT", "45"))


class Provider:
    def __init__(self, name, fn, weight=1):
        self.name, self.fn, self.weight = name, fn, weight
        self.cooldown_until = 0.0
        self.ok = 0
        self.fail = 0
        self.lock = threading.Lock()

    def available(self):
        return time.time() >= self.cooldown_until

    def park(self, seconds):
        with self.lock:
            self.cooldown_until = max(self.cooldown_until, time.time() + seconds)


def _post(url, payload, headers, timeout=None):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 # Some gateways refuse the bare urllib agent with a 403.
                 "User-Agent": "locz-content/1.0", **headers})
    with urllib.request.urlopen(req, timeout=timeout or TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def gemini(model, key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

    def call(prompt):
        d = _post(url, {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.75, "responseMimeType": "application/json"},
        }, {})
        return d["candidates"][0]["content"]["parts"][0]["text"]
    return call


def groq(model, key):
    def call(prompt):
        d = _post("https://api.groq.com/openai/v1/chat/completions", {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.75,
            "response_format": {"type": "json_object"},
            "max_tokens": 1200,
        }, {"Authorization": f"Bearer {key}"})
        return d["choices"][0]["message"]["content"]
    return call


def zen(model, key):
    """OpenCode Zen — one key, many hosted models, several of them free tier."""
    def call(prompt):
        d = _post("https://opencode.ai/zen/v1/chat/completions", {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.75,
            "max_tokens": 1100,
        }, {"Authorization": f"Bearer {key}"})
        return d["choices"][0]["message"]["content"]
    return call


def ollama(model, base="http://localhost:11434"):
    def call(prompt):
        d = _post(f"{base}/api/generate", {
            "model": model, "prompt": prompt, "stream": False, "format": "json",
            "options": {"temperature": 0.75, "num_predict": 900},
        }, {}, timeout=240)
        return d["response"]
    return call


def build_pool():
    """Cloud first because it is an order of magnitude faster; local last because it never runs out."""
    gem = os.environ.get("GEMINI_API_KEY", "").strip()
    grq = os.environ.get("GROQ_API_KEY", "").strip()
    zk = os.environ.get("ZEN_API_KEY", "").strip()
    pool = []
    if zk:
        # Only the free-tier models: this job is hundreds of thousands of calls and the paid
        # ones on the same key would bill for every one of them.
        pool += [Provider("zen:laguna-s-2.1", zen("laguna-s-2.1-free", zk), 4),
                 Provider("zen:mimo-v2.5", zen("mimo-v2.5-free", zk), 1),
                 Provider("zen:ling-3.0", zen("ling-3.0-flash-fin-free", zk), 1)]
    if grq:
        pool += [Provider("groq:qwen3.8-27b", groq("qwen/qwen3.8-27b", grq), 3),
                 Provider("groq:gpt-oss-120b", groq("openai/gpt-oss-120b", grq), 3),
                 Provider("groq:qwen3.6-27b", groq("qwen/qwen3.6-27b", grq), 2)]
    if gem:
        pool += [Provider("gemini:flash-lite", gemini("gemini-flash-lite-latest", gem), 3),
                 Provider("gemini:2.5-flash", gemini("gemini-2.5-flash", gem), 2),
                 Provider("gemini:flash-latest", gemini("gemini-flash-latest", gem), 1)]
    pool += [Provider("ollama:qwen2.5-7b", ollama("qwen2.5:7b-instruct"), 1),
             Provider("ollama:gemma2-9b", ollama("gemma2:9b"), 1),
             Provider("ollama:gemma4", ollama("gemma4:latest"), 1)]
    return pool


class Pool:
    def __init__(self, providers=None):
        self.providers = providers or build_pool()

    def names(self):
        return [p.name for p in self.providers]

    def ask(self, prompt, attempts=6):
        """A JSON string from whichever provider answers first. None when all are parked."""
        tried = set()
        for _ in range(attempts):
            live = [p for p in self.providers if p.available() and p.name not in tried]
            if not live:
                live = [p for p in self.providers if p.available()]
                tried.clear()
            if not live:
                # Everything is cooling down; wait for the soonest to come back rather than
                # spinning, so an exhausted cloud tier degrades to slow instead of failing.
                nap = min(p.cooldown_until for p in self.providers) - time.time()
                time.sleep(max(1.0, min(nap, 30)))
                continue
            p = random.choices(live, weights=[x.weight for x in live])[0]
            tried.add(p.name)
            try:
                out = p.fn(prompt)
                p.ok += 1
                p.strikes = 0
                return out
            except urllib.error.HTTPError as e:
                p.fail += 1
                # Most 429s here are per-minute limits, not spent day quotas -- Groq allows a
                # burst then refuses for the rest of the minute. Parking for 15 minutes threw
                # away a provider that would have been usable again in seconds, so back off
                # briefly and lengthen it only if the same provider keeps refusing.
                if e.code == 429:
                    p.strikes = getattr(p, "strikes", 0) + 1
                    p.park(min(90 * p.strikes, 1800))
                else:
                    p.park(30)
            except Exception:
                p.fail += 1
                p.park(20)
        return None

    def report(self):
        return "  ".join(f"{p.name}={p.ok}/{p.ok + p.fail}" for p in self.providers)
