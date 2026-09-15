/* Ideal central hyperbolic catadioptric camera. Length: mm. UI angles: deg.
 * Derived in the coordinate convention C=(0,0,0), V=(0,0,2c).
 * No finite aperture, focus, distortion, occlusion, or rolling-shutter model.
 * Core references: Baker & Nayar, IJCV 1999; OpenCV camera projection docs.
 */
(function(root){
'use strict';
const RAD=Math.PI/180, DEG=180/Math.PI;
const defaults={a0:8,b0:6,scale:1,mode:'angles',lo:-40,hi:30,rin0:1.914,rout0:10.3923,
 f:4.8,pitch:3,nx:2048,ny:1536,margin:24,useFpx:false,fpx:1600,inspect:0,
 yaw:0,tilt:0,panoWidth:1800,dx:0,dz:0};
const clone=x=>JSON.parse(JSON.stringify(x));
function zAt(r,a,b){return Math.hypot(a,b)+a*Math.hypot(1,r/b);}
function slope(r,a,b){return a*r/(b*b*Math.hypot(1,r/b));}
function thetaAt(r,a,b){return Math.atan2(zAt(r,a,b)-2*Math.hypot(a,b),r)*DEG;}
function rAt(theta,a,b){
 const c=Math.hypot(a,b),t=theta*RAD,den=a-c*Math.sin(t);
 if(theta===-90)return 0; // removable endpoint; azimuth degenerates on the axis
 if(!(theta>-90&&theta<Math.atan2(a,b)*DEG)||den<=0)return NaN;
 return b*b*Math.cos(t)/den;
}
function rhoAt(r,a,b,fp){return fp*r/zAt(r,a,b);}
function rFromRho(rho,a,b,fp){
 const q=rho/fp,c=Math.hypot(a,b),den=c-a*Math.hypot(1,q);
 return rho>=0&&den>0?q*b*b/den:NaN;
}
function resolution(r,a,b,fp){
 const c=Math.hypot(a,b),z=zAt(r,a,b),zp=slope(r,a,b),v=z-2*c;
 const dtheta=(r*zp-v)/(r*r+v*v); // rad/mm
 const drho=fp*(z-r*zp)/(z*z);    // px/mm
 const el=drho/dtheta*RAD,az=rhoAt(r,a,b,fp)*RAD;
 return {elevationPxPerDeg:el,azimuthPxPerDeg:az,elevationDegPerPx:1/el,azimuthDegPerPx:1/az};
}
function ringAreaClipped(ri,ro,hx,hy,n=1440){
 // Polar area integration: 1/2 integral[max(min(ro,Rrect(phi))^2-ri^2,0)] dphi.
 if(!(ro>ri&&hx>0&&hy>0))return 0;
 if(ro<=Math.min(hx,hy))return Math.PI*(ro*ro-ri*ri);
 let s=0;
 for(let k=0;k<n;k++){
  const t=2*Math.PI*(k+.5)/n;
  const lim=Math.min(hx/Math.max(Math.abs(Math.cos(t)),1e-15),hy/Math.max(Math.abs(Math.sin(t)),1e-15));
  s+=Math.max(0,Math.min(ro,lim)**2-ri*ri);
 }
 return s*Math.PI/n;
}
function coverageAtRho(rho,hx,hy){
 if(rho<=0)return 1;
 if(rho<=Math.min(hx,hy))return 1;
 if(rho>Math.hypot(hx,hy))return 0;
 // First quadrant: acos(hx/rho)<=phi<=asin(hy/rho).
 const left=Math.acos(Math.min(1,hx/rho)),right=Math.asin(Math.min(1,hy/rho));
 return Math.max(0,2*(right-left)/Math.PI);
}
// Software calculation domain, NOT measured hardware limits. Keep all inputs
// typed and bounded before expensive rendering/import; derived values are checked too.
const ranges={
 a0:[0.001,1000],b0:[0.001,1000],scale:[0.001,1000],
 f:[0.001,10000],pitch:[0.001,1000],fpx:[0.001,1e8],
 nx:[16,16384],ny:[16,16384],margin:[0,8191],
 lo:[-89.99999,89.99999],hi:[-89.99999,89.99999],
 rin0:[0,10000],rout0:[0.001,10000],inspect:[-90,90],
 yaw:[-180,180],tilt:[-85,85],panoWidth:[16,16384],dx:[-1000,1000],dz:[-1000,1000]
};
const names={a0:'镜面纵向形状 a₀',b0:'镜面径向形状 b₀',scale:'整体大小 s',f:'焦距 f',pitch:'像素间距 p',fpx:'标定焦距 fpx',nx:'图像宽度 Nx',ny:'图像高度 Ny',margin:'安全边距 m',lo:'下方视场 θmin',hi:'上方视场 θmax',rin0:'内半径 r₀',rout0:'外半径 R₀',inspect:'观察方向 θ',yaw:'左右转向 ψ',tilt:'整体倾斜 β',panoWidth:'全景输出宽度 W',dx:'横向错位 Δx',dz:'轴向错位 Δz'};
function validationIssue(s){
 if(!s||typeof s!=='object'||Array.isArray(s))return {key:null,message:'参数必须是一个对象。'};
 for(const [k,[min,max]] of Object.entries(ranges)){
  if(typeof s[k]!=='number'||!Number.isFinite(s[k]))return {key:k,message:`${names[k]} 必须是有限数值；不能为留空、字符串或 null。`};
  if(s[k]<min||s[k]>max)return {key:k,message:`${names[k]} 超出软件计算范围 ${min}–${max}（不是硬件限制）。`};
  if(['nx','ny','panoWidth'].includes(k)&&!Number.isInteger(s[k]))return {key:k,message:`${names[k]} 必须是整数像素数。`};
 }
 if(typeof s.useFpx!=='boolean')return {key:'fpx',message:'useFpx 必须为 true 或 false。'};
 if(!['angles','radii'].includes(s.mode))return {key:null,message:'未知的镜面尺寸模式。'};
 if(s.margin>=(Math.min(s.nx,s.ny)-1)/2)return {key:'margin',message:'安全边距 m 必须小于画幅短边的一半；请增大画幅或减小边距。'};
 const limit=Math.atan2(s.a0,s.b0)*DEG;
 if(s.mode==='angles'){
  if(!(s.hi>s.lo))return {key:'hi',message:'需要 −90° < 下方视场 θmin < 上方视场 θmax。'};
  if(s.hi>=limit-1e-7)return {key:'hi',message:`上方视场必须小于 atan(a/b) = ${limit.toFixed(4)}°；渐近方向需要无限大的镜面。`};
 }else if(!(s.rout0>s.rin0))return {key:'rout0',message:'镜面外半径 R₀ 必须大于有效内半径 r₀。'};
 return null;
}
function validate(s){return validationIssue(s)?.message||null;}
function finiteResult(x){
 if(typeof x==='number')return Number.isFinite(x);
 if(x&&typeof x==='object')return Object.values(x).every(finiteResult);
 return true;
}
function compute(s){
 const issue=validationIssue(s);if(issue)return {ok:false,error:issue.message,errorKey:issue.key};
 const a=s.a0*s.scale,b=s.b0*s.scale,c=Math.hypot(a,b),fp=s.useFpx?s.fpx:1000*s.f/s.pitch;
 const rin=s.mode==='angles'?rAt(s.lo,a,b):s.rin0*s.scale;
 const rout=s.mode==='angles'?rAt(s.hi,a,b):s.rout0*s.scale;
 const lo=thetaAt(rin,a,b),hi=thetaAt(rout,a,b),zi=zAt(rin,a,b),zo=zAt(rout,a,b);
 const ri=rhoAt(rin,a,b,fp),ro=rhoAt(rout,a,b,fp);
 const hx=(s.nx-1)/2,hy=(s.ny-1)/2,lim=Math.min(hx,hy)-s.margin;
 const fits=ro<=lim,physicalFits=ro<=Math.min(hx,hy);
 let fullHi=null,fullHiPhysical=null;
 if(ri<lim){fullHi=fits?hi:thetaAt(rFromRho(lim,a,b,fp),a,b);}
 if(ri<Math.min(hx,hy)){fullHiPhysical=physicalFits?hi:thetaAt(rFromRho(Math.min(hx,hy),a,b,fp),a,b);}
 const angle=Math.max(lo+1e-6,Math.min(hi-1e-6,s.inspect)),r=rAt(angle,a,b),rho=rhoAt(r,a,b,fp),res=resolution(r,a,b,fp);
 const area=ringAreaClipped(ri,ro,hx,hy);
 const result={ok:true,a,b,c,fp,rin,rout,lo,hi,zi,zo,ri,ro,hx,hy,lim,fits,physicalFits,fullHi,fullHiPhysical,
  diameter:2*rout,vertex:c+a,sag:zo-(c+a),height:zo,limit:Math.atan2(a,b)*DEG,
  sensorW:s.nx*s.pitch/1000,sensorH:s.ny*s.pitch/1000,
  area,util:area/(s.nx*s.ny),areaFraction:area/(Math.PI*(ro*ro-ri*ri)),
  inspect:angle,r,rho,...res,inspectCoverage:coverageAtRho(rho,hx,hy),
  horizon:lo<=0&&hi>=0?{r:rAt(0,a,b),rho:rhoAt(rAt(0,a,b),a,b,fp)}:null};
 if(!finiteResult(result)||!(rout>rin&&ro>ri&&hi>lo)||rout>1e6)return {ok:false,error:'计算超出稳定数值范围；请远离渐近视角，并检查形状比例和尺寸。',errorKey:s.mode==='angles'?'hi':'rout0'};
 return result;
}
function traceAt(x,a,b,dx=0,dz=0){
 const z=zAt(Math.abs(x),a,b),zp=slope(x,a,b),un=Math.hypot(x-dx,z-dz),nn=Math.hypot(zp,1);
 const ux=(x-dx)/un,uz=(z-dz)/un,nx=-zp/nn,nz=1/nn,dot=ux*nx+uz*nz;
 const wx=ux-2*dot*nx,wz=uz-2*dot*nz;
 const vx=x,vz=z-2*Math.hypot(a,b),vn=Math.hypot(vx,vz);
 const err=Math.atan2(wx*vz-wz*vx,wx*vx+wz*vz)*DEG;
 const distance=Math.abs((-x)*wz-(2*Math.hypot(a,b)-z)*wx);
 return {x,z,ux,uz,nx,nz,wx,wz,angleError:err,distanceToV:distance,idealX:vx/vn,idealZ:vz/vn};
}
function tolerance(g,dx,dz,n=200){
 let sumE=0,sumD=0,maxE=0,maxD=0,rays=[];
 for(let i=0;i<n;i++){
  const th=g.lo+(g.hi-g.lo)*(i+.5)/n,r=rAt(th,g.a,g.b);
  for(const sign of [-1,1]){
   const t=traceAt(sign*r,g.a,g.b,dx,dz);rays.push(t);
   sumE+=t.angleError*t.angleError;sumD+=t.distanceToV*t.distanceToV;
   maxE=Math.max(maxE,Math.abs(t.angleError));maxD=Math.max(maxD,t.distanceToV);
  }
 }
 return {rmsAngle:Math.sqrt(sumE/(2*n)),maxAngle:maxE,rmsDistance:Math.sqrt(sumD/(2*n)),maxDistance:maxD,rays};
}
const api={RAD,DEG,defaults,clone,zAt,slope,thetaAt,rAt,rhoAt,rFromRho,resolution,ringAreaClipped,coverageAtRho,ranges,names,validationIssue,validate,compute,traceAt,tolerance};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.Optics=api;
})(typeof window!=='undefined'?window:globalThis);
