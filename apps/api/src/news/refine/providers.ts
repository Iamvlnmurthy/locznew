import type { ChatMessage, RefinementProvider } from './refinement';

/** Parse a model's JSON string into {title, summary}, tolerating minor noise. Null on failure. */
function parseJson(text: string | undefined | null): { title: string; summary: string } | null {
  if (!text) return null;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const obj = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text) as {
      title?: string;
      summary?: string;
    };
    if (obj.title && obj.summary) return { title: String(obj.title), summary: String(obj.summary) };
  } catch {
    /* fall through */
  }
  return null;
}

/** Google Gemini (AI Studio). Best Indic quality per our A/B — first choice for Telugu. */
export class GeminiProvider implements RefinementProvider {
  readonly name: string;
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gemini-2.5-flash',
  ) {
    this.name = `gemini:${this.model}`;
  }
  async refine(messages: ChatMessage[]) {
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const user = messages.find((m) => m.role === 'user')?.content ?? '';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return parseJson(j.candidates?.[0]?.content?.parts?.[0]?.text);
  }
}

/** OpenAI-compatible chat endpoint — used for Groq and Cerebras. */
export class OpenAiCompatProvider implements RefinementProvider {
  readonly name: string;
  constructor(
    label: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.name = `${label}:${model}`;
  }
  async refine(messages: ChatMessage[]) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseJson(j.choices?.[0]?.message?.content);
  }
}

/** Local Ollama — free/unlimited, but only where a GPU box is reachable (dev machine, not the VPS). */
export class OllamaProvider implements RefinementProvider {
  readonly name: string;
  constructor(
    private readonly url: string,
    private readonly model = 'gemma2:9b',
  ) {
    this.name = `ollama:${this.model}`;
  }
  async refine(messages: ChatMessage[]) {
    const res = await fetch(`${this.url.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { message?: { content?: string } };
    return parseJson(j.message?.content);
  }
}
