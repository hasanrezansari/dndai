# Vertex AI (GCP) integration — backlog

**Intent:** Use Google Cloud billing (e.g. $300 trial credits) via **Vertex AI** for LLM and/or image generation, without relying on OpenRouter for everything.

**Status:** Not started — no Vertex code paths in the repo today.

## Current behavior (audit summary)

- **Text / structured JSON:** [`getAIProvider()`](../src/lib/ai/index.ts) — `openrouter` | `gemini` (API key → `generativelanguage.googleapis.com`) | `openai` | `anthropic` | `mock`.
- **Fallback chain:** If `OPENROUTER_API_KEY` is set, OpenRouter is often **first** in the chain even when `AI_PROVIDER=gemini`. Use **`AI_PROVIDER_STRICT=1`** or **unset `OPENROUTER_API_KEY`** when switching primary provider.
- **Scene images:** [`image-worker.ts`](../src/lib/orchestrator/image-worker.ts) — **OpenRouter first**, then **fal.ai** (`FAL_KEY`) on failure. Does **not** read `AI_PROVIDER`.
- **Portraits:** [`characters/portrait/route.ts`](../src/app/api/characters/portrait/route.ts), [`profile/heroes/.../portrait/route.ts`](../src/app/api/profile/heroes/[id]/portrait/route.ts) — **OpenRouter only**.

## What Vertex integration would add

1. **GCP project:** Enable Vertex AI APIs; **service account** with least-privilege IAM; **region** (e.g. `us-central1`).
2. **Secrets (e.g. Vercel):** Service account JSON (or supported alternative), `GCP_PROJECT_ID`, `GCP_REGION` — never commit keys.
3. **Text provider (optional):** New `VertexGeminiProvider` (or extend [`gemini-provider.ts`](../src/lib/ai/gemini-provider.ts)) calling **Vertex** `generateContent`, wired into `getAIProvider()` / [`FallbackProvider`](../src/lib/ai/fallback-provider.ts).
4. **Images (high value for credits runway):** New module (e.g. `vertex-imagen-provider.ts` or Vertex Gemini image API) returning **base64 or GCS URL**, then branch in `image-worker` + portrait routes behind **`IMAGE_PROVIDER=vertex`** (or similar).
5. **Rollout:** Ship **alongside** existing paths; toggle via env; only remove OpenRouter/fal primary after staging validation.

## Risks / notes

- **Not env-only:** Different auth and endpoints than `GEMINI_API_KEY` + Generative Language API.
- **Output parity:** Models differ; prompts may need light tuning.
- **Pricing:** Confirm current **Vertex** image + token pricing in Cloud console / pricing calculator for budget.

## References

- Prior discussion: OpenRouter vs Gemini vs Vertex (orchestrator vs image paths).
- Optional later: wire [`freepik-provider.ts`](../src/lib/ai/freepik-provider.ts) into `image-worker` (currently unused).
