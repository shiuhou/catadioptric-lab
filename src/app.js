'use strict';
const APP_VERSION='7.0.0';
let formulaOpen=false;
const O=window.Optics,$=id=>document.getElementById(id),F=(x,n=2)=>x===null||x===undefined||Number.isNaN(x)?'—':(!Number.isFinite(x)?'∞':Math.abs(x)>=1e6?Number(x).toExponential(2):Number(x).toFixed(n)),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=O.clone(O.defaults),g=O.compute(state),before=O.clone(state),baseline=O.clone(state),pinned=false,stabilize=false;
let page='design',key='scale',group='mirror',experiment='optics',mobileScene='mirror',showGhost=true,panoMode='equal';
let geomZoom=1,sensorZoom=1,frame=0,queued=false,tolResult=null,toastTimer=null;
const same=(x,y)=>Math.abs(x-y)<=1e-8*Math.max(1,Math.abs(x),Math.abs(y));
const C={ink:'#304e47',muted:'#647b72',accent:'#218c79',soft:'#dcefe4',line:'#dae5dc',blue:'#719bb8',amber:'#c8934b',purple:'#907ab3',red:'#bc6854',ghost:'#c4cdc5'};
const formulas=[
 ['01','实际形状与焦点','a = s·a₀， b = s·b₀<br>c = √(a² + b²)<br>C = (0,0,0)， V = (0,0,2c)','a、b > 0。C 为针孔投影中心，不是传感器表面。双焦点条件来自 [1]，此处使用重新定义的坐标。',G=>`a=${F(G.a)}，b=${F(G.b)}，c=${F(G.c)} mm`],
 ['02','镜面截面与法线','z(r) = c + a√(1 + r²/b²)<br>z′(r) = ar / [b²√(1 + r²/b²)]','把曲线绕 z 轴旋转；反射面朝向下方相机。斜率用于计算局部法线。',G=>`z(0)=${F(G.vertex)} mm；z(R)=${F(G.height)} mm`],
 ['03','镜面位置 → 观察方向','θ(r) = atan2(z(r) − 2c, r)','这是外界俯仰角，不是镜头自身的入射角 atan(r/z)。在满足双焦点条件时，反射光线的延长线通过 V。[1]',G=>`θ(${F(G.r)} mm)=${F(G.inspect,2)}°`],
 ['04','观察方向 → 镜面位置（闭式反解）','r(θ) = b² cosθ / (a − c sinθ)<br>−90° < θ < atan(a/b)','由式 02、03 消元得到。分母趋向 0 时镜面尺寸发散；不能把不可达视场当作可行候选。',G=>`角度上限=${F(G.limit)}°；有效 r=${F(G.rin)}…${F(G.rout)} mm`],
 ['05','镜面外径、距离与弓高','D = 2r(θmax)<br>h₀ = c + a<br>h<sub>rim</sub> = z(r(θmax))<br>sag = h<sub>rim</sub> − h₀','给定尺寸模式直接使用外半径 R。h₀ 和 hrim 都从投影中心 C 计量，不包括镜头、PCB、镜片厚度与支架。',G=>`D=${F(G.diameter)}；h₀=${F(G.vertex)}；hrim=${F(G.height)}；sag=${F(G.sag)} mm`],
 ['06','物理焦距 → 像素焦距','f<sub>px</sub> ≈ 1000 f / p<br>W<sub>sensor</sub> = Nₓp / 1000<br>H<sub>sensor</sub> = Nᵧp / 1000','f 以 mm、p 以 μm 计。估算模式假设原生采样、方形像素。使用标定 fpx 时，应对应当前输出图像。[2]',G=>`fpx=${F(G.fp,1)} px；画幅=${F(G.sensorW,3)}×${F(G.sensorH,3)} mm`],
 ['07','镜面半径 → 图像半径','ρ(r) = f<sub>px</sub> r / z(r)','由针孔投影得到。[2] 这是环的像素半径，不是直径。镜头畸变和实际主点偏移未建模。',G=>`ρmin=${F(G.ri,1)}；ρmax=${F(G.ro,1)} px`],
 ['08','圆环完整落入画幅的条件','ρmax ≤ L<br>L = [min(Nₓ,Nᵧ) − 1]/2 − m','以像素中心坐标、主点居中计算。m=0 对应实际几何边界；m>0 额外保留装调余量。部分圆环越界时仍可能看到部分方向，但不是完整 360°。',G=>`L=${F(G.lim,1)} px；${G.fits?'满足保边距条件':'不满足保边距条件'}`],
 ['09','图像半径 → 镜面半径','q = ρ / f<sub>px</sub><br>z = b² / [c − a√(1 + q²)]<br>r = qz， 0 ≤ q < b/a','由式 02、07 消元得到；用于合成环形图和反查被裁切的俯仰范围。',G=>`qmax=${F(G.ro/G.fp,4)}；上限 b/a=${F(G.b/G.a,4)}`],
 ['10','每一度对应多少像素','Qφ = ρ·π/180<br>Qθ = |dρ/dθ|·π/180<br>δφ ≈ 1/Qφ， δθ ≈ 1/Qθ','Q 的单位为 px/degree；δ 为 degree/px。Qφ 指方位角坐标采样，不是球面测地角。它不等于 MTF、实际分辨能力或估计精度。',G=>`Qφ=${F(G.azimuthPxPerDeg,3)}；Qθ=${F(G.elevationPxPerDeg,3)} px/°`],
 ['11','非线性采样密度的导数','dρ/dr = f<sub>px</sub>(z − rz′)/z²<br>dθ/dr = [rz′ − (z−2c)] / [r²+(z−2c)²]<br>dρ/dθ = (dρ/dr) / (dθ/dr)','θ 微分以弧度计。先求导，再乘 π/180 才得到每一度的采样密度。上面均为本坐标下的解析推导。',G=>`探针 θ=${F(G.inspect,2)}°，对应 r=${F(G.r,3)} mm`],
 ['12','为什么整体缩小不必牺牲几何视场','(a,b,r,z,c) → λ(a,b,r,z,c)<br>r/z 不变 → ρ 不变<br>(z−2c)/r 不变 → θ 不变','相机参数和所需角带固定时成立。实际系统不能无限缩小，因为孔径、对焦、遮挡和制造公差没有包括在该相似性里。',G=>`当前整体几何缩放 s=${F(state.scale,2)}×`],
 ['13','离开焦点后的独立反射计算','u = (P−C′) / ‖P−C′‖<br>n = (−z′,1) / √(1+z′²)<br>w = u − 2(u·n)n','这是二维轴截面中的反向光路。n 取相反符号也给出同一个 w。错位后不要再无条件使用式 03 的公共视点。',G=>`装调实验 C′=(${F(state.dx)},${F(state.dz)}) mm`],
 ['14','等俯仰展开不是直接拉直圆环','θ(v) = θmax − (v+½)(θmax−θmin)/H<br>φ(u) = 2π(u+½)/W − π<br>ρ = ρ(r(θ))<br>x = cₓ + ρ cosφ， y = cᵧ + ρ sinφ','这里使用虚拟图像方向约定。实际相机可能需要旋转或翻转，必须标定。姿态校正需要先旋转三维方向，再映射回原图；不可见方向须保留无效 mask。[3]',G=>`当前输出宽度 W=${F(state.panoWidth,0)} px`]
];

function directionColor(phi,theta){
 const th=theta*O.DEG,ph=(phi*O.DEG%360+360)%360;
 let c;
 if(th>=0){const t=Math.min(1,th/60);c=[178-80*t,215-50*t,232-26*t];}
 else{const t=Math.min(1,-th/65);c=[99-41*t,146-49*t,107-37*t];}
 const objects=[[18,26,14,[219,109,76]],[83,32,10,[212,176,67]],[139,18,17,[126,95,165]],[223,37,12,[52,129,170]],[279,22,15,[222,125,59]],[329,30,9,[183,83,114]]];
 for(const [mid,h,w,col] of objects){const d=Math.abs(((ph-mid+540)%360)-180);if(d<w&&th>-12&&th<h){c=col.slice();if(d>w-1||Math.abs(th-h)<.6)c=c.map(v=>v*.77);if(Math.abs(th%7)<.7&&th>0)c=c.map(v=>v*.8);break;}}
 if(Math.abs(th)<.38)c=[222,235,214];
 if(Math.abs(((ph+15)%30)-15)<.28||Math.abs(((th+10)%20+20)%20-10)<.22)c=c.map(v=>v*.8);
 return c;
}
function worldColor(phi,theta){
 const beta=state.tilt*O.RAD,ct=Math.cos(theta),x=ct*Math.cos(phi),y=ct*Math.sin(phi),z=Math.sin(theta),xw=Math.cos(beta)*x+Math.sin(beta)*z,zw=-Math.sin(beta)*x+Math.cos(beta)*z;
 return directionColor(Math.atan2(y,xw)+state.yaw*O.RAD,Math.asin(Math.max(-1,Math.min(1,zw))));
}
const checker=(x,y)=>((Math.floor(x/8)+Math.floor(y/8))%2)?[211,220,225]:[234,239,241];
function inSensor(rho,phi){return Math.abs(rho*Math.cos(phi))<=g.hx&&Math.abs(rho*Math.sin(phi))<=g.hy;}
function paintRaw(){
 const c=$('rawCanvas');c.width=320;c.height=Math.max(120,Math.min(320,Math.round(320*state.ny/state.nx)));const w=c.width,h=c.height,ctx=c.getContext('2d'),im=ctx.createImageData(w,h);
 // Preserve sensor aspect ratio even when the preview height is capped.
 const k=Math.min(w/state.nx,h/state.ny),ox=(w-state.nx*k)/2,oy=(h-state.ny*k)/2;
 for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
  const rx=(xx-ox+.5)/k-state.nx/2,ry=(yy-oy+.5)/k-state.ny/2,rho=Math.hypot(rx,ry),idx=4*(yy*w+xx);let col=checker(xx,yy);
  if(Math.abs(rx)<=g.hx&&Math.abs(ry)<=g.hy&&rho>=g.ri&&rho<=g.ro){const r=O.rFromRho(rho,g.a,g.b,g.fp),th=O.thetaAt(r,g.a,g.b)*O.RAD;col=worldColor(Math.atan2(ry,rx),th);}
  im.data[idx]=col[0];im.data[idx+1]=col[1];im.data[idx+2]=col[2];im.data[idx+3]=255;
 }
 ctx.putImageData(im,0,0);
}
function paintPano(id,equal){
 const canvas=$(id),w=Math.min(1200,Math.max(120,Math.round(state.panoWidth))),h=168;canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),im=ctx.createImageData(w,h),beta=state.tilt*O.RAD;
 for(let yy=0;yy<h;yy++){
  const t=(yy+.5)/h;
  const rhoLinear=g.ro-(g.ro-g.ri)*t;
  const theta=equal?(g.hi-(g.hi-g.lo)*t)*O.RAD:O.thetaAt(O.rFromRho(rhoLinear,g.a,g.b,g.fp),g.a,g.b)*O.RAD;
  const ct=Math.cos(theta),st=Math.sin(theta);
  for(let xx=0;xx<w;xx++){
   const phi=((xx+.5)/w*2*Math.PI-Math.PI),idx=4*(yy*w+xx);let ph=phi,th=theta;
   if(equal&&stabilize){
    const x=ct*Math.cos(phi),y=ct*Math.sin(phi),z=st,xc=Math.cos(beta)*x-Math.sin(beta)*z,zc=Math.sin(beta)*x+Math.cos(beta)*z;
    ph=Math.atan2(y,xc);th=Math.asin(Math.max(-1,Math.min(1,zc)));
   }
   let col=checker(xx,yy);const deg=th*O.DEG;
   if(deg>=g.lo&&deg<=g.hi){const rr=O.rAt(deg,g.a,g.b),rho=O.rhoAt(rr,g.a,g.b,g.fp);if(inSensor(rho,ph))col=worldColor(ph,th);}
   im.data[idx]=col[0];im.data[idx+1]=col[1];im.data[idx+2]=col[2];im.data[idx+3]=255;
  }
 }
 ctx.putImageData(im,0,0);
 ctx.fillStyle='rgba(18,38,49,.75)';ctx.fillRect(0,h-19,w,19);ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.textAlign='center';
 for(let i=0;i<8;i++)ctx.fillText(`${-180+i*45}°`,Math.max(16,i*w/8),h-6);
}

const P={
 scale:{group:'mirror',label:'整体大小',title:'把整个光路一起缩放',desc:'镜面与镜头间距一起变，观察实物图。',unit:'×',min:.4,max:1.8,step:.01,n:2,formula:11,initial:'实物变大 / 变小，成像圆环不变。'},
 a0:{group:'mirror',label:'纵向形状 a₀',title:'改变镜面的纵向形状',desc:'紫线 a 是构造半轴，不是镜片厚度。',unit:'mm',min:2,max:16,step:.1,n:1,formula:0,initial:'看紫线与曲面；视场固定时，镜片截取尺寸也会改变。'},
 b0:{group:'mirror',label:'径向形状 b₀',title:'改变曲面张开的形状',desc:'紫线 b 是构造半轴，不是镜片外半径。',unit:'mm',min:2,max:14,step:.1,n:1,formula:1,initial:'看紫线与曲面；镜片外缘会按当前视场重新计算。'},
 lo:{group:'fov',label:'向下看多少',title:'调整视野的下边界',desc:'0° 是水平；负数看下方，不是倾斜整个镜头。',unit:'°',min:-85,max:20,step:.5,n:1,formula:3,initial:'更向下 → 使用更内侧的镜面 → 圆环的内圈缩小。'},
 hi:{group:'fov',label:'向上看多少',title:'调整视野的上边界',desc:'绿色光线是上边界，它决定镜片截到哪里。',unit:'°',min:-20,max:65,step:.5,n:1,formula:3,initial:'更向上 → 镜片外缘变大 → 圆环的外圈变大。'},
 inspect:{group:'fov',label:'选一束光',title:'跟着一束光，看它落在哪里',desc:'橙色点沿镜面移动；右边橙圈对应同一个方向。',unit:'°',min:-40,max:30,step:.5,n:1,formula:2,initial:'只是观察探针，不改变镜面、视场或相机。'},
 rin0:{group:'fov',label:'有效内半径',title:'选用镜面内侧的哪个位置',desc:'这只是使用范围的内边界，不是在镜面上开孔。',unit:'mm',min:0,max:12,step:.1,n:1,formula:2,initial:'内半径增大，会舍弃更多向下的视野。'},
 rout0:{group:'fov',label:'镜片外半径',title:'把镜片向外截得更大',desc:'沿原曲面改变边缘；不改变曲面形状。',unit:'mm',min:2,max:25,step:.1,n:1,formula:4,initial:'外径增大，向上的视野与图像外圈一起增大。'},
 f:{group:'camera',label:'镜头焦距',title:'让圆环在画面里变大或变小',desc:'焦距改变投影倍率，不改变镜头到镜面的距离。',unit:'mm',min:1.2,max:9.6,step:.05,n:2,formula:6,initial:'焦距变长 → 右图圆环放大；左边镜面不动。'},
 pitch:{group:'camera',label:'像素间距',title:'改变每个像素的物理尺寸',desc:'宽高像素数固定；像素变小，整块画幅也变小。',unit:'μm',min:1.2,max:6,step:.05,n:2,formula:5,initial:'像素变小 → 圆环占用更多像素，可能装不下。'},
 nx:{group:'camera',label:'画面宽度',title:'让相机画面更宽',desc:'只增加横向像素数，不是把整幅图拉宽。',unit:'px',min:320,max:4096,step:16,n:0,formula:7,initial:'蓝色边框变宽，圆环的像素大小不变。'},
 ny:{group:'camera',label:'画面高度',title:'让相机画面更高',desc:'只增加纵向像素数，像素的物理尺寸保持不变。',unit:'px',min:320,max:4096,step:16,n:0,formula:7,initial:'蓝色边框变高，圆环的像素大小不变。'},
 fpx:{group:'camera',label:'标定像素焦距',title:'直接使用标定的投影倍率',desc:'已开启标定模式，不再用物理焦距 f 估算投影。',unit:'px',min:200,max:4000,step:10,n:0,formula:6,initial:'像素焦距增大 → 圆环变大；实物尺寸不变。'},
 margin:{group:'camera',label:'安全边距',title:'给画面边缘留一点余量',desc:'只调整验算边界，不会真的裁掉像素。',unit:'px',min:0,max:150,step:1,n:0,formula:7,initial:'虚线内框收缩，实际画幅与圆环不变。'},
 yaw:{group:'pose',label:'左右转向',title:'转个方向，看看全景怎么移动',desc:'整套相机绕竖直轴旋转，镜面形状不变。',unit:'°',min:-180,max:180,step:1,n:0,formula:13,initial:'色块绕环周转动，展开图左右循环移动。'},
 tilt:{group:'pose',label:'整机倾斜',title:'倾斜之后，地平线还是直的吗？',desc:'倾斜整个光路，不是让镜头离开焦点。',unit:'°',min:-35,max:35,step:1,n:0,formula:13,initial:'开启姿态校正只能重排已拍到的方向。'},
 panoWidth:{group:'pose',label:'展开宽度',title:'给展开图分配多少横向像素',desc:'只改变输出采样，不改变原始相机的信息量。',unit:'px',min:240,max:3600,step:60,n:0,formula:13,initial:'预览最多 1200 像素；放大输出不会增加光学细节。'},
 dx:{group:'assembly',label:'左右错位',title:'把镜头从轴线上移开',desc:'镜面不动，只移动镜头的投影中心 C′。',unit:'mm',min:-2,max:2,step:.02,n:2,formula:12,initial:'看 C′ 与红色光线，它们开始偏离设计时的公共视点。'},
 dz:{group:'assembly',label:'上下错位',title:'只改变镜头与镜面的装配距离',desc:'同轴不代表对焦点；镜面保持原样。',unit:'mm',min:-3,max:3,step:.02,n:2,formula:12,initial:'正值更靠近镜面；离开设计焦点会改变观察方向。'}
};
function svg(w,h,label,body){return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label==='sensor'?'环形图像与传感器画幅':label)}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="${label==='sensor'?'s':label==='镜面与镜头的理想光路'?'m':'chart'}-arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse"><path d="M 0 1 L 5 3 L 0 5" fill="none" stroke="context-stroke" stroke-width=".9"/></marker></defs>${body}</svg>`;}
function line(x1,y1,x2,y2,col,width=1,extra=''){return `<line x1="${F(x1,3)}" y1="${F(y1,3)}" x2="${F(x2,3)}" y2="${F(y2,3)}" stroke="${col}" stroke-width="${width}" ${extra}/>`;}
function txt(x,y,t,col=C.muted,size=12,anchor='start',extra=''){return `<text x="${F(x,3)}" y="${F(y,3)}" fill="${col}" data-base-size="${size}" data-min-css="${size>=12?12:11}" font-size="${size}" text-anchor="${anchor}" font-family="inherit" ${extra}>${esc(t)}</text>`;}
function circle(x,y,r,fill,extra=''){return `<circle cx="${F(x,3)}" cy="${F(y,3)}" r="${F(r,3)}" fill="${fill}" ${extra}/>`;}
function hot(k,body){return `<g class="hot" data-key="${k}" role="button" tabindex="0" aria-label="调整${esc(P[k].label)}">${body}</g>`;}
function dimension(x1,y1,x2,y2,label,col,vertical=false){
 let s=line(x1,y1,x2,y2,col,1.1,'marker-start="url(#m-arr)" marker-end="url(#m-arr)"');
 if(vertical)s+=txt(x1-9,(y1+y2)/2+4,label,col,12,'end','paint-order="stroke" stroke="white" stroke-width="4"');
 else s+=txt((x1+x2)/2,y1-10,label,col,12,'middle','paint-order="stroke" stroke="white" stroke-width="4"');return s;
}
function mirrorSVG(){
 const W=560,H=365,k=7.4*geomZoom,cx=220,cy=300,X=x=>cx+x*k,Y=z=>cy-z*k,B=O.compute(before),isAssembly=experiment==='assembly';
 const path=G=>{let d='';for(let i=0;i<=180;i++){const x=-G.rout+2*G.rout*i/180;d+=(i?'L':'M')+F(X(x),3)+' '+F(Y(O.zAt(Math.abs(x),G.a,G.b)),3)+' ';}return d;};
 let s=`<defs><clipPath id="mirror-clip"><rect x="18" y="48" width="524" height="271"/></clipPath></defs>`;
 s+=line(X(0),54,X(0),Y(0)-8,'#e5ece7',1,'stroke-dasharray="3 6"');
 s+='<g clip-path="url(#mirror-clip)">';
 if(showGhost&&B.ok){s+=`<path data-drawing="old-mirror" d="${path(B)}" fill="none" stroke="${C.ghost}" stroke-width="2" stroke-dasharray="5 6"/>`;}
 if(!isAssembly){
  const rad=120,verts=[`${X(0)},${Y(2*g.c)}`];for(let i=0;i<=35;i++){const th=(g.lo+(g.hi-g.lo)*i/35)*O.RAD;verts.push(`${X(0)+rad*Math.cos(th)},${Y(2*g.c)-rad*Math.sin(th)}`);}s+=`<polygon points="${verts.join(' ')}" fill="#eff7ee"/>`;
  for(const th of [g.lo,g.hi]){const r=O.rAt(Math.max(-89.999999,th),g.a,g.b),z=O.zAt(r,g.a,g.b),t=th*O.RAD;s+=line(X(0),Y(2*g.c),X(r),Y(z),'#99beb0',1,'stroke-dasharray="3 5"');s+=line(X(r),Y(z),X(r)+190*Math.cos(t),Y(z)-190*Math.sin(t),'#a9caba',1);}
 }
 if(isAssembly){
  for(const th of [g.lo+(g.hi-g.lo)*.15,g.lo+(g.hi-g.lo)*.5,g.lo+(g.hi-g.lo)*.85])for(const sign of [-1,1]){
   const r=O.rAt(th,g.a,g.b),q=O.traceAt(sign*r,g.a,g.b,state.dx,state.dz);
   s+=line(X(state.dx),Y(state.dz),X(q.x),Y(q.z),C.blue,1.2,'opacity=".55"');
   s+=line(X(q.x),Y(q.z),X(q.x)+q.wx*235,Y(q.z)-q.wz*235,C.red,1.6,'opacity=".8"');
   s+=line(X(q.x),Y(q.z),X(q.x)-q.wx*150,Y(q.z)+q.wz*150,C.red,1,'stroke-dasharray="4 5" opacity=".35"');
  }
 }else{
  const th=key==='hi'?g.hi:key==='lo'?g.lo:g.inspect;
  const r=O.rAt(Math.max(-89.999999,th),g.a,g.b),q=O.traceAt(r,g.a,g.b),col=key==='inspect'?C.amber:C.accent;
  s+=line(X(q.x),Y(q.z),X(q.x)+q.wx*270,Y(q.z)-q.wz*270,col,1.8,'opacity=".75"');
  s+=line(X(0),Y(0),X(q.x),Y(q.z),col,1.5,'opacity=".38"');
  if(group==='fov'){s+=line(X(0),Y(2*g.c),X(q.x),Y(q.z),C.amber,1,'stroke-dasharray="4 4"');}
  s+=hot('inspect',circle(X(q.x),Y(q.z),4,col,'stroke="white" stroke-width="2"'));
  if(group==='fov')s+=txt(X(q.x)+16,Y(q.z)-9,`${F(th,1)}°`,col,13,'start','paint-order="stroke" stroke="white" stroke-width="4"');
 }
 const mirrorColor=['a0','b0'].includes(key)?C.purple:C.ink;
 s+=hot(group==='mirror'?key:'scale',`<path data-drawing="mirror" d="${path(g)}" fill="none" stroke="${mirrorColor}" stroke-width="6" stroke-linecap="round"/><path d="${path(g)}" fill="none" stroke="#d9e5da" stroke-width="1.5"/>`);
 if(['a0','b0'].includes(key)){
  const yy=Y(g.c),yv=Y(g.vertex),left=X(-g.b);s+=circle(X(0),yy,2.6,C.purple);
  s+=line(left,yy,X(0),yy,C.purple,.8,'stroke-dasharray="3 4" opacity=".6"')+line(left,yy,left,yv,C.purple,.8,'stroke-dasharray="3 4" opacity=".6"');
  s+=key==='a0'?dimension(left-16,yy,left-16,yv,`a = ${F(g.a,1)} mm`,C.purple,true):dimension(left,yy+21,X(0),yy+21,`b = ${F(g.b,1)} mm`,C.purple);
  s+=txt(X(0)+10,yy+4,'曲线中心',C.purple,10);
 }else if(!isAssembly){
  const dy=Y(g.height)-22;s+=line(X(-g.rout),Y(g.height)-3,X(-g.rout),dy-4,C.line)+line(X(g.rout),Y(g.height)-3,X(g.rout),dy-4,C.line);
  s+=hot(state.mode==='angles'?'hi':'rout0',dimension(X(-g.rout),dy,X(g.rout),dy,`直径 ${F(g.diameter,1)} mm`,group==='camera'?C.muted:C.ink));
 }
 if(true){s+=circle(X(0),Y(2*g.c),3.5,C.amber)+txt(X(0)-10,Y(2*g.c)-10,'有效视点 V',C.amber,11,'end','paint-order="stroke" stroke="white" stroke-width="3"');}
 if(key==='scale'&&!isAssembly){s+=dimension(X(-g.rout)-25,Y(0),X(-g.rout)-25,Y(g.vertex),`h₀ ${F(g.vertex,1)}`,C.muted,true);}
 s+='</g>';
 const ox=isAssembly?state.dx:0,oz=isAssembly?state.dz:0;
 if(isAssembly)s+=circle(X(0),Y(0),5,'none',`stroke="${C.ghost}" stroke-dasharray="2 3"`);
 s+=`<rect x="${X(ox)-17}" y="${Y(oz)+3}" width="34" height="18" rx="6" fill="#eff4ed" stroke="#c8d8ce"/><rect x="${X(ox)-10}" y="${Y(oz)-3}" width="20" height="7" rx="3" fill="#adc5b6"/>`;
 s+=circle(X(ox),Y(oz),3.8,isAssembly?C.red:C.accent,'stroke="white" stroke-width="1.4"');
 s+=txt(X(ox)+27,Y(oz)+13,isAssembly?'投影中心 C′':'镜头 · C',isAssembly?C.red:C.muted,12);
 if(isAssembly){s+=line(X(0),Y(0)-9,X(ox),Y(oz)-9,C.red,1,'stroke-dasharray="2 2"');}
 return svg(W,H,'镜面与镜头的理想光路',s);
}
function sensorSVG(){
 const W=500,H=365,k=.155*sensorZoom,cx=250,cy=183,B=O.compute(before),sx=cx-g.hx*k,sy=cy-g.hy*k,sw=2*g.hx*k,sh=2*g.hy*k;
 let s=`<defs><clipPath id="sensor-clip"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}"/></clipPath></defs>`;
 if(showGhost&&B.ok){
  s+=`<rect x="${cx-B.hx*k}" y="${cy-B.hy*k}" width="${2*B.hx*k}" height="${2*B.hy*k}" fill="none" stroke="${C.ghost}" stroke-dasharray="5 5"/>`;
  s+=circle(cx,cy,B.ro*k,'none',`stroke="${C.ghost}" stroke-width="1.2" stroke-dasharray="5 5"`);
 }
 s+=`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="#f6f9f6"/>`;
 if(!g.physicalFits)s+=circle(cx,cy,g.ro*k,'none',`stroke="${C.red}" stroke-width="1.3" stroke-dasharray="4 5" opacity=".5"`);
 s+=`<g clip-path="url(#sensor-clip)">`+circle(cx,cy,g.ro*k,C.soft)+circle(cx,cy,g.ri*k,'#f6f9f6');
 if(showGhost&&B.ok){s+=circle(cx,cy,B.ro*k,'none',`stroke="${C.ghost}" stroke-width="1.4" stroke-dasharray="5 5"`)+circle(cx,cy,B.ri*k,'none',`stroke="${C.ghost}" stroke-width="1.2" stroke-dasharray="5 5"`);}
 s+=hot(state.mode==='angles'?'hi':'rout0',circle(cx,cy,g.ro*k,'none',`data-drawing="outer-ring" stroke="${g.physicalFits?C.accent:C.red}" stroke-width="2"`));
 s+=hot(state.mode==='angles'?'lo':'rin0',circle(cx,cy,g.ri*k,'none',`data-drawing="inner-ring" stroke="${key==='lo'||key==='rin0'?C.accent:'#9ebfaa'}" stroke-width="${key==='lo'||key==='rin0'?2:1}"`));
 if(key==='inspect')s+=circle(cx,cy,g.rho*k,'none',`stroke="${C.amber}" stroke-width="2"`)+circle(cx+g.rho*k,cy,4,C.amber);
 const ringRadius=key==='lo'||key==='rin0'?g.ri:key==='inspect'?g.rho:g.ro,rayColor=key==='inspect'?C.amber:'#a4bfb0';
 s+=line(cx,cy,cx+ringRadius*k,cy,rayColor,1.1)+circle(cx,cy,2.7,'#aec5b8');s+='</g>';
 s+=hot(group==='camera'&&['nx','ny'].includes(key)?key:'ny',`<rect data-drawing="sensor" x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="none" stroke="${C.blue}" stroke-width="1.4"/>`);
 if(key==='margin'||!g.fits)s+=`<rect x="${sx+state.margin*k}" y="${sy+state.margin*k}" width="${Math.max(0,sw-2*state.margin*k)}" height="${Math.max(0,sh-2*state.margin*k)}" fill="none" stroke="${key==='margin'?C.accent:'#a8b7a9'}" stroke-width="1" stroke-dasharray="4 4"/>`;
 if(true)s+=txt(cx,Math.max(54,sy-12),`${state.nx} × ${state.ny} 像素`,C.blue,11,'middle');
 s+=txt(cx,327,`${key==='lo'||key==='rin0'?'内半径':key==='inspect'?'这束光落在':'外半径'} ${F(ringRadius,0)} px`,group==='camera'||group==='fov'?C.accent:C.muted,13,'middle');
 return svg(W,H,'sensor',s);
}
// Camera specification workspace: preview first, one undoable apply transaction.
const CS=window.CameraSpec;
let cameraProfile=null,baselineCameraProfile=null;
let specDraft={text:'',extractedText:'',parsed:CS.parse(''),fields:{},model:'',source:'手动输入（未外部核验）',preset:'',feedback:''};
const specFields=[['nx','图像宽度','px','改画幅宽度','1'],['ny','图像高度','px','改画幅高度','1'],['pitch','像素间距','μm','改像素投影倍率','any'],['f','镜头焦距','mm','改圆环大小','any']];
function specificationHTML(){
 return `<section class="spec-panel" aria-labelledby="specTitle">
  <div class="spec-heading"><div><h2 id="specTitle">相机规格输入</h2><p>粘贴文字 → 核对四项 → 应用到图示</p></div><div class="spec-presets" role="group" aria-label="从用户截图载入规格示例"><span>截图示例</span><button type="button" data-camera-preset="GC4653">GC4653</button><button type="button" data-camera-preset="OS04A10">OS04A10</button></div></div>
  <div class="spec-layout"><div class="spec-source">
   <label for="specText" class="spec-subtitle">规格文字 <span>支持中文 / English</span></label>
   <textarea id="specText" rows="6" maxlength="20000" spellcheck="false" placeholder="分辨率：2560x1440&#10;像素间距：2.0um&#10;镜头焦距：3.05mm&#10;…也可以直接点击上方截图示例" aria-describedby="specSourceHelp">${esc(specDraft.text)}</textarea>
   <div class="spec-source-tools"><button type="button" id="specExtract" class="outline-button">提取参数 ↗</button><button type="button" id="specUseCurrent" class="text-button">用当前参数填写</button><label id="specColumnWrap" hidden>读取列 <select id="specColumn" aria-label="选择要提取的型号列"></select></label></div>
   <p id="specSourceHelp" class="spec-small">只识别带单位的文字；缺项、范围与多值不猜。右侧可手动确认，确定后才应用。</p>
  </div><div class="spec-review">
   <div class="spec-subtitle">应用前核对 <span id="specCount">0 / 4</span></div>
   <div class="spec-model"><label for="specModel">型号 / 方案名</label><input id="specModel" maxlength="100" placeholder="自定义相机（可不填）" value="${esc(specDraft.model)}"></div>
   <div id="specIssues" class="spec-issues" hidden></div><div class="spec-field-grid">${specFields.map(([k,label,unit,hint,step])=>`<label class="spec-field" for="spec-${k}"><span>${label}<small>${hint}</small></span><div><input id="spec-${k}" type="number" step="${step}" ${['nx','ny'].includes(k)?'min="16" max="16384"':'min="0"'} data-spec-field="${k}" value="${specDraft.fields[k]??''}" placeholder="未提供" aria-describedby="specFieldFeedback"><span>${unit}</span></div><small class="field-origin" id="origin-${k}">待填写</small></label>`).join('')}</div>
   <div class="spec-estimate" id="specEstimate">填写四项后显示像素焦距与估算画幅。</div>
   <div class="spec-apply-row"><button type="button" id="specApply" class="spec-primary" disabled>应用到相机与图示</button><span>整组修改只记一步</span></div>
  </div></div>
  <div class="spec-feedback" id="specFieldFeedback" role="status" aria-live="polite"></div>
  <div class="spec-record" id="specRecord"></div>
  <div class="spec-current" id="specCurrent" role="status"></div>
 </section>`;
}
function hydrateSpecInputs(){
 if(!$('specText'))return;
 $('specText').value=specDraft.text;$('specModel').value=specDraft.model;
 for(const k of CS.coreKeys)$('spec-'+k).value=specDraft.fields[k]??'';
 const models=specDraft.parsed.models||[];
 $('specColumnWrap').hidden=models.length<2;
 $('specColumn').innerHTML=models.map((m,i)=>`<option value="${i}" ${i===specDraft.parsed.column?'selected':''}>${esc(m)}</option>`).join('');
 const meta=specDraft.parsed.metadata,entries=Object.entries(meta),short=[];
 if(meta.aperture)short.push('光圈 '+meta.aperture);
 if(meta.distortion)short.push('畸变 '+meta.distortion);
 if(meta.fov)short.push('原镜头 '+meta.fov);
 $('specRecord').innerHTML=entries.length?`<p class="spec-source-note">${esc(specDraft.source)}。焦距 / 光圈 / 视角属于原表所配镜头，不限定同传感器的其他模组。</p><div class="spec-meta-highlight">${short.map(x=>`<span>${esc(x)}</span>`).join('')}<span class="record-only">仅记录 · 不改光路</span></div><details class="spec-details"><summary>查看其余原表资料与计算边界 <span>${entries.length} 项</span></summary><div class="spec-meta-grid">${entries.map(([k,v])=>`<div><span>${esc(CS.metaLabels[k]||k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div><p>尺寸的英寸标称不换算为毫米；原镜头 FOV 不替代镜面视场。单个畸变百分比不当作校正系数；快门、曝光、帧率等仅记录，未加入图像时序模拟。所有原表数字原样保留，包括最长曝光。</p></details>`:'';
 document.querySelectorAll('[data-camera-preset]').forEach(b=>{const active=b.dataset.cameraPreset===specDraft.preset;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 updateSpecUI();
}
function readSpecInputs(){
 if(!$('specText'))return;
 specDraft.text=$('specText').value;specDraft.model=$('specModel').value.trim();
 for(const k of CS.coreKeys){const input=$('spec-'+k);specDraft.fields[k]=input.value===''?null:input.valueAsNumber;}
}
function specSourceFor(text){
 for(const [id,t] of Object.entries(CS.presets))if(text.trim()===t.trim())return {source:'你提供的规格截图（未外部核验）',preset:id};
 return {source:'用户输入的规格文字（未外部核验）',preset:''};
}
function extractSpec(column=0){
 const text=$('specText')?$('specText').value:specDraft.text;
 const parsed=CS.parse(text,column),source=specSourceFor(text);
 specDraft={text,extractedText:text,parsed,fields:{...parsed.fields},model:parsed.model,...source,feedback:'',confirmed:{}};
 hydrateSpecInputs();
}
function loadCameraPreset(id){
 if(!CS.presets[id])return;
 specDraft.text=CS.presets[id];if($('specText'))$('specText').value=specDraft.text;
 extractSpec();toast(`已提取 ${id}；核对后点击「应用到相机与图示」。`);
}
function useCurrentSpec(){
 const name=cameraProfile?.model||'当前模型';
 const text=`型号：${name}\n分辨率：${state.nx}x${state.ny}\n像素间距：${state.pitch}um\n镜头焦距：${state.f}mm`;
 const parsed=CS.parse(text);
 specDraft={text,extractedText:text,parsed,fields:{...parsed.fields},model:name,source:'当前模型参数快照（不是产品规格）',preset:'',feedback:state.useFpx?'当前在标定模式；这里读取的是保存的物理焦距，不把 fpx 反推成规格。':''};
 hydrateSpecInputs();
}
function renderSpecIssues(){
 const container=$('specIssues');if(!container)return;
 const issues=specDraft.parsed.issues||[];container.hidden=!issues.length;
 container.innerHTML=issues.map((issue,i)=>{
  const resolved=issue.keys.every(k=>typeof specDraft.fields[k]==='number'&&!CS.validate(specDraft.fields).some(e=>e.key===k));
  const chosen=issue.choices?.findIndex(c=>c.nx===specDraft.fields.nx&&c.ny===specDraft.fields.ny);
  return `<div class="spec-issue ${resolved?'resolved':''}"><strong>${resolved?'已明确 · ':''}${esc(issue.message)}</strong><span class="spec-evidence">原文：${esc(issue.evidence)}</span>${issue.kind==='choices'?`<label>本次采集模式 <select data-spec-choice="${i}" aria-label="选择实际采集模式"><option value="">请选择，不自动取第一项</option>${issue.choices.map((c,j)=>`<option value="${j}" ${j===chosen?'selected':''}>${c.nx} × ${c.ny} px</option>`).join('')}</select></label>`:''}</div>`;
 }).join('');
}
function updateSpecUI(){
 if(!$('specApply'))return;
 renderSpecIssues();
 const errors=CS.validate(specDraft.fields),dirty=specDraft.text!==specDraft.extractedText;
 const ready=!errors.length&&!dirty;
 const already=ready&&cameraProfile?.model===(specDraft.model||'自定义相机')&&!state.useFpx&&CS.coreKeys.every(k=>same(state[k],specDraft.fields[k]))&&JSON.stringify(cameraProfile.metadata)===JSON.stringify(specDraft.parsed.metadata)&&cameraProfile.rawText===specDraft.text;
 $('specCount').textContent=`${4-errors.length} / 4${ready?(already?' · 已应用':' · 待应用'):''}`;
 $('specApply').disabled=!ready||already;$('specApply').textContent=already?'已应用到图示':'应用到相机与图示';
 const meta=specDraft.parsed.metadata,feedback=[];
 if(dirty)feedback.push('规格文字已修改，请先点击「提取参数」；不会把旧的提取结果应用到新文字。');
 else if(specDraft.text.trim()||Object.keys(specDraft.fields).length){
  if(errors.length)feedback.push(errors.map(e=>`${specFields.find(r=>r[0]===e.key)[1]}：${e.message}`).join('；'));
  else feedback.push(already?'这组规格已应用；下方滑块可继续微调，上一步可恢复之前的相机。':'四项已就绪，等待应用。确认后同步更新图示，原有镜面形状与视场角保持不变。');
 }
 if(specDraft.feedback)feedback.push(specDraft.feedback);
 if(specDraft.parsed.warnings.length){const issueMessages=(specDraft.parsed.issues||[]).map(i=>i.message);feedback.push(...specDraft.parsed.warnings.filter(w=>!issueMessages.includes(w)));}
 if(state.useFpx&&ready)feedback.push('应用规格将切换为物理焦距估算；现有标定 fpx 保留但停用，可用上一步恢复。');
 $('specFieldFeedback').textContent=feedback.join(' ');
 $('specFieldFeedback').classList.toggle('needs-attention',dirty||errors.length>0||!!specDraft.parsed.warnings.length);
 $('specFieldFeedback').hidden=!feedback.length;
 for(const k of CS.coreKeys){
  const input=$('spec-'+k),err=errors.find(e=>e.key===k);input.setAttribute('aria-invalid',String(!!err&&input.value!==''));
  input.title=err?err.message:(specDraft.parsed.evidence[k]||'手动填写的数值');
  const origin=$('origin-'+k);if(origin){const parsed=specDraft.parsed.fields[k];origin.textContent=dirty?'原文已改 · 请重新提取':err?'待确认':parsed===specDraft.fields[k]?'原文提取 · 未外部核验':specDraft.confirmed?.[k]==='choice'?'已选择采集模式':'手动确认';origin.classList.toggle('confirmed',!err&&!dirty);}
 }
 if(!errors.length){
  const {nx,ny,f,pitch}=specDraft.fields,fp=1000*f/pitch;
  $('specEstimate').innerHTML=`<span>f<sub>px</sub> ≈ <strong>${F(fp,2)} px</strong></span><span>估算画幅 <strong>${F(nx*pitch/1000,3)} × ${F(ny*pitch/1000,3)} mm</strong></span><small>仅在原生采样、方形像素假设下；应用后仍可改用标定值。</small>`;
 }else $('specEstimate').textContent='填写四项后显示像素焦距与估算画幅。';
 updateCurrentCamera();
}
function updateCurrentCamera(){
 const el=$('specCurrent');if(!el)return;
 if(!cameraProfile){el.textContent=`当前图示：通用 / 自定义参数 · ${state.nx} × ${state.ny} px。上方是待应用的规格，不会自动覆盖当前设计。`;return;}
 const changes=CS.coreKeys.filter(k=>!same(state[k],cameraProfile.applied[k]));
 el.innerHTML=`<span class="live-dot"></span><span>当前图示：<strong>${esc(cameraProfile.model)}</strong> · ${state.nx} × ${state.ny} px${changes.length?' · 已手动调整 '+changes.map(k=>specFields.find(x=>x[0]===k)[1]).join('、'):''}${state.useFpx?' · 使用标定 fpx':' · 物理焦距估算'}。来源记录不随调参改写。</span>`;
}
function applyCameraSpec(){
 readSpecInputs();specDraft.feedback='';
 const errors=CS.validate(specDraft.fields);
 if(errors.length||specDraft.text!==specDraft.extractedText){updateSpecUI();return false;}
 const next=Object.fromEntries(CS.coreKeys.map(k=>[k,Number(specDraft.fields[k])]));
 if(state.margin>=(Math.min(next.nx,next.ny)-1)/2){specDraft.feedback='新画幅小于当前安全边距允许的范围，请先减小下方的安全边距；没有自动改动它。';updateSpecUI();return false;}
 const computed=O.compute({...state,...next,useFpx:false});if(!computed.ok){specDraft.feedback='未应用：'+computed.error;updateSpecUI();return false;}
 const model=(specDraft.model||'自定义相机').slice(0,100);
 historyAction('应用相机规格 · '+model,()=>{
  snapshot();state={...state,...next,useFpx:false};
  cameraProfile={model,source:specDraft.source,rawText:specDraft.text,metadata:O.clone(specDraft.parsed.metadata),sourceFields:O.clone(specDraft.parsed.fields),reviewIssues:O.clone(specDraft.parsed.issues||[]),applied:next,editedFields:CS.coreKeys.filter(k=>specDraft.parsed.fields[k]!==next[k]),assumption:'Native sampling and square pixels; reference metadata is not used in ray geometry.'};
  key='f';group='camera';mobileScene='mirror';normalizeSelection();buildPage();render();
 });
 toast('已应用 '+model+'；可用「上一步」整组撤销。');return true;
}
function sanitizeCameraProfile(value){
 if(value===null||value===undefined)return null;
 if(typeof value!=='object'||Array.isArray(value)||CS.validate(value.applied||{}).length)throw new Error('相机来源记录中的应用参数不完整。');
 const text=(v,n)=>typeof v==='string'?v.slice(0,n):'';
 const metadata={};for(const k of Object.keys(CS.metaLabels))if(typeof value.metadata?.[k]==='string')metadata[k]=text(value.metadata[k],600);
 const sourceFields={};for(const k of CS.coreKeys)if(Number.isFinite(value.sourceFields?.[k]))sourceFields[k]=value.sourceFields[k];
 return {model:text(value.model,100)||'载入的相机',source:text(value.source,400),rawText:text(value.rawText,20000),metadata,sourceFields,reviewIssues:Array.isArray(value.reviewIssues)?value.reviewIssues.slice(0,50).map(x=>({field:text(x.field,30),message:text(x.message,500),evidence:text(x.evidence,1000)})):[],applied:Object.fromEntries(CS.coreKeys.map(k=>[k,Number(value.applied[k])])),editedFields:CS.coreKeys.filter(k=>sourceFields[k]!==Number(value.applied[k])),assumption:text(value.assumption,300)};
}

function save(name,type,body){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function validExport(){if(!g.ok){toast('参数无效，暂不能导出。');return false;}return true;}
function exportJSON(){if(!validExport())return;save('catadioptric_candidate.json','application/json',JSON.stringify({schema:'catadioptric-lab-v1',uiVersion:APP_VERSION,status:'IDEAL_GEOMETRY_ONLY_NOT_HARDWARE_VALIDATED',units:{length:'mm',pixelPitch:'um',angle:'degree'},parameters:state,cameraSpec:cameraProfile,results:g,assumptions:'aligned pinhole, square pixels, centered principal point; no focus, distortion, aperture, supports, rolling shutter or manufacturing model'},null,2));}
function exportCSV(){if(!validExport())return;const rows=['theta_deg,mirror_r_mm,mirror_z_mm,image_radius_px,azimuth_px_per_deg,elevation_px_per_deg,full_ring_with_margin,azimuth_fraction_on_sensor'];for(let i=0;i<=360;i++){const th=g.lo+(g.hi-g.lo)*i/360,rr=O.rAt(th,g.a,g.b),rho=O.rhoAt(rr,g.a,g.b,g.fp),d=O.resolution(rr,g.a,g.b,g.fp);rows.push([th,rr,O.zAt(rr,g.a,g.b),rho,d.azimuthPxPerDeg,d.elevationPxPerDeg,rho<=g.lim?1:0,O.coverageAtRho(rho,g.hx,g.hy)].join(','));}save('angular_mapping.csv','text/csv;charset=utf-8',rows.join('\n')+'\n');}
function exportXYZ(){if(!validExport())return;const rows=[];for(let i=0;i<=400;i++){const r=g.rout*i/400;rows.push(`${F(r,9)} 0.000000000 ${F(O.zAt(r,g.a,g.b),9)}`);}save('mirror_half_profile_mm.xyz','text/plain',rows.join('\n')+'\n');}
// v4: visible page navigation, shared state, and simultaneous high-frequency controls.
// v7 retains the normal-domain geometry and adds explicit validation and recovery.
const ICONS={
 design:'<path d="M3 17h18M5 7q7 12 14 0M12 3v4m0 10v4"/><circle cx="12" cy="12" r="1.3"/>',
 camera:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.4"/>',
 panorama:'<path d="M3 6q9 4 18 0v12q-9-4-18 0Z"/><path d="m3 14 5-5 5 5 4-4 4 4"/>',
 assembly:'<path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="6"/><path d="m10 12 2-2 2 2m-2-2v5"/>',
 formulas:'<path d="M5 4h14M5 20h14M16 4 8 12l8 8"/>',
 files:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 14h8m-8 3h5"/>',
 arrow:'<path d="m9 5 7 7-7 7"/>',pin:'<path d="M8 3h8l-1 7 3 4H6l3-4ZM12 14v7"/>'};
const icon=id=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]||ICONS.arrow}</svg>`;
const PAGES={
 design:{title:'光学设计',eyebrow:'01 / DESIGN',desc:'调镜面、视野和镜头，在同一张图里看变化。'},
 camera:{title:'相机与采样',eyebrow:'02 / CAMERA',desc:'输入或载入相机规格，核对后应用，再用滑块看成像变化。'},
 panorama:{title:'全景与姿态',eyebrow:'03 / PANORAMA',desc:'从环形图到全景，观察旋转、倾斜与校正的影响。'},
 assembly:{title:'装调敏感性',eyebrow:'04 / ALIGNMENT',desc:'镜面保持不动，看看镜头离开焦点后会发生什么。'},
 formulas:{title:'公式与假设',eyebrow:'05 / REFERENCE',desc:'14 组公式全部列在这里；数值与当前设计同步。'},
 files:{title:'方案与导出',eyebrow:'06 / WORKSPACE',desc:'对比设计、检查完整参数，导出计算结果与镜面截面。'}
};
const symbols={scale:'s',a0:'a₀',b0:'b₀',lo:'θmin',hi:'θmax',inspect:'θ',rin0:'r₀',rout0:'R₀',f:'f',fpx:'fpx',pitch:'p',nx:'Nₓ',ny:'Nᵧ',margin:'m',yaw:'ψ',tilt:'β',panoWidth:'W',dx:'Δx',dz:'Δz'};
const labels={scale:'整体大小',a0:'纵向形状',b0:'径向形状',lo:'下方视野',hi:'上方视野',inspect:'观察方向',rin0:'有效内半径',rout0:'镜片外半径',f:'镜头焦距',fpx:'标定焦距',pitch:'像素间距',nx:'图像宽度',ny:'图像高度',margin:'预留边距',yaw:'左右转向',tilt:'整机倾斜',panoWidth:'展开宽度',dx:'横向错位',dz:'轴向错位'};
const helps={
 scale:'镜面与镜头间距一起缩放；圆环不变。',a0:'改纵向曲线形状，不是镜片厚度。',b0:'改曲面张开形状，不是镜片半径。',
 lo:'负值看下方 → 改变圆环内圈。',hi:'正值看上方 → 改变镜片外缘。',inspect:'沿光路移动橙色探针，不改设计。',
 f:'越长，成像圆环越大；镜面不动。',pitch:'像素数固定，间距会改变物理画幅。',
 nx:'增加列数，不是拉伸现有图像。',ny:'增加行数，圆环的像素半径不变。',margin:'只改验算边界，不裁掉原始像素。',
 rin0:'选用范围的内边界，不是开孔。',rout0:'截取到此半径；曲面形状不变。',
 fpx:'直接输入当前图像的标定焦距。',yaw:'环形图旋转，全景左右循环移动。',tilt:'整套相机倾斜，镜头没有离开焦点。',
 panoWidth:'只改输出采样，不增加光学细节。',dx:'只将投影中心左右移开。',dz:'正值靠近镜面；不是整体缩放。'};

// HISTORY: document changes are separate from page navigation and plot zoom.
// A slider gesture / numeric edit is a single transaction, not one entry per frame.
const HISTORY_LIMIT=100;
let undoStack=[],redoStack=[],pendingEdit=null,historyApplying=false;
function historyDocument(){
 return {state:O.clone(state),baseline:O.clone(baseline),pinned,stabilize,panoMode,geomZoom,sensorZoom,showGhost,cameraProfile:O.clone(cameraProfile),baselineCameraProfile:O.clone(baselineCameraProfile)};
}
function sameDocument(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function editDescription(k,a,b){
 if(!P[k])return '修改参数';
 return `${labels[k]} ${F(a.state[k],P[k].n)} → ${F(b.state[k],P[k].n)} ${P[k].unit}`;
}
function appendHistory(start,end,label,sourcePage,paramKey=null){
 if(historyApplying||sameDocument(start,end)){updateHistoryUI();return false;}
 undoStack.push({start,end,label,page:sourcePage,key:paramKey});
 if(undoStack.length>HISTORY_LIMIT)undoStack.shift();
 redoStack=[];updateHistoryUI();scheduleLocalSave();return true;
}
function beginParameterEdit(k,element){
 if(historyApplying||!P[k])return;
 if(pendingEdit&&pendingEdit.element===element&&pendingEdit.key===k)return;
 commitPendingEdit();
 pendingEdit={start:historyDocument(),page,key:k,element,pointer:false,keyboard:false};
 snapshot();
}
function commitPendingEdit(){
 if(!pendingEdit||historyApplying)return false;
 const edit=pendingEdit;pendingEdit=null;
 // Apply the same derived-probe normalization as the normal renderer, even
 // when pointerup occurs before the next requestAnimationFrame callback.
 g=O.compute(state);if(g.ok)state.inspect=g.inspect;
 const end=historyDocument();
 const changed=appendHistory(edit.start,end,editDescription(edit.key,edit.start,end),edit.page,edit.key);
 updateHistoryUI();return changed;
}
function historyAction(label,apply,paramKey=null){
 commitPendingEdit();
 const start=historyDocument(),sourcePage=page;
 apply();
 g=O.compute(state);if(g.ok)state.inspect=g.inspect;
 appendHistory(start,historyDocument(),label,sourcePage,paramKey);
}
function updateHistoryUI(){
 if(!$('historyUndo'))return;
 const dirty=!!pendingEdit&&!sameDocument(pendingEdit.start,historyDocument());
 const canUndo=dirty||undoStack.length>0,canRedo=!dirty&&redoStack.length>0;
 $('historyUndo').disabled=!canUndo;$('historyRedo').disabled=!canRedo;
 const last=undoStack.at(-1),next=redoStack.at(-1);
 const label=dirty?editDescription(pendingEdit.key,pendingEdit.start,historyDocument()):last?.label;
 $('historyUndo').title=canUndo?`撤销：${label}（Ctrl / ⌘ Z）`:'还没有可以撤销的修改';
 $('historyRedo').title=canRedo?`重做：${next.label}（Ctrl / ⌘ Shift Z 或 Ctrl Y）`:'没有待重做的修改；先用「上一步」撤销';
 $('historyUndo').setAttribute('aria-label',canUndo?'上一步：撤销 '+label:'上一步：暂无可撤销的修改');
 $('historyRedo').setAttribute('aria-label',canRedo?'下一步：重做 '+next.label:'下一步：暂无可重做的修改');
 $('historyPosition').textContent=`${undoStack.length} / ${undoStack.length+redoStack.length}`;
 const message=dirty?`正在调整 · ${label}`:last?`当前 · ${last.label}`:next?'已回到本段记录起点 · 可点下一步重做':'调参撤销 / 重做 · 一次拖动记一步';
 $('historyNote').textContent=message;
 $('historyNote').title=message+(last?`（${PAGES[last.page].title}）`:'')+'；撤销历史仅在本次打开期间保留，本地恢复另存最后有效设计。';
 $('historyBar').classList.toggle('is-editing',dirty);
}
function restoreHistoryDocument(doc){
 const leaving=O.clone(state);
 state=O.clone(doc.state);baseline=O.clone(doc.baseline);pinned=doc.pinned;
 stabilize=doc.stabilize;panoMode=doc.panoMode;
 geomZoom=doc.geomZoom??1;sensorZoom=doc.sensorZoom??1;showGhost=doc.showGhost??true;$('ghost').checked=showGhost;
 cameraProfile=O.clone(doc.cameraProfile??null);baselineCameraProfile=O.clone(doc.baselineCameraProfile??null);
 before=O.clone(pinned?baseline:leaving);
 normalizeSelection();buildPage();render();
}
function historyMove(direction){
 commitPendingEdit();
 const from=direction==='undo'?undoStack:redoStack,to=direction==='undo'?redoStack:undoStack;
 if(!from.length){updateHistoryUI();return false;}
 const entry=from.pop();to.push(entry);
 historyApplying=true;
 try{restoreHistoryDocument(direction==='undo'?entry.start:entry.end);}
 finally{historyApplying=false;updateHistoryUI();scheduleLocalSave();}
 toast(`${direction==='undo'?'已撤销':'已重做'}：${entry.label}`);return true;
}
function undoEdit(){return historyMove('undo');}
function redoEdit(){return historyMove('redo');}
function textEditingTarget(el){
 return !!el?.closest('textarea,[contenteditable="true"],[contenteditable=""],input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])');
}

function navigate(id,focusParam=null){
 if(!PAGES[id])return;
 commitPendingEdit();
 page=id;experiment=page==='panorama'?'pose':page==='assembly'?'assembly':'optics';
 if(focusParam&&P[focusParam])key=focusParam;
 else if(page==='design'&&!['a0','b0','scale','lo','hi','rin0','rout0','inspect','f','fpx','pitch'].includes(key))key='scale';
 else if(page==='camera'&&!['f','fpx','pitch','nx','ny','margin','inspect'].includes(key))key=state.useFpx?'fpx':'f';
 else if(page==='panorama'&&P[key].group!=='pose')key='tilt';
 else if(page==='assembly'&&P[key].group!=='assembly')key='dx';
 normalizeSelection();group=P[key].group;
 if(page==='camera')mobileScene='mirror';else if(page==='design')mobileScene=group==='camera'?'sensor':'mirror';else mobileScene='mirror';
 buildPage();render();if(localSaved&&!localPending)scheduleLocalSave();window.scrollTo({top:0,behavior:'instant'});
}
function normalizeSelection(){
 if(key==='f'&&state.useFpx)key='fpx';if(key==='fpx'&&!state.useFpx)key='f';
 if(state.mode==='radii'&&key==='lo')key='rin0';if(state.mode==='radii'&&key==='hi')key='rout0';
 if(state.mode==='angles'&&key==='rin0')key='lo';if(state.mode==='angles'&&key==='rout0')key='hi';
 group=P[key].group;
}
function snapshot(){before=O.clone(pinned?baseline:state);}
function focusParameter(k){if(!P[k])return;key=k;normalizeSelection();if(page==='design')mobileScene=group==='camera'?'sensor':'mirror';request();}
function selectParam(k){
 if(!P[k])return;
 const destination=P[k].group==='pose'?'panorama':P[k].group==='assembly'?'assembly':['nx','ny','margin','fpx'].includes(k)?'camera':'design';
 if(page==='camera'&&['f','fpx','pitch','nx','ny','margin','inspect'].includes(k)){focusParameter(k);return;}
 if(page===destination){focusParameter(k);return;}
 navigate(destination,k);
}
function bounds(k){
 const p=P[k];let min=p.min,max=p.max;
 if(g.ok){
  if(k==='lo')max=Math.min(35,g.hi-1);
  if(k==='hi'){min=Math.max(-30,g.lo+1);max=Math.min(75,Math.floor((g.limit-.2)*2)/2);}
  if(k==='inspect'){min=Math.ceil(g.lo*2)/2;max=Math.floor(g.hi*2)/2;}
  if(k==='rin0')max=Math.min(20,state.rout0-.1);
  if(k==='rout0')min=Math.max(1,state.rin0+.1);
  if(k==='margin')max=Math.min(150,Math.floor((Math.min(state.nx,state.ny)-1)/2-1));
 }
 min=Math.min(min,state[k]);max=Math.max(max,state[k]);if(!(max>min))max=min+1;
 return {min,max,step:p.step};
}
function parameter(k){
 const p=P[k],b=bounds(k);
 return `<div class="parameter ${key===k?'active':''}" data-control="${k}"><div class="parameter-line"><button class="parameter-label" data-focus="${k}" title="${esc(p.title)}">${labels[k]}<em>${symbols[k]}</em></button><div class="param-value"><input data-input="${k}" type="number" value="${F(state[k],p.n)}" step="${p.step}" aria-label="${labels[k]}数值"><span>${p.unit}</span></div></div><input type="range" class="slider" data-slider="${k}" min="${b.min}" max="${b.max}" step="${b.step}" value="${state[k]}" aria-label="${labels[k]}滑块" aria-describedby="help-${k}"><p class="param-help" id="help-${k}">${esc(k==='pitch'&&state.useFpx?'标定 fpx 固定，圆环像素半径不变。':helps[k])}</p></div>`;
}
function card(title,tone,fields,extra='',head=''){
 return `<section class="control-card ${tone}"><div class="card-heading"><h3><i class="card-dot" aria-hidden="true"></i>${title}</h3>${head}</div>${tone==='fov'&&head?`<p class="constraint-note">${state.mode==='angles'?'固定视场 → 反算镜片尺寸':'固定镜片尺寸 → 计算视场'}</p>`:''}${fields.map(parameter).join('')}${extra}</section>`;
}
function modeSelect(){return `<select class="mode-select" id="mode" aria-label="镜面截取约束"><option value="angles" ${state.mode==='angles'?'selected':''}>按视场角度</option><option value="radii" ${state.mode==='radii'?'selected':''}>按镜片尺寸</option></select>`;}
function lensSelector(){return `<div class="segmented" aria-label="焦距计算方式"><button data-fpx="false" class="${!state.useFpx?'active':''}" aria-pressed="${!state.useFpx}">物理焦距估算</button><button data-fpx="true" class="${state.useFpx?'active':''}" aria-pressed="${state.useFpx}">使用标定 fpx</button></div>`;}
function topHeading(title,note){return `<div class="controls-heading"><h2>${title}</h2><p>${note}</p></div>`;}
function buildPage(){
 $('pageTitle').textContent=PAGES[page].title;$('pageEyebrow').textContent=PAGES[page].eyebrow;$('pageDescription').textContent=PAGES[page].desc;
 document.title='折反射实验台 v7 · '+PAGES[page].title;
 document.querySelectorAll('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===page);if(b.dataset.nav===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $('stage').hidden=['formulas','files'].includes(page);
 $('bottomNotes').hidden=page==='formulas';
 let html='';
 if(page==='design'){
  html=topHeading('常用参数','拖动即更新 · 点击标签高亮图中部位')+'<div class="control-grid">'+
  card('镜面','mirror',['a0','b0','scale'])+
  card('视野','fov',state.mode==='angles'?['lo','hi','inspect']:['rin0','rout0','inspect'],'',modeSelect())+
  card('镜头','camera',[state.useFpx?'fpx':'f','pitch'],`<div class="card-bottom"><span>当前画幅</span><strong id="sensorSummary"></strong><button data-page="camera">相机与采样 ↗</button></div><p class="field-hint">画幅、标定模式和采样密度，都在左侧「相机与采样」。</p>`, '<small>不限定型号</small>')+'</div>';
 }else if(page==='camera'){
  html=specificationHTML()+topHeading('继续微调','应用规格后，下方滑块与图示实时联动')+'<div class="control-grid">'+
  `<section class="control-card camera"><div class="card-heading"><h3><i class="card-dot"></i>镜头与投影</h3></div>${lensSelector()}${parameter(state.useFpx?'fpx':'f')}${parameter('pitch')}<div class="card-bottom"><span>当前 fpx</span><strong id="fpxSummary"></strong></div><p class="field-hint">估算模式按原生采样、方形像素处理。标定值应对应当前输出分辨率。</p></section>`+
  card('传感器画幅','camera',['nx','ny','margin'],`<div class="card-bottom"><span id="physicalSummary"></span><button id="doubleDensity">同画幅加密 ×2 ↗</button></div>`)+
  card('方向采样','fov',['inspect'],`<div id="sampleStats"></div><p class="readout-note">方位采样与俯仰采样分开计算。px/° 是理想采样密度，不是标定精度或实际分辨能力。</p>`)+ '</div>';
 }else if(page==='panorama'){
  html=topHeading('全景实验','所有参数共享当前镜面与相机设计')+'<div class="control-grid">'+
  card('转动与倾斜','pose',['yaw','tilt'],`<div class="card-bottom"><button id="poseZero">姿态归零 ↶</button><span>不改变镜面几何</span></div>`)+
  card('展开与校正','pose',['panoWidth'],`<label class="checkline"><input type="checkbox" id="stabilize" ${stabilize?'checked':''}>开启理想姿态校正</label><p id="stabilizeNote" class="field-hint">校正对等俯仰展开生效；缺失方向仍保留棋盘格。</p><div class="card-bottom"><button id="switchProjection">切换展开方式 ⇄</button></div>`)+
  `<section class="control-card info-card"><div class="card-heading"><h3><i class="card-dot"></i>这张图在说明什么</h3></div><div id="panoStats"></div><p class="field-hint">这是按方向生成的合成纹理，用来比较几何变化；不是拍摄样片，也没有模拟环境平移视差。</p><button class="text-button" data-page="design">回光学设计调整可见视场 ↗</button></section>`+'</div>';
 }else if(page==='assembly'){
  html=topHeading('装配误差实验','反向追迹 · 只采样二维轴截面')+'<div class="control-grid">'+
  card('投影中心偏移','assembly',['dx','dz'],`<div class="card-bottom"><button id="alignmentZero">回到理想焦点 ↶</button><span>镜面保持不动</span></div>`)+
  `<section class="control-card assembly"><div class="card-heading"><h3><i class="card-dot"></i>方向误差</h3></div><div id="toleranceStats"></div><p class="readout-note">将实际反射方向与设计时方向比较。这里的最大值只是采样最大值，不是三维全局最坏情况。</p></section>`+
  `<section class="control-card info-card"><div class="card-heading"><h3><i class="card-dot"></i>分清三种改变</h3></div><div class="small-stat"><span>整体大小 s</span><span>整个几何一起缩放</span></div><div class="small-stat"><span>镜头焦距 f</span><span>只改成像倍率</span></div><div class="small-stat"><span>轴向错位 Δz</span><span>只把镜头移离焦点</span></div><p class="field-hint">偏移只在本页反射追迹中生效；光学与全景页仍采用理想同轴模型。离轴后不能再默认光线经过原来的 V。</p><button class="text-button" data-formula="13">查看反射公式 ↗</button></section>`+'</div>';
 }else if(page==='formulas'){
  html=`<div class="model-banner"><span>当前设计的实时计算，不是静态公式表</span><strong id="formulaContext"></strong></div><div class="formula-grid">`+formulas.map(([n,t,eq,desc])=>`<article class="formula-card" id="formula-${n}"><header><span class="formula-number">${n}</span><h3>${t}</h3></header><div class="equation">${eq}</div><div class="formula-live" id="live-${n}"></div><p>${desc}</p><button class="text-button" data-formula-action="${n}">到对应页面调整 ↗</button></article>`).join('')+`</div><section class="source-box"><h3>来源与模型边界</h3><p>本版保留原有理想几何公式，并补强计算域与结果校验：理想针孔相机、旋转双曲面镜、方形像素、居中主点。合成全景不代表实物画质。实际对焦、有限孔径、畸变、支架遮挡、镀膜与滚动快门均未建模。装调页使用独立反射计算，但只检查二维截面。</p><a href="https://www.cs.columbia.edu/CAVE/publications/pdfs/Baker_IJCV99.pdf" target="_blank" rel="noopener noreferrer">[1] Baker &amp; Nayar · 单视点折反射相机（IJCV, 1999）</a><a href="https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html" target="_blank" rel="noopener noreferrer">[2] OpenCV · 针孔相机模型与标定</a><a href="https://docs.opencv.org/4.13.0/dd/d12/tutorial_omnidir_calib_main.html" target="_blank" rel="noopener noreferrer">[3] OpenCV · 全向相机标定</a><p>上面大部分闭式关系是本坐标约定下的推导；公式标注了它们与基础模型的对应关系。参考链接主动点击才会联网。</p></section>`;
 }else{
  html=localSettingsHTML()+`<div class="document-grid"><section class="document-card"><h2>与保存的基线比较</h2><p>各页面共用同一份设计。保存基线后可以固定叠加轮廓，不会被下一次拖动覆盖。</p><div class="compare-actions"><button class="outline-button" id="saveBaseline">保存当前为基线</button><label class="checkline"><input type="checkbox" id="pinBaseline" ${pinned?'checked':''}>图示固定对照基线</label></div><div class="table-wrap" id="compareTable"></div><div class="support-actions"><button class="text-button" id="restoreBaseline">恢复基线参数 ↶</button><button class="text-button" data-page="design">回光学设计 ↗</button></div></section><section class="document-card"><h2>参数与几何文件</h2><p>单文件离线运行。导出结果是理想模型计算，不是制造图纸。</p><button class="file-button" id="exportJSON"><span><strong>保存当前参数</strong><small>参数、来源规格、结果与模型假设</small></span><span class="file-tag">JSON ↗</span></button><button class="file-button" id="importBtn"><span><strong>载入已有方案</strong><small>兼容旧版 JSON；新版同时保存相机规格</small></span><span class="file-tag">导入 ↗</span></button><button class="file-button" id="exportCSV"><span><strong>角度与像素映射表</strong><small>俯仰角 → 镜面半径 → 像素半径</small></span><span class="file-tag">CSV ↗</span></button><button class="file-button" id="exportXYZ"><span><strong>镜面截面采样</strong><small>毫米坐标，可作 CAD 曲线输入</small></span><span class="file-tag">XYZ ↗</span></button><p class="readout-note">不会自动读取旧页面中的修改。重要方案仍建议导出；可用下方的本地恢复防止丢失；JSON 才是跨浏览器 / 跨文件的可携带备份。</p></section></div><section class="document-card param-table"><h2>完整参数一览<span class="badge">可直接编辑数值</span></h2><p>非当前模式使用的字段会明确标为「未启用」，避免误以为修改已经影响结果。</p><div class="table-wrap"><table><thead><tr><th>参数</th><th>当前值</th><th>单位 / 状态</th><th>图示入口</th></tr></thead><tbody>${Object.keys(P).map(k=>`<tr><td>${labels[k]} <span class="mono">${symbols[k]}</span></td><td><input type="number" data-table="${k}" step="${P[k].step}" value="${state[k]}" aria-label="完整参数 ${labels[k]}"></td><td id="table-mode-${k}">${P[k].unit}</td><td><button class="text-button" data-jump="${k}">到图中调整 ↗</button></td></tr>`).join('')}</tbody></table></div></section>`;
 }
 $('pageContent').innerHTML=html;
 if(page==='camera')hydrateSpecInputs();
}
function chartSVG(kind){
 const W=500,H=365,left=55,right=463,top=76,bottom=289,B=O.compute(before);
 const n=100,xx=t=>left+(t-g.lo)/(g.hi-g.lo)*(right-left);
 let s='',values=[],old=[];
 if(kind==='density'){
  for(let i=0;i<=n;i++){const th=g.lo+(g.hi-g.lo)*i/n,r=O.rAt(th,g.a,g.b),d=O.resolution(r,g.a,g.b,g.fp);values.push({x:th,a:d.azimuthPxPerDeg,b:d.elevationPxPerDeg});}
  if(showGhost&&B.ok)for(let i=0;i<=n;i++){const th=g.lo+(g.hi-g.lo)*i/n;if(th>=B.lo&&th<=B.hi){const r=O.rAt(th,B.a,B.b),d=O.resolution(r,B.a,B.b,B.fp);old.push({x:th,a:d.azimuthPxPerDeg,b:d.elevationPxPerDeg});}}
 }else{
  for(let i=0;i<=n;i++){const th=g.lo+(g.hi-g.lo)*(i+.001)/(n+.002),r=O.rAt(th,g.a,g.b);values.push({x:th,a:O.traceAt(r,g.a,g.b,state.dx,state.dz).angleError,b:O.traceAt(-r,g.a,g.b,state.dx,state.dz).angleError});}
  if(showGhost&&B.ok)for(let i=0;i<=n;i++){const th=g.lo+(g.hi-g.lo)*(i+.001)/(n+.002);if(th>=B.lo&&th<=B.hi){const r=O.rAt(th,B.a,B.b);old.push({x:th,a:O.traceAt(r,B.a,B.b,before.dx,before.dz).angleError,b:O.traceAt(-r,B.a,B.b,before.dx,before.dz).angleError});}}
 }
 const vmax=Math.max(kind==='density'?15:.01,...values.concat(old).flatMap(d=>[Math.abs(d.a),Math.abs(d.b)]).filter(Number.isFinite)),limit=kind==='density'?Math.ceil(vmax/5)*5:vmax*1.2;
 const ymin=kind==='density'?0:-limit,ymax=limit,yy=v=>bottom-(v-ymin)/(ymax-ymin)*(bottom-top);
 for(let i=0;i<=4;i++){const val=ymin+(ymax-ymin)*i/4,y=yy(val);s+=line(left,y,right,y,'#eaf0e6',1);s+=txt(left-10,y+4,F(val,kind==='density'?0:(limit<.1?3:1)),'#99aa8f',11,'end');}
 for(let i=0;i<=4;i++){const t=g.lo+(g.hi-g.lo)*i/4,x=xx(t);s+=txt(x,bottom+20,F(t,0)+'°','#99aa8f',11,'middle');}
 s+=txt(left,top-17,kind==='density'?'px / °':'方向差 / °',C.muted,11);
 const path=(array,k)=>array.filter(d=>Number.isFinite(d[k])).map((d,i)=>(i?'L':'M')+F(xx(d.x),2)+' '+F(yy(d[k]),2)).join(' ');
 s+=`<defs><clipPath id="curve-clip"><rect x="${left}" y="${top-2}" width="${right-left}" height="${bottom-top+4}"/></clipPath></defs><g clip-path="url(#curve-clip)">`;
 if(old.length)for(const k of ['a','b'])s+=`<path data-drawing="old-chart-${k}" d="${path(old,k)}" fill="none" stroke="${C.ghost}" stroke-width="1.3" stroke-dasharray="4 5"/>`;
 const colors=kind==='density'?[C.accent,C.blue]:[C.red,C.purple];
 for(const [i,k] of ['a','b'].entries())s+=`<path data-drawing="chart-${k}" d="${path(values,k)}" fill="none" stroke="${colors[i]}" stroke-width="2.3"/>`;
 if(kind==='density'){
  s+=line(xx(g.inspect),top,xx(g.inspect),bottom,C.amber,1,'stroke-dasharray="3 4"');
  s+=circle(xx(g.inspect),yy(g.azimuthPxPerDeg),4,C.accent,'stroke="white" stroke-width="1.5"')+circle(xx(g.inspect),yy(g.elevationPxPerDeg),4,C.blue,'stroke="white" stroke-width="1.5"');
 }
 s+='</g>';
 s+=line(302,top-20,319,top-20,colors[0],2)+txt(325,top-16,kind==='density'?'方位':'右侧',colors[0],11);
 s+=line(389,top-20,406,top-20,colors[1],2)+txt(412,top-16,kind==='density'?'俯仰':'左侧',colors[1],11);
 s+=txt((left+right)/2,bottom+40,'观察俯仰角 θ',C.muted,11,'middle');
 return svg(W,H,kind==='density'?'各俯仰位置的像素采样密度':'左右镜面反射方向的采样误差',s);
}
function outcome(){
 if(!g.ok)return g.error;
 const B=O.compute(before),changed=B.ok&&!same(Number(state[key]),Number(before[key]));
 if(page==='assembly')return Math.hypot(state.dx,state.dz)<1e-9?'镜头位于设计焦点，光线延长线经过 V。':`仅移动镜头；采样方向差 RMS ${F(tolResult.rmsAngle,2)}°。`;
 if(page==='panorama')return key==='yaw'?`转向 ${F(state.yaw,0)}°，展开图左右循环移动。`:key==='tilt'?(stabilize&&panoMode==='equal'?'已重排拍到的方向；未拍到的部分无法恢复。':'观察地平线随倾斜产生的弯曲。'):`输出 ${F(state.panoWidth,0)} px；预览最多 1200 px。`;
 if(!changed)return key==='pitch'&&state.useFpx?'标定 fpx 固定，物理尺寸变化但圆环像素半径不变。':helps[key];
 if(key==='scale')return `外径 ${F(B.diameter,1)} → ${F(g.diameter,1)} mm；圆环不变。`;
 if(['a0','b0','rout0','hi'].includes(key))return `外径 ${F(B.diameter,1)} → ${F(g.diameter,1)} mm，外圈 ${F(g.ro,0)} px。`;
 if(['lo','rin0'].includes(key))return `内圈 ${F(B.ri,0)} → ${F(g.ri,0)} px；外缘不变。`;
 if(['f','fpx'].includes(key)||key==='pitch'&&!state.useFpx)return `成像倍率改变 → 外圈 ${F(B.ro,0)} → ${F(g.ro,0)} px；镜面不变。`;
 if(key==='pitch')return `物理画幅 ${F(g.sensorW,2)} × ${F(g.sensorH,2)} mm；圆环像素半径不变。`;
 if(key==='inspect')return `θ ${F(g.inspect,1)}° → 镜面 r ${F(g.r,1)} mm → 图像 ρ ${F(g.rho,0)} px。`;
 if(key==='margin')return `安全半径 ${F(B.lim,0)} → ${F(g.lim,0)} px；实际图像不变。`;
 return `画幅 ${state.nx} × ${state.ny} px；圆环像素半径不变。`;
}
function renderStage(){
 if(['files','formulas'].includes(page))return;
 $('stage').dataset.frame=String(++frame);$('stage').dataset.parameter=key;$('stage').dataset.viewPage=page;
 const pano=page==='panorama';$('mainScenes').hidden=pano;$('panoScenes').hidden=!pano;$('mobileSwitch').hidden=pano;
 $('ghostLabel').hidden=pano;$('fitView').hidden=pano;$('resetView').hidden=pano;
 $('mirrorScene').classList.toggle('mobile-active',mobileScene==='mirror');$('sensorScene').classList.toggle('mobile-active',mobileScene==='sensor');
 const mobileLabels=page==='camera'?['成像','采样']:page==='assembly'?['光路','误差']:['实物','成像'];
 document.querySelectorAll('[data-scene]').forEach((b,i)=>{b.textContent=mobileLabels[i];b.classList.toggle('active',b.dataset.scene===mobileScene);b.setAttribute('aria-pressed',String(b.dataset.scene===mobileScene));});
 $('stageTitle').textContent=page==='camera'?'成像与角度采样':pano?'全景展开实验':page==='assembly'?'装调反射光路':'实时光路';
 $('ghostText').textContent=pinned?'对照保存基线':'对照调整前';
 $('responseKey').textContent=labels[key]+' '+symbols[key];
 if(!g.ok){
  for(const id of ['mirrorVisual','sensorVisual'])$(id).innerHTML='<div class="error-state"><div>当前参数没有有效几何解。<br><button data-undo>撤回本次调整 ↶</button></div></div>';
  for(const id of ['rawCanvas','equalCanvas','linearCanvas']){const c=$(id);c.getContext('2d').clearRect(0,0,c.width,c.height);}
  $('stageMetrics').innerHTML='';$('mirrorFoot').textContent='';$('sensorFoot').textContent='';$('responseText').textContent=g.error;$('responseText').className='response-text warn';return;
 }
 if(page==='design'){
  $('mirrorHeading').textContent='镜面与镜头';$('mirrorTag').textContent='实物空间 / mm';
  $('sensorHeading').textContent='相机拍到的圆环';$('sensorTag').textContent='像素空间 / px';
  $('mirrorVisual').innerHTML=mirrorSVG();$('sensorVisual').innerHTML=sensorSVG();
  $('mirrorFoot').textContent=key==='scale'?'固定毫米视尺 · 实体缩小，图中真的变小':group==='camera'?'镜面几何保持不变':group==='fov'?'边界光线决定选用的镜面范围':'a、b 是曲面形状参数，不是厚度或外径';
  $('sensorFoot').textContent=g.fits?`安全余量 +${F(g.lim-g.ro,1)} px`:g.physicalFits?`距安全边界还差 ${F(g.ro-g.lim,1)} px（尚未实际裁切）`:`圆环超出安全边界 ${F(g.ro-g.lim,1)} px`;
  $('sensorFoot').className='scene-foot'+(!g.fits?' warn':'');
  $('stageMetrics').innerHTML=`<div><span>镜面外径</span><strong>${F(g.diameter,1)} mm</strong></div><div><span>垂直视场</span><strong>${F(g.hi-g.lo,0)}°</strong></div>`;
 }else if(page==='camera'){
  $('mirrorHeading').textContent='圆环与传感器';$('mirrorTag').textContent='固定像素视尺';
  $('sensorHeading').textContent='每一度有多少像素';$('sensorTag').textContent='理想采样';
  $('mirrorVisual').innerHTML=sensorSVG();$('sensorVisual').innerHTML=chartSVG('density');
  $('mirrorFoot').textContent=g.fits?`安全余量 +${F(g.lim-g.ro,1)} px`:g.physicalFits?`未裁切 · 安全余量 ${F(g.lim-g.ro,1)} px`:`存在裁切 · 安全余量 ${F(g.lim-g.ro,1)} px`;$('mirrorFoot').className='scene-foot'+(!g.fits?' warn':'');
  $('sensorFoot').textContent='坐标轴按当前与对照共同取景';$('sensorFoot').className='scene-foot';
  $('stageMetrics').innerHTML=`<div><span>外圈半径</span><strong>${F(g.ro,1)} px</strong></div><div><span>安全上限</span><strong>${F(g.lim,1)} px</strong></div>`;
 }else if(page==='assembly'){
  tolResult=O.tolerance(g,state.dx,state.dz,140);
  $('mirrorHeading').textContent='镜面不动，只移动镜头';$('mirrorTag').textContent='反向光路';
  $('sensorHeading').textContent='左右镜面方向误差';$('sensorTag').textContent='二维截面';
  $('mirrorVisual').innerHTML=mirrorSVG();$('sensorVisual').innerHTML=chartSVG('error');
  $('mirrorFoot').textContent=`投影中心 C′ = (${F(state.dx,2)}, ${F(state.dz,2)}) mm`;$('mirrorFoot').className='scene-foot';
  $('sensorFoot').textContent='红 / 紫：右 / 左侧；灰色虚线：对照';$('sensorFoot').className='scene-foot';
  $('stageMetrics').innerHTML=`<div><span>方向差 RMS</span><strong>${F(tolResult.rmsAngle,2)}°</strong></div><div><span>采样最大</span><strong>${F(tolResult.maxAngle,2)}°</strong></div>`;
 }else{
  paintRaw();paintPano(panoMode==='equal'?'equalCanvas':'linearCanvas',panoMode==='equal');
  $('equalCanvas').hidden=panoMode!=='equal';$('linearCanvas').hidden=panoMode!=='linear';
  $('panoTitle').textContent=panoMode==='equal'?(stabilize?'等俯仰展开 · 已校正姿态':'等俯仰展开'):'线性圆环展开 · 不做姿态校正';
  $('stageMetrics').innerHTML=`<div><span>转向 / 倾斜</span><strong>${F(state.yaw,0)}° / ${F(state.tilt,0)}°</strong></div>`;
 }
 $('responseText').textContent=outcome();$('responseText').className='response-text';
 $('mirrorFoot').classList.toggle('warn',page==='camera'&&!g.fits);
 const outside=g.rout*7.4*geomZoom>185||Math.max(g.height,2*g.c)*7.4*geomZoom>218||Math.max(g.ro,g.hy)*.155*sensorZoom>142||Math.max(g.ro,g.hx)*.155*sensorZoom>212;
 $('fitView').classList.toggle('attention',outside);$('fitView').textContent=outside?'图示越界 · 适应':'适应图示';
 document.querySelectorAll('[data-pano]').forEach(b=>{b.classList.toggle('active',b.dataset.pano===panoMode);b.setAttribute('aria-pressed',String(b.dataset.pano===panoMode));});
}
const stat=(label,value,unit='')=>`<div class="small-stat"><span>${label}</span><strong>${value}${unit?'<small>'+unit+'</small>':''}</strong></div>`;
function syncContent(){
 document.querySelectorAll('[data-control]').forEach(el=>{el.classList.toggle('active',el.dataset.control===key);el.classList.toggle('invalid',!g.ok&&g.errorKey===el.dataset.control);});
 document.querySelectorAll('[data-input],[data-slider]').forEach(el=>{
  const k=el.dataset.input||el.dataset.slider,p=P[k],b=bounds(k);
  if(el.dataset.slider){el.min=b.min;el.max=b.max;el.step=b.step;el.value=state[k];el.style.setProperty('--fill',Math.max(0,Math.min(100,(state[k]-b.min)/(b.max-b.min)*100))+'%');}
  else if(document.activeElement!==el)el.value=F(state[k],p.n);
  el.setAttribute('aria-invalid',String(!g.ok&&g.errorKey===k));
 });
 const put=(id,text)=>{if($(id))$(id).textContent=text;};
 put('sensorSummary',`${state.nx} × ${state.ny} px`);
 put('fpxSummary',g.ok?`${F(g.fp,1)} px`:'—');
 put('physicalSummary',g.ok?`${F(g.sensorW,2)} × ${F(g.sensorH,2)} mm`:'—');
 if($('sampleStats'))$('sampleStats').innerHTML=g.ok?stat('方位采样',F(g.azimuthPxPerDeg,2),'px/°')+stat('俯仰采样',F(g.elevationPxPerDeg,2),'px/°')+stat('此角度可见方位',F(g.inspectCoverage*100,1),'%'):'无有效计算结果。';
 if($('panoStats'))$('panoStats').innerHTML=g.ok?stat('当前俯仰范围',`${F(g.lo,0)} … ${F(g.hi,0)}`,'°')+stat('可用环面积 / 画幅',F(g.util*100,1),'%')+stat('预览横向采样',F(Math.min(1200,Math.max(120,Math.round(state.panoWidth))),0),'px'):'无有效计算结果。';
 if($('stabilize')){$('stabilize').checked=stabilize;$('stabilize').disabled=panoMode!=='equal';put('stabilizeNote',panoMode==='equal'?'只校正拍到的方向；缺失区域仍保留棋盘格。':'线性半径展开不做姿态校正。切回等俯仰模式后可启用。');}
 if($('toleranceStats'))$('toleranceStats').innerHTML=g.ok&&tolResult?stat('方向差 RMS',F(tolResult.rmsAngle,3),'°')+stat('方向差采样最大',F(tolResult.maxAngle,3),'°')+stat('延长线距 V · RMS',F(tolResult.rmsDistance,3),'mm'):'无有效计算结果。';
 if(page==='formulas'){
  put('formulaContext',g.ok?`a ${F(g.a,2)} · b ${F(g.b,2)} mm · fpx ${F(g.fp,0)} px`:'当前参数无有效几何解');
  for(const [n,t,eq,desc,live] of formulas)put('live-'+n,g.ok?live(g):'当前参数没有有效数值解。');
 }
 if(page==='files'){
  const B=O.compute(baseline),rows=[['镜面外径',g.diameter,B.diameter,'mm'],['轴心处距 C',g.vertex,B.vertex,'mm'],['有效俯仰下界',g.lo,B.lo,'°'],['有效俯仰上界',g.hi,B.hi,'°'],['外圈像素半径',g.ro,B.ro,'px'],['像素焦距',g.fp,B.fp,'px']];
  $('compareTable').innerHTML='<table><thead><tr><th>计算量</th><th>基线</th><th>当前</th></tr></thead><tbody>'+rows.map(([n,v,b,u])=>`<tr><td>${n}</td><td>${B.ok?F(b,2):'—'} ${u}</td><td class="${g.ok&&B.ok&&!same(v,b)?'changed':''}">${g.ok?F(v,2):'—'} ${u}</td></tr>`).join('')+'</tbody></table>';
  document.querySelectorAll('[data-table]').forEach(el=>{const k=el.dataset.table,active=enabled(k);if(document.activeElement!==el)el.value=state[k];el.disabled=!active;put('table-mode-'+k,P[k].unit+(active?'':' · 未启用'));});
 }
}
function enabled(k){if(['lo','hi'].includes(k))return state.mode==='angles';if(['rin0','rout0'].includes(k))return state.mode==='radii';if(k==='f')return !state.useFpx;if(k==='fpx')return state.useFpx;return true;}
function render(){
 g=O.compute(state);if(g.ok)state.inspect=g.inspect;normalizeSelection();
 const ok=g.ok&&g.fits,status=!g.ok?'参数需要修正':g.fits?'画幅容纳完整':g.physicalFits?'画幅余量不足':'存在画幅裁切';
 $('designStatus').className='state-badge'+(ok?'':' warn');$('designStatus').lastElementChild.textContent=status;
 $('designStatus').title='只检查理想几何与画幅，不代表对焦或实物性能。';
 $('warning').hidden=g.ok;$('warning').innerHTML=g.ok?'':esc(g.error)+(g.errorKey?` <button class="text-button" data-jump="${g.errorKey}">定位此参数 ↗</button>`:'');
 renderStage();syncContent();updateHistoryUI();updateInlineFormula();readableLabels();updateLocalStatus();if(page==='camera')updateSpecUI();
}
function request(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;render();});}}
function fit(){
 if(!g.ok)return;const B=O.compute(before),GS=[g,...(showGhost&&B.ok?[B]:[])];
 geomZoom=Math.min(1,205/(Math.max(...GS.map(a=>Math.max(a.height,2*a.c)))*7.4),175/(Math.max(...GS.map(a=>a.rout))*7.4));
 sensorZoom=Math.min(1,139/(Math.max(...GS.map(a=>Math.max(a.ro,a.hy)))*.155),207/(Math.max(...GS.map(a=>Math.max(a.ro,a.hx)))*.155));
 render();toast('已适应当前与对照设计，后续拖动保持此视尺。');
}
function setMode(mode){
 if(!['angles','radii'].includes(mode)||state.mode===mode)return;
 historyAction(mode==='angles'?'切换为按视场角度设计':'切换为按镜片尺寸设计',()=>{
 snapshot();if(g.ok){if(mode==='radii'){state.rin0=g.rin/state.scale;state.rout0=g.rout/state.scale;}else{state.lo=g.lo;state.hi=g.hi;}}
 state.mode=mode;normalizeSelection();buildPage();render();
 });
}
function setFpx(flag){
 if(flag===state.useFpx)return;
 historyAction(flag?'切换为标定像素焦距':'切换为物理焦距估算',()=>{
 snapshot();if(flag)state.fpx=1000*state.f/state.pitch;else state.f=state.fpx*state.pitch/1000;
 state.useFpx=flag;normalizeSelection();buildPage();render();
 });
}
function doubleDensity(){
 if(state.nx*2>16384||state.ny*2>16384){toast('像素数会超过此模型的 16384 上限。');return;}
 historyAction('同一物理画幅，像素加密 ×2',()=>{
 snapshot();state.nx*=2;state.ny*=2;state.pitch/=2;state.margin*=2;if(state.useFpx)state.fpx*=2;
 key='pitch';group='camera';render();toast('物理画幅不变；宽高像素数各翻倍。');
 });
}
function jumpTo(k){
 if(['lo','hi'].includes(k)&&state.mode!=='angles')setMode('angles');
 if(['rin0','rout0'].includes(k)&&state.mode!=='radii')setMode('radii');
 if(k==='fpx'&&!state.useFpx)setFpx(true);if(k==='f'&&state.useFpx)setFpx(false);
 selectParam(k);
 const row=document.querySelector(`[data-control="${key}"]`);if(row&&row.getBoundingClientRect().bottom>window.innerHeight)row.scrollIntoView({block:'end',behavior:'instant'});
}
function showFormula(n){
 const number=n||formulas[P[key].formula][0];navigate('formulas');
 const el=$('formula-'+number);if(el){el.classList.add('highlight');el.scrollIntoView({block:'start',behavior:'instant'});}
}
const formulaTargets={'01':'a0','02':'b0','03':'inspect','04':'hi','05':'scale','06':'pitch','07':'f','08':'margin','09':'inspect','10':'inspect','11':'inspect','12':'scale','13':'dx','14':'tilt'};
function formulaAction(n){const k=formulaTargets[n]||'scale';if(['06','07','08','09','10','11'].includes(n))navigate('camera',k==='f'&&state.useFpx?'fpx':k);else jumpTo(k);}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function reset(){
 historyAction('重置全部示例参数',()=>{
 state=O.clone(O.defaults);before=O.clone(state);baseline=O.clone(state);cameraProfile=null;baselineCameraProfile=null;pinned=false;stabilize=false;geomZoom=sensorZoom=1;panoMode='equal';showGhost=true;$('ghost').checked=true;
 key=page==='camera'?'f':page==='panorama'?'tilt':page==='assembly'?'dx':'scale';group=P[key].group;
 buildPage();render();
 });
}
function saveBaseline(){if(!g.ok){toast('请先修正参数，才能保存有效基线。');return;}historyAction('保存当前设计为比较基线',()=>{baseline=O.clone(state);baselineCameraProfile=O.clone(cameraProfile);pinned=true;before=O.clone(baseline);if($('pinBaseline'))$('pinBaseline').checked=true;render();toast('已保存基线；后续图示固定与它比较。');});}
function restoreBaseline(){historyAction('恢复基线参数',()=>{snapshot();state=O.clone(baseline);cameraProfile=O.clone(baselineCameraProfile);normalizeSelection();buildPage();render();toast('当前设计已恢复为基线参数。');});}
async function importFile(file){
 try{
  if(file.size>200000)throw new Error('文件大于 200 kB。');
  const data=JSON.parse(await file.text());if(data.schema!=='catadioptric-lab-v1'||!data.parameters||typeof data.parameters!=='object'||Array.isArray(data.parameters))throw new Error('不是实验台导出的参数文件。');
  const next=O.clone(O.defaults);for(const k of Object.keys(next))if(k in data.parameters){if(typeof data.parameters[k]!==typeof next[k])throw new Error('参数 '+k+' 的类型不正确。');next[k]=data.parameters[k];}
  const computed=O.compute(next);if(!computed.ok)throw new Error(computed.error);
  const importedProfile=sanitizeCameraProfile(data.cameraSpec);
  historyAction('载入方案：'+file.name,()=>{snapshot();state=next;cameraProfile=importedProfile;normalizeSelection();buildPage();render();toast('参数已载入，所有页面同步更新。');});
 }catch(err){toast('未载入：'+err.message);}
}
// v7: in-context formulas and minimum rendered SVG label sizes.
function updateInlineFormula(){
 const box=$('inlineFormula'),button=$('formulaLink');
 box.hidden=!formulaOpen;button.setAttribute('aria-expanded',String(formulaOpen));button.textContent=formulaOpen?'收起公式 ▴':'对应公式 ▾';
 if(!formulaOpen)return;
 const [n,title,equation,description,live]=formulas[P[key].formula];
 box.innerHTML=`<header><strong><span class="mono">${n}</span> ${title}</strong><div><button class="text-button" data-full-formula="${n}">完整公式与来源 ↗</button><button id="closeInlineFormula" aria-label="收起当前公式">×</button></div></header><div class="inline-formula-body"><div class="equation">${equation}</div><div><div class="formula-live" data-inline-live>${g.ok?esc(live(g)):esc(g.error)}</div><p>${description}</p></div></div>`;
}
function readableLabels(){
 document.querySelectorAll('.scene-visual svg text[data-base-size]').forEach(node=>{
  const m=node.getScreenCTM();if(!m)return;
  const scale=Math.hypot(m.a,m.b);if(scale<0.05)return;
  node.setAttribute('font-size',String(Math.max(Number(node.dataset.baseSize),Number(node.dataset.minCss)/scale)));
 });
}

// Versioned local recovery. Numeric/UI data only unless the user explicitly
// opts into keeping the APPLIED camera-source record. Never persist the textarea,
// undo labels, drafts or unrelated keys. There are no automatic network calls.
const LOCAL_KEY='catadioptric-lab:session:v1';
let localPending=null,localSaved=false,localIncludeSource=false,localTimer=null,localHealth='idle',localLastTime='',localBlocked=false,localSaveRequested=false;
function localSettingsHTML(){return `<section class="document-card local-settings" id="localSettings"><h2>本地恢复与隐私 <span class="badge">当前浏览器</span></h2><p>提交一次修改后保存最后的有效设计、基线与视图。重新打开时先询问，不自动覆盖。撤销历史不跨会话保存。</p><label class="checkline"><input type="checkbox" id="localSourceConsent" ${localIncludeSource?'checked':''}>也保存已应用的相机型号、规格原文与来源（默认不保存）</label><div class="support-actions"><button class="outline-button" id="clearSession">清除本地记录</button><span id="localSettingsStatus"></span></div><p class="readout-note">不会上传数据。直接以 file: 打开时是否可保存取决于浏览器；更换文件、浏览器或设备不保证继承。重要方案请导出 JSON。清除后，下次完成修改才会再次保存。</p></section>`;}
function updateLocalStatus(){
 const texts={idle:'修改后本地保存',saved:'已本地保存',pending:'有设计待恢复',cleared:'本地记录已清除',invalid:'无效参数未保存',blocked:'保存不可用 · 请导出',corrupt:'恢复记录需处理'};
 const button=$('localStatus');if(button){button.textContent=texts[localHealth]||texts.idle;button.classList.toggle('warn',['blocked','invalid','corrupt'].includes(localHealth));button.title=(localLastTime?'最后保存：'+new Date(localLastTime).toLocaleString()+'。':'')+'点击查看恢复与隐私设置；保存仅限此浏览器。';}
 if($('localSettingsStatus'))$('localSettingsStatus').textContent=(texts[localHealth]||texts.idle)+(localLastTime?' · '+new Date(localLastTime).toLocaleTimeString():'');
}
function normalizeStoredState(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('参数对象无效。');
 const output=O.clone(O.defaults);
 for(const k of Object.keys(output)){if(Object.hasOwn(input,k)){if(typeof input[k]!==typeof output[k])throw new Error('参数 '+k+' 类型不正确。');output[k]=input[k];}}
 const result=O.compute(output);if(!result.ok)throw new Error(result.error);
 output.inspect=result.inspect;return output;
}
function decodeSession(text){
 if(text.length>150000)throw new Error('本地记录过大。');
 const data=JSON.parse(text);if(data.schema!=='catadioptric-session-v1')throw new Error('不支持此恢复记录版本。');
 if(!data.document||typeof data.document!=='object')throw new Error('缺少设计记录。');
 const doc=data.document,view=data.view||{};
 const normalized={state:normalizeStoredState(doc.state),baseline:normalizeStoredState(doc.baseline),pinned:doc.pinned===true,stabilize:doc.stabilize===true,panoMode:doc.panoMode==='linear'?'linear':'equal',
  geomZoom:typeof doc.geomZoom==='number'&&doc.geomZoom>0&&doc.geomZoom<=100?doc.geomZoom:1,
  sensorZoom:typeof doc.sensorZoom==='number'&&doc.sensorZoom>0&&doc.sensorZoom<=100?doc.sensorZoom:1,showGhost:doc.showGhost!==false,
  cameraProfile:data.includeSource===true?sanitizeCameraProfile(doc.cameraProfile):null,baselineCameraProfile:data.includeSource===true?sanitizeCameraProfile(doc.baselineCameraProfile):null};
 return {document:normalized,view:{page:Object.hasOwn(PAGES,view.page)?view.page:'design',key:Object.hasOwn(P,view.key)?view.key:'scale',mobileScene:view.mobileScene==='sensor'?'sensor':'mirror'},includeSource:data.includeSource===true,savedAt:typeof data.savedAt==='string'&&Number.isFinite(Date.parse(data.savedAt))?data.savedAt:null};
}
function initLocalRecovery(){
 try{
  const text=localStorage.getItem(LOCAL_KEY);if(!text){updateLocalStatus();return;}
  try{
   localPending=decodeSession(text);localHealth='pending';localLastTime=localPending.savedAt||'';
   $('recoveryTitle').textContent='发现上次的有效设计';
   $('recoveryMessage').textContent=(localLastTime?new Date(localLastTime).toLocaleString()+' · ':'')+`${localPending.document.state.nx} × ${localPending.document.state.ny} px。恢复前不会覆盖它；不包括上次的撤销历史。`;
  }catch(error){
   localPending={invalid:true};localHealth='corrupt';$('recoverSession').hidden=true;
   $('recoveryTitle').textContent='本地记录无法恢复';$('recoveryMessage').textContent=error.message+' 当前设计未改变，可清除该记录并从默认示例开始。';
  }
  $('recoveryBanner').hidden=false;
 }catch(error){localBlocked=true;localHealth='blocked';}
 updateLocalStatus();
}
function scheduleLocalSave(){
 localSaveRequested=true;
 clearTimeout(localTimer);if(localPending||localBlocked)return;
 localTimer=setTimeout(writeLocalSession,350);
}
function writeLocalSession(){
 clearTimeout(localTimer);if(localPending||localBlocked||pendingEdit)return false;
 const result=O.compute(state);
 if(!result.ok){localHealth='invalid';updateLocalStatus();return false;}
 try{
  const document=historyDocument();
  // Invalid temporary values never replace the last good persisted record.
  if(!O.compute(document.baseline).ok){localHealth='invalid';updateLocalStatus();return false;}
  document.state.inspect=result.inspect;
  if(!localIncludeSource){document.cameraProfile=null;document.baselineCameraProfile=null;}
  const savedAt=new Date().toISOString();
  localStorage.setItem(LOCAL_KEY,JSON.stringify({schema:'catadioptric-session-v1',appVersion:APP_VERSION,savedAt,includeSource:localIncludeSource,document,view:{page,key,mobileScene}}));
  localSaved=true;localSaveRequested=false;localLastTime=savedAt;localHealth='saved';updateLocalStatus();return true;
 }catch(error){localBlocked=true;localHealth='blocked';updateLocalStatus();toast('本地保存不可用；当前设计仍可使用，请导出 JSON。');return false;}
}
function restoreLocalSession(){
 if(!localPending||localPending.invalid)return;
 const saved=localPending;localPending=null;localIncludeSource=saved.includeSource;
 historyAction('恢复上次有效设计',()=>{
  page=saved.view.page;key=saved.view.key;experiment=page==='panorama'?'pose':page==='assembly'?'assembly':'optics';
  mobileScene=saved.view.mobileScene;restoreHistoryDocument(saved.document);
 });
 localSaved=true;$('recoveryBanner').hidden=true;writeLocalSession();toast('已恢复上次设计；可用「上一步」返回恢复前。');
}
function clearLocalSession(){
 clearTimeout(localTimer);
 try{localStorage.removeItem(LOCAL_KEY);localBlocked=false;localPending=null;localSaved=false;localSaveRequested=false;localLastTime='';localIncludeSource=false;localHealth='cleared';$('recoveryBanner').hidden=true;if($('localSourceConsent'))$('localSourceConsent').checked=false;toast('仅清除本工具的本地记录，当前参数不变。');}
 catch(error){localBlocked=true;localHealth='blocked';toast('无法访问本地存储，请用浏览器站点设置清理。');}
 updateLocalStatus();
}
function discardLocalSession(){reset();clearLocalSession();}
window.addEventListener('pagehide',()=>{commitPendingEdit();if(localSaved||localSaveRequested)writeLocalSession();});
if(typeof ResizeObserver!=='undefined'){
 const observer=new ResizeObserver(()=>{
  document.documentElement.style.setProperty('--history-offset',Math.ceil($('historyBar').getBoundingClientRect().height)+'px');
  document.documentElement.style.setProperty('--stage-height',Math.ceil($('stage').getBoundingClientRect().height)+'px');
 });
 observer.observe($('historyBar'));observer.observe($('stage'));
}

$('navigation').innerHTML=Object.entries(PAGES).map(([id,p],i)=>`${[0,2,4].includes(i)?'<div class="nav-label">'+['设计','实验','参考与方案'][i/2]+'</div>':''}<button class="nav-button ${id===page?'active':''}" data-nav="${id}" ${id===page?'aria-current="page"':''}>${icon(id)}<span>${p.title}</span></button>`).join('');

const RANGE_KEYS=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'];
document.addEventListener('pointerdown',e=>{
 const el=e.target.closest('[data-slider],[data-input],[data-table]');
 if(el){const k=el.dataset.slider||el.dataset.input||el.dataset.table;beginParameterEdit(k,el);pendingEdit.pointer=true;focusParameter(k);}
});
document.addEventListener('focusin',e=>{
 const el=e.target.closest('[data-slider],[data-input],[data-table]');
 if(el){const k=el.dataset.slider||el.dataset.input||el.dataset.table;beginParameterEdit(k,el);focusParameter(k);}
});
document.addEventListener('pointerup',()=>{
 if(pendingEdit?.pointer){pendingEdit.pointer=false;if(pendingEdit.element.matches('[data-slider]')){commitPendingEdit();render();}}
});
document.addEventListener('pointercancel',()=>{
 if(pendingEdit?.pointer){pendingEdit.pointer=false;commitPendingEdit();render();}
});
document.addEventListener('keydown',e=>{
 if(e.isComposing)return;
 if((e.ctrlKey||e.metaKey)&&!e.altKey&&!textEditingTarget(e.target)){
  const k=e.key.toLowerCase();
  if(k==='z'||(k==='y'&&e.ctrlKey&&!e.metaKey&&!e.shiftKey)){
   e.preventDefault();if(!e.repeat)(k==='y'||e.shiftKey?redoEdit:undoEdit)();return;
  }
 }
 const el=e.target.closest('[data-slider]');
 if(el&&RANGE_KEYS.includes(e.key)){beginParameterEdit(el.dataset.slider,el);pendingEdit.keyboard=true;}
 const hot=e.target.closest('[data-key]');if(hot&&['Enter',' '].includes(e.key)){e.preventDefault();selectParam(hot.dataset.key);}
});
document.addEventListener('keyup',e=>{
 if(RANGE_KEYS.includes(e.key)&&pendingEdit?.keyboard){pendingEdit.keyboard=false;commitPendingEdit();render();}
});
document.addEventListener('input',e=>{
 if(e.target.id==='specText'||e.target.id==='specModel'||e.target.hasAttribute('data-spec-field')){readSpecInputs();specDraft.feedback='';updateSpecUI();return;}
 const el=e.target,k=el.dataset.input||el.dataset.slider||el.dataset.table;if(!k)return;
 if(el.value!==''&&Number.isFinite(el.valueAsNumber)){
  beginParameterEdit(k,el);key=k;normalizeSelection();state[k]=el.valueAsNumber;request();
 }
});
document.addEventListener('focusout',e=>{
 const el=e.target,k=el.dataset.input||el.dataset.table;
 if(k)el.value=F(state[k],P[k].n);
 if(pendingEdit?.element===el){commitPendingEdit();request();}
});
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.matches('[data-spec-choice]')){
  const issue=specDraft.parsed.issues[Number(el.dataset.specChoice)],choice=issue.choices?.[Number(el.value)];
  if(el.value!==''&&choice){specDraft.fields.nx=choice.nx;specDraft.fields.ny=choice.ny;specDraft.confirmed={...specDraft.confirmed,nx:'choice',ny:'choice'};}
  else {delete specDraft.fields.nx;delete specDraft.fields.ny;}
  hydrateSpecInputs();return;
 }
 if(el.id==='localSourceConsent'){localIncludeSource=el.checked;if(!localPending)writeLocalSession();return;}
 if(el.id==='specColumn'){extractSpec(Number(el.value));return;}
 if(el.matches('[data-input],[data-table]')||(el.matches('[data-slider]')&&!pendingEdit?.pointer&&!pendingEdit?.keyboard)){commitPendingEdit();request();}
 if(el.id==='mode')setMode(el.value);
 if(el.id==='stabilize')historyAction(el.checked?'启用理想姿态校正':'关闭理想姿态校正',()=>{stabilize=el.checked;render();});
 if(el.id==='pinBaseline')historyAction(el.checked?'固定对照保存基线':'对照每次调整前',()=>{pinned=el.checked;before=O.clone(pinned?baseline:state);render();});
});
window.addEventListener('blur',()=>{commitPendingEdit();});
document.addEventListener('click',e=>{
 const cp=e.target.closest('[data-camera-preset]');if(cp){loadCameraPreset(cp.dataset.cameraPreset);return;}
 const n=e.target.closest('button[data-nav],button[data-page]');if(n){navigate(n.dataset.nav||n.dataset.page);return;}
 const ff=e.target.closest('[data-focus]');if(ff){focusParameter(ff.dataset.focus);return;}
 const hot=e.target.closest('[data-key]');if(hot){selectParam(hot.dataset.key);return;}
 const jp=e.target.closest('[data-jump]');if(jp){jumpTo(jp.dataset.jump);return;}
 const full=e.target.closest('[data-full-formula]');if(full){showFormula(full.dataset.fullFormula);return;}
 const fm=e.target.closest('[data-formula]');if(fm){showFormula(fm.dataset.formula);return;}
 const fa=e.target.closest('[data-formula-action]');if(fa){formulaAction(fa.dataset.formulaAction);return;}
 const cal=e.target.closest('[data-fpx]');if(cal){setFpx(cal.dataset.fpx==='true');return;}
 const pm=e.target.closest('[data-pano]');if(pm){historyAction(pm.dataset.pano==='equal'?'切换为等俯仰展开':'切换为线性圆环展开',()=>{panoMode=pm.dataset.pano;render();});return;}
 const sc=e.target.closest('[data-scene]');if(sc){mobileScene=sc.dataset.scene;renderStage();return;}
 const undo=e.target.closest('[data-undo]');if(undo){undoEdit();return;}
 const id=e.target.closest('button[id]')?.id;
 const actions={localStatus:()=>{navigate('files');$('localSettings')?.scrollIntoView({block:'start'});},recoverSession:restoreLocalSession,discardSession:discardLocalSession,clearSession:clearLocalSession,closeInlineFormula:()=>{formulaOpen=false;updateInlineFormula();$('formulaLink').focus();},pinQuick:saveBaseline,specExtract:()=>extractSpec(Number($('specColumn')?.value)||0),specUseCurrent:useCurrentSpec,specApply:applyCameraSpec,historyUndo:undoEdit,historyRedo:redoEdit,reset,fitView:()=>historyAction('适应当前图示比例',fit),resetView:()=>historyAction('还原显示比例（保留参数）',()=>{geomZoom=sensorZoom=1;render();}),formulaLink:()=>{formulaOpen=!formulaOpen;updateInlineFormula();},doubleDensity,
 poseZero:()=>historyAction('姿态归零',()=>{snapshot();state.yaw=state.tilt=0;render();}),alignmentZero:()=>historyAction('回到理想装配焦点',()=>{snapshot();state.dx=state.dz=0;render();}),
 switchProjection:()=>historyAction(panoMode==='equal'?'切换为线性圆环展开':'切换为等俯仰展开',()=>{panoMode=panoMode==='equal'?'linear':'equal';render();}),saveBaseline,restoreBaseline,
 exportJSON,exportCSV,exportXYZ,importBtn:()=>$('importFile').click()};
 if(id&&actions[id])actions[id]();
});
$('ghost').addEventListener('change',e=>{const checked=e.target.checked;historyAction(checked?'显示对照轮廓':'隐藏对照轮廓',()=>{showGhost=checked;render();});});
$('importFile').addEventListener('change',async e=>{const file=e.target.files[0];if(file)await importFile(file);e.target.value='';});
window.addEventListener('resize',request);
window.CatadioptricLab={
 getCameraProfile:()=>O.clone(cameraProfile),getSpecDraft:()=>O.clone(specDraft),loadCameraPreset,applyCameraSpec,parseCameraSpec:CS.parse,exportJSON,
 getState:()=>O.clone(state),getResult:()=>O.clone(g),getView:()=>({page,key,group,experiment,mobileScene,geomZoom,sensorZoom,frames:frame,showGhost,pinned,before:O.clone(before),baseline:O.clone(baseline),panoMode,stabilize}),
 navigate,selectParam,setExperiment:e=>navigate(e==='pose'?'panorama':e==='assembly'?'assembly':'design'),
 version:APP_VERSION,
 setState:patch=>historyAction('批量设置参数',()=>{snapshot();state={...state,...patch};normalizeSelection();buildPage();render();}),reset,
 undo:undoEdit,redo:redoEdit,commitEdit:commitPendingEdit,
 getHistory:()=>({undo:undoStack.length,redo:redoStack.length,pending:!!pendingEdit,limit:HISTORY_LIMIT,undoLabels:undoStack.map(e=>e.label),redoLabels:redoStack.map(e=>e.label)})
};
buildPage();render();initLocalRecovery();
