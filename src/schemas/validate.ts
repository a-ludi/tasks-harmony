import Ajv from 'ajv';
import appStateSchema from './appState.schema.json';
import packManifestSchema from './packManifest.schema.json';
import choreDefinitionSchema from './choreDefinition.schema.json';

const ajv = new Ajv({ allErrors: true });

const validateAppStateFn = ajv.compile(appStateSchema);
const validatePackManifestFn = ajv.compile(packManifestSchema);
const validateChoreDefinitionFn = ajv.compile(choreDefinitionSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function toResult(fn: ReturnType<typeof ajv.compile>, data: unknown): ValidationResult {
  const valid = fn(data) as boolean;
  return {
    valid,
    errors: valid ? [] : (fn.errors ?? []).map((e) => `${e.instancePath} ${e.message}`),
  };
}

export const validateAppState = (data: unknown): ValidationResult => toResult(validateAppStateFn, data);
export const validatePackManifest = (data: unknown): ValidationResult => toResult(validatePackManifestFn, data);
export const validateChoreDefinition = (data: unknown): ValidationResult => toResult(validateChoreDefinitionFn, data);
