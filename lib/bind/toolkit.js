/**
 * A tiny dependency-free tool toolkit.
 *
 * A profile plugin is loaded by plain Node resolution, so it may not import
 * `@deepseek-ai/dsh-tools` (those specifiers only resolve inside the DSH
 * installation). This module produces the exact `ToolDefinition` shape the
 * registry demands while keeping the plugin's imports to `node:*` and its own
 * files.
 *
 * @module dsh-aoci-bind/toolkit
 */

/**
 * Build one registry-ready tool definition with strict argument validation.
 * @param {object} options - tool definition.
 * @returns {object} the registry-ready definition.
 */
export function defineTool(options) {
  if (typeof options?.name !== 'string' || options.name === '') throw new Error('tool definition needs a non-empty name');
  if (typeof options.description !== 'string' || options.description === '') {
    throw new Error(`tool "${options.name}" needs a description`);
  }
  if (options.output === undefined || typeof options.output.render !== 'function') {
    throw new Error(`tool "${options.name}" must declare output.render`);
  }
  if (options.output.schema === undefined) throw new Error(`tool "${options.name}" must declare output.schema`);
  const parameters = options.parameters ?? { type: 'object', additionalProperties: false, properties: {} };
  return {
    name: options.name,
    description: options.description,
    parameters,
    output: {
      schema: options.output.schema,
      render: (args, value) => options.output.render(args, value),
    },
    async execute(args, exec) {
      const violations = validateArgs(parameters, args);
      if (violations.length > 0) throw new Error(`invalid arguments: ${violations.join('; ')}`);
      // Project before the registry validates: an undeclared field would fail
      // the call *after* the body already ran, turning a schema drift into a
      // reported failure with a live side effect.
      return projectToSchema(await options.execute(args, exec), options.output.schema);
    },
  };
}

/** Keep only the fields the declared output schema describes. */
export function projectToSchema(value, schema) {
  if (value === undefined || value === null) return value;
  if (schema?.type === 'array' && Array.isArray(value)) {
    if (schema.items === undefined) return value;
    return value.map((item) => projectToSchema(item, schema.items));
  }
  if (schema?.type === 'object' && isPlainObject(value) && isPlainObject(schema.properties)) {
    const projected = {};
    for (const key of Object.keys(schema.properties)) {
      const item = value[key];
      if (item === undefined || item === null) continue;
      projected[key] = projectToSchema(item, schema.properties[key]);
    }
    return projected;
  }
  return value;
}

/** Validate model-supplied arguments against a raw JSON Schema subset. */
export function validateArgs(schema, args, root = '') {
  if (!isPlainObject(args)) return [`${root === '' ? 'arguments' : `"${root.replace(/\.$/, '')}"`} must be a JSON object`];
  const properties = isPlainObject(schema?.properties) ? schema.properties : {};
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const violations = [];
  for (const key of required) {
    if (!Object.hasOwn(args, key) || args[key] === undefined) violations.push(`missing required property "${root}${key}"`);
  }
  if (schema?.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!Object.hasOwn(properties, key)) violations.push(`"${root}${key}" is not a declared property`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    const spec = properties[key];
    if (spec === undefined || value === undefined) continue;
    violations.push(...checkValue(spec, value, `${root}${key}`));
  }
  return violations;
}

/** Validate one value against one schema node. */
function checkValue(spec, value, path) {
  const violations = [];
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') return [`"${path}" must be a string`];
      break;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return [`"${path}" must be an integer`];
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return [`"${path}" must be a finite number`];
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return [`"${path}" must be a boolean`];
      break;
    case 'array':
      if (!Array.isArray(value)) return [`"${path}" must be an array`];
      if (spec.items !== undefined) {
        for (let index = 0; index < value.length; index += 1) {
          violations.push(...checkValue(spec.items, value[index], `${path}[${index}]`));
        }
      }
      return violations;
    case 'object':
      return validateArgs(spec, value, `${path}.`);
    default:
      break;
  }
  if (Array.isArray(spec.enum) && !spec.enum.includes(value)) {
    violations.push(`"${path}" must be one of ${JSON.stringify(spec.enum)}`);
  }
  if (Object.hasOwn(spec, 'const') && value !== spec.const) {
    violations.push(`"${path}" must be ${JSON.stringify(spec.const)}`);
  }
  return violations;
}

/** Whether a value is a plain JSON object (not an array, not null). */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
