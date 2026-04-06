/**
 * Spark costs — single source for economy service ([`spark-economy-service`](../server/services/spark-economy-service.ts)).
 * Tune against measured COGS (see docs/MONETIZATION_IMPLEMENTATION_PLAN.md §8).
 */
export const SPARK_COST_AI_TEXT_TURN = 1;

/** Campaign session start: seeder + opening (single debit covers bundled AI + async opening image). */
export const SPARK_COST_CAMPAIGN_SESSION_START = 5;

/** Standalone image pipeline invocation (session image API, party round image, etc.). */
export const SPARK_COST_SCENE_IMAGE = 5;

/** Party vote-judge worker (light AI). */
export const SPARK_COST_PARTY_JUDGE = 1;

/** Party round opener worker (scene beat text). */
export const SPARK_COST_PARTY_ROUND_OPENER = 2;

export const SPARK_COST_CUSTOM_CLASS_GENERATION = 2;

export const SPARK_COST_PORTRAIT_GENERATION = 5;

export const SPARK_COST_EXTRA_HERO_SLOT = 10;
