/** Dependency-free validation of the checked-in contract schemas. */
import { schemaPath, readJson } from "./project.mjs";

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some((entry) => matchesType(value, entry));
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object")
    return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function inspect(value, schema, root, location, errors) {
  if (schema.$ref) {
    const ref = schema.$ref
      .split("/")
      .slice(1)
      .reduce((node, key) => node[key], root);
    inspect(value, ref, root, location, errors);
    return;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${location}: type`);
    return;
  }
  if ("const" in schema && value !== schema.const) errors.push(`${location}: const`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${location}: enum`);
  for (const key of ["anyOf", "oneOf"]) {
    if (!schema[key]) continue;
    const matches = schema[key].filter((branch) => {
      const issues = [];
      inspect(value, branch, root, location, issues);
      return issues.length === 0;
    }).length;
    if (matches === 0 || (key === "oneOf" && matches !== 1)) errors.push(`${location}: ${key}`);
  }
  for (const branch of schema.allOf ?? []) inspect(value, branch, root, location, errors);
  if (schema.if) {
    const issues = [];
    inspect(value, schema.if, root, location, issues);
    if (issues.length === 0 && schema.then) inspect(value, schema.then, root, location, errors);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}: maximum`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
      errors.push(`${location}: exclusiveMinimum`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${location}: minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      errors.push(`${location}: maxLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errors.push(`${location}: pattern`);
    if (
      schema.format === "date-time" &&
      (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
    )
      errors.push(`${location}: date-time`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${location}: minItems`);
    if (schema.items)
      value.forEach((item, index) =>
        inspect(item, schema.items, root, `${location}[${index}]`, errors),
      );
  } else if (value !== null && typeof value === "object") {
    for (const key of schema.required ?? [])
      if (!(key in value)) errors.push(`${location}.${key}: required`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key])
        inspect(item, schema.properties[key], root, `${location}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${location}.${key}: unexpected`);
    }
  }
}

export function validateSchema(name, value) {
  const schema = readJson(schemaPath(name));
  const errors = [];
  inspect(value, schema, schema, "$", errors);
  return { ok: errors.length === 0, errors };
}
export const validateManifestFull = (value) => validateSchema("manifest.schema.json", value);
export const validateLearningSpecFull = (value) =>
  validateSchema("learning_spec.schema.json", value);
export const validateManifest = validateManifestFull;
export const validateLearningSpec = validateLearningSpecFull;
export { readJson };
