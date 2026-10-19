// Minimal JSON Schema (2020-12 subset) validator for the site tests. No dependencies.
// Supports exactly the keywords used by schema/run_summary.schema.json and throws on any other keyword.
const ANNOTATIONS = new Set(["$schema", "$id", "title", "description", "default", "examples"]);
const KNOWN = new Set([
  "type", "const", "enum", "pattern", "minLength", "minimum", "format",
  "required", "properties", "additionalProperties", "items", "anyOf", "oneOf",
]);

function typeOk(value, type) {
  switch (type) {
    case "null": return value === null;
    case "string": return typeof value === "string";
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    default: throw new Error(`unsupported type ${type}`);
  }
}

export function validate(schema, value, at = "$") {
  const errors = [];
  for (const key of Object.keys(schema)) {
    if (!ANNOTATIONS.has(key) && !KNOWN.has(key)) throw new Error(`${at}: unsupported keyword ${key}`);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) {
      errors.push(`${at}: expected ${types.join("|")}`);
      return errors;
    }
  }
  if ("const" in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${at}: const`);
  if (schema.enum && !schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(value))) errors.push(`${at}: enum`);
  if (typeof value === "string") {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${at}: pattern`);
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${at}: minLength`);
    if (schema.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${at}: format date`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: minimum`);
  if (typeOk(value, "object")) {
    for (const name of schema.required || []) {
      if (!Object.hasOwn(value, name)) errors.push(`${at}: missing ${name}`);
    }
    const props = schema.properties || {};
    for (const [name, child] of Object.entries(value)) {
      if (Object.hasOwn(props, name)) errors.push(...validate(props[name], child, `${at}.${name}`));
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected ${name}`);
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => errors.push(...validate(schema.items, item, `${at}[${i}]`)));
  }
  if (schema.anyOf && !schema.anyOf.some((s) => validate(s, value, at).length === 0)) errors.push(`${at}: anyOf`);
  if (schema.oneOf && schema.oneOf.filter((s) => validate(s, value, at).length === 0).length !== 1) errors.push(`${at}: oneOf`);
  return errors;
}
