'use strict';
const Ajv = require('ajv');
const schema = require('../config.schema.json').schema;

// Homebridge includes presentation annotations such as expandable and form.
// Allow those keywords, but keep standard JSON Schema meta-validation enabled.
function compileSchema(candidate = schema) {
  return new Ajv({ strict: false, allErrors: true }).compile(candidate);
}

module.exports = compileSchema;
if (require.main === module) {
  compileSchema();
  console.log('Configuration schema passes JSON Schema validation.');
}
