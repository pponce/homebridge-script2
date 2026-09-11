'use strict';
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
for (const directory of ['lib','homebridge-ui','test','scripts']) {
  for (const file of fs.readdirSync(directory,{recursive:true})) if (/\.(js|cjs)$/.test(file)) execFileSync(process.execPath,['--check',`${directory}/${file}`]);
}
execFileSync(process.execPath,['--check','index.js']);
require('./check-schema.cjs')();
console.log('Source syntax and configuration JSON Schema validation passed.');
