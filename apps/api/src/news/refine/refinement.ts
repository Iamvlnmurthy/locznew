/**
 * News refinement — regenerate a source article into LocZ's OWN summary in a target language,
 * lazily and cached (once per event × language). This is where the "modern Telugu, not literary"
 * requirement and the free-tier provider strategy live.
 *
 * Provider-abstracted (local Ollama default; cloud Groq/Cerebras/Gemini as fast fallback / for
 * Indic quality). The prompt-building, language table, cache key and fallback ordering are pure and
 * tested; the HTTP provider implementations plug into the `RefinementProvider` interface.
 */

export interface LanguageSpec {
  code: string;
  name: string;
  /** Register guidance so output is contemporary newsroom language, not formal/literary. */
  register: string;
}

/**
 * The register notes are the fix for "very old Telugu": ask for the everyday, spoken language a
 * TV-news anchor uses today, explicitly rejecting archaic/literary forms.
 */
export const LANGUAGES: Record<string, LanguageSpec> = {
  en: { code: 'en', name: 'English', register: 'clear, plain, modern news English' },
  te: {
    code: 'te',
    name: 'Telugu',
    register:
      'modern, everyday spoken Telugu as used on today’s TV news channels — NOT old, literary, or ' +
      'grandhika Telugu. Use common contemporary words people actually speak; keep it simple and natural.',
  },
  hi: {
    code: 'hi',
    name: 'Hindi',
    register: 'modern conversational Hindi as used on TV news, not literary Hindi',
  },
  ta: {
    code: 'ta',
    name: 'Tamil',
    register: 'modern spoken Tamil as used on TV news, not literary Tamil',
  },
  kn: { code: 'kn', name: 'Kannada', register: 'modern spoken Kannada as used on TV news' },
  ml: { code: 'ml', name: 'Malayalam', register: 'modern spoken Malayalam as used on TV news' },
  mr: { code: 'mr', name: 'Marathi', register: 'modern spoken Marathi as used on TV news' },
  bn: { code: 'bn', name: 'Bengali', register: 'modern spoken Bengali as used on TV news' },
  gu: { code: 'gu', name: 'Gujarati', register: 'modern spoken Gujarati as used on TV news' },
  pa: { code: 'pa', name: 'Punjabi', register: 'modern spoken Punjabi as used on TV news' },
  or: { code: 'or', name: 'Odia', register: 'modern spoken Odia as used on TV news' },
  as: { code: 'as', name: 'Assamese', register: 'modern spoken Assamese as used on TV news' },
  ur: { code: 'ur', name: 'Urdu', register: 'modern spoken Urdu as used on TV news' },
};

export interface RefineInput {
  /** The article body (or best available text) — NEVER just the headline, or the model will pad. */
  body: string;
  targetLang: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * Build the chat messages for a faithful, modern-language regeneration. The model must use only
 * facts in the body, write in the target language's contemporary register, and return strict JSON.
 */
export function buildRefineMessages(input: RefineInput): ChatMessage[] {
  const lang = LANGUAGES[input.targetLang] ?? LANGUAGES.en!;
  return [
    {
      role: 'system',
      content:
        'You are a LocZ hyperlocal news editor for India. Rewrite the SOURCE into LocZ’s OWN words. ' +
        'Report ONLY facts stated in the SOURCE — never invent names, numbers, causes, or places. ' +
        `Write the title and summary in ${lang.name}: ${lang.register}`,
    },
    {
      role: 'user',
      content:
        `SOURCE:\n${input.body}\n\n` +
        `Write in ${lang.name} only. Return strict JSON: ` +
        '{"title": short news headline, "summary": 2-3 sentence factual summary}',
    },
  ];
}

/** Cache key so an event is refined once per language and reused for every later viewer. */
export function refineCacheKey(eventId: string, lang: string): string {
  return `news:refine:${eventId}:${lang}`;
}

export interface RefineResult {
  title: string;
  summary: string;
  provider: string;
}

export interface RefinementProvider {
  name: string;
  /** Returns null on failure (rate-limit, timeout, bad output) so the orchestrator can fall back. */
  refine(messages: ChatMessage[]): Promise<{ title: string; summary: string } | null>;
}

/**
 * Try providers in order until one returns a usable result. Order encodes the free-tier strategy:
 * local Ollama first (free, unlimited) for bulk, cloud (Groq/Cerebras/Gemini) as fast/quality
 * fallback. Returns null only if every provider fails.
 */
export async function refineWithFallback(
  providers: RefinementProvider[],
  input: RefineInput,
): Promise<RefineResult | null> {
  const messages = buildRefineMessages(input);
  for (const p of providers) {
    try {
      const out = await p.refine(messages);
      if (out && out.title?.trim() && out.summary?.trim()) {
        return { title: out.title.trim(), summary: out.summary.trim(), provider: p.name };
      }
    } catch {
      // fall through to the next provider
    }
  }
  return null;
}

/**
 * Which languages to PROACTIVELY pre-translate for a region (the rest are on-demand + cached).
 * Keeps cost bounded: a Telangana event is pre-done in te/en/hi/ur, not all 13 languages.
 */
export function proactiveLanguagesForState(stateName: string | null | undefined): string[] {
  const s = (stateName ?? '').toLowerCase();
  const base = ['en'];
  const map: Array<[RegExp, string[]]> = [
    [/telangana|andhra/, ['te', 'hi', 'ur']],
    [/tamil/, ['ta']],
    [/karnataka/, ['kn']],
    [/kerala/, ['ml']],
    [/maharashtra/, ['mr', 'hi']],
    [/west bengal|bengal/, ['bn', 'hi']],
    [/gujarat/, ['gu', 'hi']],
    [/punjab/, ['pa', 'hi']],
    [/odisha/, ['or']],
    [/assam/, ['as']],
    [/uttar pradesh|bihar|madhya pradesh|rajasthan|haryana|delhi|jharkhand|uttarakhand/, ['hi']],
  ];
  for (const [re, langs] of map) if (re.test(s)) return [...new Set([...base, ...langs])];
  return [...new Set([...base, 'hi'])];
}
