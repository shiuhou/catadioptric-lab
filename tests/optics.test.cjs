const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js');
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} ≠ ${b}`);
const valid=s=>{const g=O.compute(s);assert.ok(g.ok,g.error);return g;};
let seed=20260915;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;}
test('default analytic reference values',()=>{
 const g=valid({...O.defaults});near(g.c,10);near(g.vertex,18);near(g.rout,6*Math.sqrt(3));near(g.height,26);near(g.ro,1600*6*Math.sqrt(3)/26);near(g.horizon.r,4.5);near(g.horizon.rho,360);
});
test('2000 seeded angle/radius/pixel round trips and independent reflected directions',()=>{
 for(let i=0;i<2000;i++){
  const a=2+18*random(),b=2+18*random(),limit=Math.atan2(a,b)*180/Math.PI;
  const theta=-80+(limit+75)*random(),fpx=100+3000*random(),r=O.rAt(theta,a,b);
  near(O.thetaAt(r,a,b),theta);near(O.rFromRho(O.rhoAt(r,a,b,fpx),a,b,fpx),r);
  // Independent normal calculation and vector reflection, not a second call to traceAt.
  const c=Math.sqrt(a*a+b*b),z=c+a*Math.sqrt(1+r*r/(b*b));
  const slope=a*r/(b*b*Math.sqrt(1+r*r/(b*b))),u=[r/Math.hypot(r,z),z/Math.hypot(r,z)],nn=Math.hypot(slope,1),n=[-slope/nn,1/nn],dot=u[0]*n[0]+u[1]*n[1];
  const w=[u[0]-2*dot*n[0],u[1]-2*dot*n[1]],v=[r/Math.hypot(r,z-2*c),(z-2*c)/Math.hypot(r,z-2*c)];
  near(w[0],v[0]);near(w[1],v[1]);
 }
});
test('300 derivative samples agree with central finite differences',()=>{
 for(let i=0;i<300;i++){
  const a=3+12*random(),b=3+12*random(),hi=Math.atan2(a,b)*O.DEG-8,th=-55+(hi+55)*random(),fp=500+2000*random(),r=O.rAt(th,a,b),eps=1e-4;
  const numeric=(O.rhoAt(O.rAt(th+eps,a,b),a,b,fp)-O.rhoAt(O.rAt(th-eps,a,b),a,b,fp))/(2*eps);
  near(O.resolution(r,a,b,fp).elevationPxPerDeg,numeric,2e-7);
 }
});
test('similarity scales physical lengths but not ring pixel radii',()=>{
 const a=valid({...O.defaults}),b=valid({...O.defaults,scale:.5});near(b.diameter/a.diameter,.5);near(b.height/a.height,.5);near(a.ro,b.ro);near(a.ri,b.ri);
});
test('increasing focal length changes projection, not mirror',()=>{
 const a=valid({...O.defaults}),b=valid({...O.defaults,f:7.2});near(b.ro/a.ro,1.5);near(a.diameter,b.diameter);assert.equal(b.physicalFits,false);
});
test('calibrated fpx decouples pixel radius from pitch',()=>{
 const a=valid({...O.defaults,useFpx:true}),b=valid({...O.defaults,useFpx:true,pitch:1.5});near(a.ro,b.ro);near(b.sensorW/a.sensorW,.5);
});
test('same physical sensor with twice the sampling density',()=>{
 const a=valid({...O.defaults}),b=valid({...O.defaults,nx:4096,ny:3072,pitch:1.5,margin:48});near(a.sensorW,b.sensorW);near(a.sensorH,b.sensorH);near(b.ro/a.ro,2);
});
test('angles and explicit radii represent the same mirror',()=>{
 const a=valid({...O.defaults}),b=valid({...O.defaults,mode:'radii',rin0:a.rin,rout0:a.rout});near(a.lo,b.lo);near(a.hi,b.hi);near(a.ro,b.ro);near(a.diameter,b.diameter);
});
test('sensor fit immediately around the inclusive safety boundary',()=>{
 const original=valid({...O.defaults});const exact=original.lim*original.fp/original.ro;
 const inside=valid({...O.defaults,useFpx:true,fpx:exact*(1-1e-10)}),outside=valid({...O.defaults,useFpx:true,fpx:exact*(1+1e-10)});
 assert.equal(inside.fits,true);assert.equal(outside.fits,false);assert.equal(outside.physicalFits,true);
});
test('azimuth coverage in four known regimes',()=>{
 near(O.coverageAtRho(5,10,10),1);near(O.coverageAtRho(20,10,10),0);near(O.coverageAtRho(10*Math.SQRT2,10,10),0);const c=O.coverageAtRho(12,10,10);assert.ok(c>0&&c<1);
});
test('clipped annulus area reduces when the sensor is cropped',()=>{
 const full=O.ringAreaClipped(2,10,11,11),clipped=O.ringAreaClipped(2,10,5,5);
 near(full,96*Math.PI);assert.ok(clipped>=0&&clipped<full);near(O.ringAreaClipped(20,30,5,5),0);
});
test('ideal trace has zero error and lateral offset creates an error',()=>{
 const g=valid({...O.defaults}),ideal=O.tolerance(g,0,0),offset=O.tolerance(g,.25,0);
 assert.ok(ideal.rmsAngle<1e-10);assert.ok(offset.rmsAngle>.01);assert.ok(offset.rmsDistance>0);
});
for(const [key,value] of Object.entries({a0:0,b0:-1,scale:1e308,f:Infinity,pitch:0,nx:30.5,ny:0,margin:-1,lo:-90,hi:60,inspect:100,yaw:181,tilt:90,panoWidth:0,dx:NaN,dz:null,useFpx:'true',mode:'invalid'})){
 test(`invalid ${key} is rejected with a diagnostic`,()=>{const r=O.compute({...O.defaults,[key]:value});assert.equal(r.ok,false);assert.ok(r.error.length);});
}
test('strict types at computation boundary',()=>{
 for(const key of Object.keys(O.defaults).filter(k=>typeof O.defaults[k]==='number'))assert.equal(O.compute({...O.defaults,[key]:String(O.defaults[key])}).ok,false);
});
test('validated inputs never return success with non-finite results (1200 domain probes)',()=>{
 function finite(x){return typeof x==='number'?Number.isFinite(x):x&&typeof x==='object'?Object.values(x).every(finite):true;}
 for(let i=0;i<1200;i++){
  const a0=10**(-3+6*random()),b0=10**(-3+6*random());
  const s={...O.defaults,a0,b0,scale:10**(-3+6*random()),hi:Math.min(30,Math.atan2(a0,b0)*O.DEG-1e-5)};
  const r=O.compute(s);if(r.ok){assert.ok(finite(r));assert.ok(r.ro>r.ri);assert.ok(r.area>=0);}
 }
});
test('on-axis inner boundary is valid, azimuth degeneracy remains explicit',()=>{
 const g=valid({...O.defaults,mode:'radii',rin0:0});near(g.lo,-90);near(g.ri,0);assert.equal(O.resolution(0,8,6,1600).azimuthDegPerPx,Infinity);
});
