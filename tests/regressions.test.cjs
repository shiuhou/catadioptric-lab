// Reproductions from the 2026-09-15 review. No external test dependencies.
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../src/optics.js');
const CS = require('../src/camera-spec.js');
test('variable focal length is not converted into a definite value', () => {
 const r=CS.parse('Resolution: 2688x1520\nPixel pitch: 2.9um\nFocal length: 2.8–12mm');
 assert.equal(r.fields.f,undefined);assert.ok(r.warnings.length);
});
test('multiple resolutions require explicit choice', () => {
 const r=CS.parse('Resolution: 2688x1520, 1920x1080\nPixel pitch: 2.9um\nFocal length: 4.9mm');
 assert.equal(r.fields.nx,undefined);assert.equal(r.fields.ny,undefined);assert.ok(r.warnings.length);
});
test('a third duplicate must not erase a conflict', () => {
 const r=CS.parse('Focal length: 4.9mm\nFocal length: 3.05mm\nFocal length: 4.9mm');
 assert.equal(r.fields.f,undefined);
});
test('empty table cells keep their column position', () => {
 const r=CS.parse('型号 | Alpha | Beta\n镜头焦距 | | 4.9mm',0);
 assert.equal(r.fields.f,undefined);
});
test('negative panorama width is rejected',()=>{assert.ok(O.validate({...O.defaults,panoWidth:-5}));});
test('fractional panorama width is rejected',()=>{assert.ok(O.validate({...O.defaults,panoWidth:800.5}));});
test('extreme finite input does not produce a successful invalid result',()=>{assert.equal(O.compute({...O.defaults,a0:1e308,b0:1e308}).ok,false);});
test('null is not silently treated as numeric zero',()=>{assert.ok(O.validate({...O.defaults,dx:null}));});
