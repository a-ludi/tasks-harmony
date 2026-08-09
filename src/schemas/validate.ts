import { z } from 'zod';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const xpSizeEnum = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;
const xpSizeSchema = z.union([z.enum(xpSizeEnum), z.number()]);
const duePeriodUnitEnum = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;

const duePeriodSchema = z.object({
  value: z.number().min(0),
  unit: z.enum(duePeriodUnitEnum),
}).strict();

// --- packManifest.schema.json ---
const packManifestZodSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  license: z.string().optional(),
  description: z.string().optional(),
  revision: z.string().optional(),
  revisionHistory: z.string().optional(),
  cdpCreatedAt: z.string().optional(),
  chores: z.array(z.string().regex(/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*\.yaml$/)).optional(),
  createdAt: z.string().optional(),
  streak: z.boolean().optional(),
  xpTarget: z.number().min(0).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  allowShiftOnImport: z.boolean().optional(),
}).strict();

// --- choreDefinition.schema.json ---
const enumChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  order: z.number().int(),
}).strict();

const cdpQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['TEXT', 'INTEGER', 'BOOLEAN', 'ENUM', 'MULTIPLIER']),
  prompt: z.string().min(1),
  required: z.boolean(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
  regexPattern: z.string().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  choices: z.array(enumChoiceSchema).optional(),
  xpPerUnit: z.number().optional(),
  multiplierAnswerType: z.enum(['integer', 'float']).optional(),
}).strict();

const choreDefinitionZodSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  xpSize: z.enum(xpSizeEnum),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1),
  windowStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  repeatable: z.boolean().optional(),
  questions: z.array(cdpQuestionSchema).optional(),
  duePeriod: duePeriodSchema.optional(),
}).strict();

// --- appState.schema.json ---
// Manifest inside AppState includes user-only fields absent from packManifest.schema.json
const appStateManifestSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  license: z.string().optional(),
  description: z.string().optional(),
  revision: z.string().optional(),
  revisionHistory: z.string().optional(),
  cdpCreatedAt: z.string().optional(),
  chores: z.array(z.string().regex(/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*\.yaml$/)).optional(),
  createdAt: z.string().optional(),
  streak: z.boolean().optional(),
  xpTarget: z.number().min(0).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  allowShiftOnImport: z.boolean().optional(),
  decay: z.boolean().optional(),
  defaultXPSize: xpSizeSchema.optional(),
}).strict();

const packSchema = z.object({
  id: z.string(),
  manifest: appStateManifestSchema,
  isPersonal: z.boolean(),
  importedAt: z.string(),
  updatedAt: z.string(),
  sourceUrl: z.string().regex(/^https:\/\//).optional(),
  aliasFor: z.string().optional(),
}).strict();

const choreSchema = z.object({
  key: z.string(),
  choreId: z.string(),
  packId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  xpSize: xpSizeSchema,
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1),
    startDate: z.string(),
    windowStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).strict(),
  repeatable: z.boolean(),
  active: z.boolean(),
  duePeriod: duePeriodSchema.optional(),
  createdAt: z.string(),
  syncStatus: z.enum(['in-sync', 'out-of-sync']).optional(),
  completionBonusXPSize: xpSizeSchema.optional(),
}).strict();

const stateQuestionSchema = z.object({
  id: z.string(),
  choreKey: z.string(),
  type: z.enum(['TEXT', 'INTEGER', 'BOOLEAN', 'ENUM', 'MULTIPLIER']),
  prompt: z.string(),
  required: z.boolean(),
  order: z.number().int(),
  active: z.boolean().optional(),
  regexPattern: z.string().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  choices: z.array(z.unknown()).optional(),
  xpPerUnit: z.number().optional(),
  multiplierAnswerType: z.enum(['integer', 'float']).optional(),
}).strict();

const answerSchema = z.object({
  questionId: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
}).strict();

const targetSchema = z.object({
  id: z.string(),
  choreKey: z.string(),
  order: z.number().int(),
  answers: z.array(answerSchema),
}).strict();

const completionSchema = z.object({
  id: z.string(),
  choreKey: z.string(),
  completedAt: z.string(),
  xpEarned: z.number(),
  streak: z.number(),
  answers: z.array(answerSchema),
  targetId: z.string().optional(),
  setCompletionBonus: z.number().optional(),
}).strict();

const xpSettingsSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxStreakMultiplier: z.number(),
  decayFloor: z.number(),
  streakHalfLife: z.number(),
  decayHalfLife: z.number(),
}).strict();

const profileSchema = z.object({
  id: z.literal('me'),
  displayName: z.string(),
  email: z.string(),
  activeXPSettingsId: z.string(),
}).strict();

const syncStateSchema = z.object({
  id: z.literal('main'),
  pendingSync: z.boolean(),
  lastSyncedAt: z.string().optional(),
}).strict();

const quickAnswerSetSchema = z.object({
  id: z.string(),
  choreKey: z.string(),
  label: z.string(),
  answers: z.array(answerSchema),
}).strict();

const appStateZodSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  packs: z.array(packSchema),
  chores: z.array(choreSchema),
  questions: z.array(stateQuestionSchema),
  completions: z.array(completionSchema),
  xpSettings: z.array(xpSettingsSchema),
  profile: profileSchema,
  syncState: syncStateSchema,
  quickAnswerSets: z.array(quickAnswerSetSchema).optional(),
  targets: z.array(targetSchema).optional(),
}).strict();

function toResult(schema: z.ZodTypeAny, data: unknown): ValidationResult {
  const result = schema.safeParse(data);
  if (result.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
  };
}

export const validateAppState = (data: unknown): ValidationResult => toResult(appStateZodSchema, data);
export const validatePackManifest = (data: unknown): ValidationResult => toResult(packManifestZodSchema, data);
export const validateChoreDefinition = (data: unknown): ValidationResult => toResult(choreDefinitionZodSchema, data);
