/**
 * Per-million-token prices for the models Claude Code can run.
 *
 * Verified against Anthropic's published first-party API rates, 2026-09-20.
 * These are Anthropic API rates -- Bedrock and Vertex are partner-operated and
 * priced separately, so a session run through those will be reported wrong.
 *
 * Cache rates follow the standard multipliers (write = 1.25x input,
 * read = 0.1x input) except where Anthropic publishes a flat rate, which is
 * why Fable 5.1 carries an explicit $0.25 cache read rather than $1.00.
 */

export interface ModelPricing {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

/**
 * Keyed by exact model id. Resolution is longest-prefix, so a dated snapshot
 * such as `claude-opus-4-5-20251101` still matches `claude-opus-4-5`.
 *
 * Order does not matter -- the resolver sorts by key length.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Current generation
  'claude-fable-5-1': { input: 10, output: 50, cacheCreation: 12.5, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheCreation: 12.5, cacheRead: 1.0 },
  'claude-opus-5': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheCreation: 2.5, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 },

  // Previous generations, still readable in old transcripts
  'claude-opus-4-5': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-1': { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  'claude-opus-4': { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-haiku-4': { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 },
  'claude-3-7-sonnet': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-3-5-sonnet': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-3-5-haiku': { input: 0.8, output: 4, cacheCreation: 1, cacheRead: 0.08 },
  'claude-3-opus': { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  'claude-3-haiku': { input: 0.25, output: 1.25, cacheCreation: 0.3, cacheRead: 0.03 }
}

/**
 * Tier fallbacks for a model id we have never seen -- a release newer than this
 * build. Anchored on the current generation, so an unrecognised `opus` lands on
 * Opus 5 rates rather than Opus 3's, which were three times higher and made
 * every Opus session in the dashboard read 3x its real cost.
 */
const TIER_FALLBACK: Array<{ match: RegExp; id: string }> = [
  { match: /fable|mythos/, id: 'claude-fable-5-1' },
  { match: /opus/, id: 'claude-opus-5' },
  { match: /haiku/, id: 'claude-haiku-4-5' },
  { match: /sonnet/, id: 'claude-sonnet-5' }
]

const PRICING_KEYS_BY_LENGTH = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length)

export type PricingConfidence = 'exact' | 'tier' | 'unknown'

export interface ResolvedPricing extends ModelPricing {
  /**
   * How the rate was arrived at. Anything other than `exact` means the cost
   * shown is an estimate -- surface it rather than presenting a guess as fact.
   */
  confidence: PricingConfidence
  /** The pricing entry actually used, for display. */
  matchedModel: string
}

export function resolveModelPricing(model: string | undefined | null): ResolvedPricing {
  const normalized = (model ?? '').toLowerCase().trim()

  for (const key of PRICING_KEYS_BY_LENGTH) {
    if (normalized.startsWith(key)) {
      return { ...MODEL_PRICING[key], confidence: 'exact', matchedModel: key }
    }
  }

  for (const { match, id } of TIER_FALLBACK) {
    if (match.test(normalized)) {
      return { ...MODEL_PRICING[id], confidence: 'tier', matchedModel: id }
    }
  }

  // Not a Claude model at all, or an empty field. Sonnet is the middle of the
  // range, so it is the least wrong default -- but say so.
  return { ...MODEL_PRICING['claude-sonnet-5'], confidence: 'unknown', matchedModel: 'claude-sonnet-5' }
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheCreationInputTokens: number,
  cacheReadInputTokens: number,
  model: string
): number {
  const pricing = resolveModelPricing(model)

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheCreationInputTokens / 1_000_000) * pricing.cacheCreation +
    (cacheReadInputTokens / 1_000_000) * pricing.cacheRead
  )
}
