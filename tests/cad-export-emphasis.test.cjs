const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

test('marks the XYZ export and curve-driving table fields for CAD', () => {
 assert.match(app, /class="file-button cad-export"/);
 assert.match(app, /const CAD_CORE_KEYS=new Set\(\['scale','a0','b0','lo','hi','rin0','rout0'\]\)/);
 assert.match(app, /cad-core-row/);
 assert.match(css, /\.cad-export/);
 assert.match(css, /\.cad-core-row/);
});
