import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { RedisService } from '../../redis/redis.service';
import { GeminiProvider, OllamaProvider, OpenAiCompatProvider } from './providers';
import { refineCacheKey, refineWithFallback, type RefinementProvider } from './refinement';

/**
 * Lazy, cached news refinement: turn a source article into LocZ's OWN summary in a target language,
 * once per (event × language), reused for every later viewer. Provider fallback encodes the
 * free-tier strategy: Gemini (best Telugu) → Groq → Cerebras → local Ollama (dev only). Cached in
 * Redis for the retention window; a cache miss refines on view. Everything is gated on config —
 * with no keys it is a no-op and the feed shows the raw event summary.
 */
@Injectable()
export class NewsRefineService {
  private readonly logger = new Logger(NewsRefineService.name);
  private readonly providers: RefinementProvider[];
  private static readonly CACHE_TTL = 8 * 24 * 3600; // just over the 7-day retention window

  constructor(
    private readonly config: AppConfig,
    private readonly redis: RedisService,
  ) {
    this.providers = this.buildProviders();
    this.logger.log(
      this.providers.length
        ? `News refinement providers: ${this.providers.map((p) => p.name).join(', ')}`
        : 'News refinement disabled (no provider configured) — feed shows raw summaries',
    );
  }

  get enabled(): boolean {
    return this.providers.length > 0;
  }

  private buildProviders(): RefinementProvider[] {
    const out: RefinementProvider[] = [];
    const gemini = this.config.get('GEMINI_API_KEY')?.trim();
    if (gemini) out.push(new GeminiProvider(gemini));
    const groq = this.config.get('GROQ_API_KEY')?.trim();
    if (groq)
      out.push(
        new OpenAiCompatProvider(
          'groq',
          'https://api.groq.com/openai/v1',
          groq,
          'qwen/qwen3.6-27b',
        ),
      );
    const cerebras = this.config.get('CEREBRAS_API_KEY')?.trim();
    if (cerebras)
      out.push(
        new OpenAiCompatProvider(
          'cerebras',
          'https://api.cerebras.ai/v1',
          cerebras,
          'gpt-oss-120b',
        ),
      );
    const ollama = this.config.get('NEWS_OLLAMA_URL')?.trim();
    if (ollama) out.push(new OllamaProvider(ollama));
    return out;
  }

  /**
   * Refined {title, summary} for one event in a language, from cache or freshly generated. Returns
   * null when refinement is off or every provider fails (caller keeps the raw summary).
   */
  async refine(
    eventId: string,
    lang: string,
    sourceText: string,
  ): Promise<{ title: string; summary: string } | null> {
    if (!this.enabled || !sourceText.trim()) return null;
    const key = refineCacheKey(eventId, lang);

    const cached = await this.redis.getJson<{ title: string; summary: string }>(key);
    if (cached) return cached;

    const result = await refineWithFallback(this.providers, { body: sourceText, targetLang: lang });
    if (!result) return null;

    const value = { title: result.title, summary: result.summary };
    await this.redis.setJson(key, value, NewsRefineService.CACHE_TTL);
    return value;
  }
}
