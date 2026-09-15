// Expand test files in Node (Windows cmd.exe does not expand shell globs).
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).sort().map(n=>path.join(root,'tests',n));
if(!files.length)throw new Error('No test files found.');
const result=cp.spawnSync(process.execPath,['--test',...files],{stdio:'inherit',cwd:root});
if(result.error)throw result.error;process.exit(result.status??1);
