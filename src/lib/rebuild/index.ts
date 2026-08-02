export {
  REBUILD_SPEC_SCHEMA_VERSION,
  RebuildSpecSchema,
  parseRebuildSpec,
  safeParseRebuildSpec,
  stableStringify,
  type RebuildSpec,
  type ColorRole,
  type LayoutRole,
  type GapCategory,
} from "./spec";

export { blueprintToRebuildSpec } from "./mapper";

export {
  COMPLETENESS_WEIGHTS,
  assertWeightsSum100,
  scoreRebuildSpec,
  type CompletenessReport,
  type CompletenessWeight,
  type CompletenessWeightId,
} from "./completeness";

export {
  buildRebuildPrompt,
  buildAllRebuildPrompts,
  generateTailwindFromSpec,
  type RebuildStack,
  type RebuildPrompt,
} from "./prompts";
