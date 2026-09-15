const test=require('node:test'),assert=require('node:assert/strict'),CS=require('../src/camera-spec.js');
for(const [id,expected] of Object.entries({GC4653:{nx:2560,ny:1440,pitch:2,f:3.05},OS04A10:{nx:2688,ny:1520,pitch:2.9,f:4.9}})){
 test(`${id} preset preserves the source values`,()=>{const p=CS.parse(CS.presets[id]);assert.deepEqual(p.fields,expected);assert.deepEqual(p.warnings,[]);assert.equal(p.model,id);assert.equal(CS.validate(p.fields).length,0);});
}
test('reference metadata is preserved, not used to fill missing geometry',()=>{
 const p=CS.parse('尺寸：1/1.79"\n镜头光圈：F1.65\n镜头畸变：25%\n视场角：D100 H87 V49\n最长曝光：45s');assert.deepEqual(p.fields,{});assert.equal(p.metadata.exposure,'45s');assert.equal(p.metadata.distortion,'25%');
});
test('μ and µ, full width digits and English unit labels',()=>{
 const p=CS.parse('Resolution: ２６８８×１５２０\nPixel pitch (µm): 2.9\nFocal length (mm): 4.9');assert.deepEqual(p.fields,{nx:2688,ny:1520,pitch:2.9,f:4.9});
});
test('traditional Chinese labels',()=>{
 const p=CS.parse('型號：Cam\n解析度：1920x1080\n像素間距：3.0微米\n鏡頭焦距：4.8毫米');assert.deepEqual(p.fields,{nx:1920,ny:1080,pitch:3,f:4.8});
});
test('units can be on table headers',()=>{
 const p=CS.parse('型号 | A | B\n分辨率 | 1280x720 | 1920x1080\nPixel pitch (um) | 2 | 3\nFocal length (mm) | 4 | 6',1);assert.deepEqual(p.fields,{nx:1920,ny:1080,pitch:3,f:6});
});
for(const value of ['2.8-12mm','2.8~12 mm','2.8～12 mm','2.8 至 12 mm','2.8 to 12mm','2.8, 4.9 mm','4.9±0.2mm','4.9 mm (±5%)','~4.9mm','about 4.9mm']){
 test('ambiguous focal value stays empty: '+value,()=>{const p=CS.parse('Focal length: '+value);assert.equal(p.fields.f,undefined);assert.ok(p.warnings.length);});
}
for(const value of ['4.9','4900um','0.49cm','4.9mm 35mm equivalent','35mm equivalent 4.9','4.9 mm equivalent']){
 test('missing, wrong or equivalent focal unit is not guessed: '+value,()=>{const p=CS.parse('Focal length: '+value);assert.equal(p.fields.f,undefined);assert.ok(p.warnings.length);});
}
test('same duplicate is allowed',()=>{assert.equal(CS.parse('Focal length: 4.9mm\nFocal length: 4.9mm').fields.f,4.9);});
test('a range remains blocked even if a later line gives an endpoint',()=>{assert.equal(CS.parse('Focal length: 2.8–12mm\nFocal length: 2.8mm').fields.f,undefined);});
test('choice candidates contain both explicit resolutions',()=>{
 const p=CS.parse('Resolution: 2688x1520, 1920x1080');assert.deepEqual(p.fields,{});assert.deepEqual(p.issues[0].choices,[{nx:2688,ny:1520},{nx:1920,ny:1080}]);
});
test('mixed explicit and shorthand modes require confirmation',()=>{assert.deepEqual(CS.parse('Resolution: 1920x1080 / 720P').fields,{});});
test('fps numbers do not override dimensions',()=>{assert.deepEqual(CS.parse('Resolution: 1920x1080 @30fps').fields,{nx:1920,ny:1080});});
test('simple resolution line and individual dimensions',()=>{
 assert.deepEqual(CS.parse('1280x720').fields,{nx:1280,ny:720});assert.deepEqual(CS.parse('Width: 1280 px\nHeight: 720px').fields,{nx:1280,ny:720});
});
test('tab table keeps blank values with no column shift',()=>{const p=CS.parse('型号\tAlpha\tBeta\n镜头焦距\t\t4.9mm',0);assert.equal(p.fields.f,undefined);});
test('no inherited or reference-only previous values',()=>{CS.parse(CS.presets.OS04A10);const p=CS.parse('型号：Unknown\n帧率：30fps');assert.deepEqual(p.fields,{});assert.equal(CS.validate(p.fields).length,4);});
test('fpx does not become physical focal length',()=>{const p=CS.parse('fpx: 1600px');assert.equal(p.fields.f,undefined);assert.ok(p.warnings.length);});
test('not a units converter; sign and finite values are validated',()=>{
 for(const [key,value] of [['f',0],['pitch',-1],['nx',1920.2],['ny',Infinity],['f',null],['pitch','2.9']])assert.ok(CS.validate({nx:1920,ny:1080,pitch:2.9,f:4.9,[key]:value}).some(e=>e.key===key));
});
