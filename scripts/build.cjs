// Deterministic, dependency-free single-file release. Does not run on site load.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'src/page.html'),'utf8');
const parts={STYLES:['styles.css','style'],OPTICS:['optics.js','script'],CAMERA_SPEC:['camera-spec.js','script'],APP:['app.js','script']};
for(const [token,[name,tag]] of Object.entries(parts)){
 const content=fs.readFileSync(path.join(root,'src',name),'utf8');
 const marker='{{'+token+'}}';
 if(!html.includes(marker))throw new Error('Missing template marker '+marker);
 html=html.replace(marker,()=>`<${tag}>\n${content}</${tag}>`);
}
if(/\{\{(?:STYLES|OPTICS|CAMERA_SPEC|APP)\}\}/.test(html))throw new Error('Unexpanded build token');
const dest=path.join(root,'index.html');
if(process.argv.includes('--check')){
 if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==html){console.error('index.html differs from src. Run npm run build.');process.exitCode=1;}
 else console.log('PASS: index.html is an exact deterministic build of src.');
}else {fs.writeFileSync(dest,html);console.log(`Built index.html (${Buffer.byteLength(html)} bytes).`);}
