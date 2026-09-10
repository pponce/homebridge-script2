'use strict';
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const pack=JSON.parse(execFileSync('npm',['pack','--dry-run','--ignore-scripts','--json'],{encoding:'utf8'}))[0];
const files=new Set(pack.files.map(f=>f.path));
for(const file of ['index.js','lib/safety.js','homebridge-ui/server.js','homebridge-ui/public/index.html','homebridge-ui/public/index.js','homebridge-ui/public/validation.js','homebridge-ui/public/config-utils.js','homebridge-ui/public/style.css','config.schema.json','README.md','MIGRATION.md','CHANGELOG.md','LICENSE','assets/homebridge-script2-icon.png']) assert.ok(files.has(file),`Missing ${file}`);
for(const file of files) assert.ok(!/^(test|scripts|releases|\.github)\//.test(file),`Unnecessary packaged file ${file}`);
console.log(`Package content verified: ${files.size} files.`);
