/* Source-specific presets transcribed from the user's comparison image.
   The offline parser is deterministic: it reads labels and units, not OCR/AI.
   Missing or ambiguous values are left empty. No network calls. */
(function(root){
'use strict';
const presets={
 GC4653:`传感器型号：GC4653
分辨率：2560x1440
尺寸：1/3"
相元尺寸：2.0um
快门类型：卷帘快门
帧率：30fps@2K, 60fps@720P
最长曝光：0.5s
灵敏度：2.4V/Lux.s
动态范围：81dB
镜头焦距：3.05mm
镜头光圈：F2.5
镜头畸变：5%
视场角：D90° H81° V51°`,
 OS04A10:`传感器型号：OS04A10
分辨率：2688x1520
尺寸：1/1.79"
相元尺寸：2.9um
快门类型：卷帘快门
帧率：30fps@2K
最长曝光：45s
灵敏度：32000e/Lux.s
动态范围：120dB
镜头焦距：4.9mm
镜头光圈：F1.65
镜头畸变：25%
视场角：D100° H87° V49°`
};
const coreKeys=['nx','ny','pitch','f'];
const metaLabels={format:'尺寸（原表）',aperture:'镜头光圈',distortion:'镜头畸变',fov:'原镜头视场角',shutter:'快门类型',fps:'帧率',exposure:'最长曝光',dynamicRange:'动态范围',sensitivity:'灵敏度'};
const patterns=[
 ['model',/^(?:传感器型号|傳感器型號|相机型号|相機型號|型号|型號|camera\s*model|sensor\s*model|model)/i],
 ['resolution',/^(?:分辨率|解析度|分辨率\s*\(.*?\)|resolution)/i],
 ['pitch',/^(?:相元尺寸|像元尺寸|像素间距|像素間距|像素尺寸|pixel\s*(?:pitch|size))/i],
 ['fpx',/^(?:标定(?:像素)?焦距|標定(?:像素)?焦距|fpx|f_px|fx|fy)/i],
 ['f',/^(?:镜头焦距|鏡頭焦距|物理焦距|焦距|focal\s*length)/i],
 ['nx',/^(?:图像宽度|圖像寬度|画面宽度|畫面寬度|宽度|寬度|width|N[xₓ])/i],
 ['ny',/^(?:图像高度|圖像高度|画面高度|畫面高度|高度|height|N[yᵧ])/i],
 ['format',/^(?:传感器尺寸|傳感器尺寸|光学格式|光學格式|尺寸|optical\s*format|sensor\s*(?:format|size))/i],
 ['aperture',/^(?:镜头光圈|鏡頭光圈|光圈|f[- ]?number|aperture)/i],
 ['distortion',/^(?:镜头畸变|鏡頭畸變|畸变|畸變|distortion)/i],
 ['fov',/^(?:视场角|視場角|视角|視角|field\s*of\s*view|fov)/i],
 ['shutter',/^(?:快门类型|快門類型|快门|快門|shutter(?:\s*type)?)/i],
 ['fps',/^(?:帧率|幀率|frame\s*rate|fps)/i],
 ['exposure',/^(?:最长曝光|最長曝光|最大曝光|曝光时间|曝光時間|max(?:imum)?\s*exposure|exposure)/i],
 ['dynamicRange',/^(?:动态范围|動態範圍|dynamic\s*range)/i],
 ['sensitivity',/^(?:灵敏度|靈敏度|sensitivity)/i]
];
function clean(s){return String(s).normalize('NFKC').replace(/\u00a0/g,' ').replace(/[μµ]/g,'u');}
function splitCells(line){
 // Do not filter empty cells: doing so can assign another model's values.
 let text=line.trim();
 if(text.includes('|')){if(text.startsWith('|'))text=text.slice(1);if(text.endsWith('|'))text=text.slice(0,-1);return text.split('|').map(s=>s.trim());}
 if(line.includes('\t'))return line.replace(/^\t|\t$/g,'').split('\t').map(s=>s.trim());
 return text.split(/\s{2,}/).map(s=>s.trim());
}
function candidates(text){
 for(const raw of String(text).split(/\r?\n/)){
  const row=clean(raw).replace(/^\s*\|?\s*/,'');
  if(!patterns[0][1].test(row))continue;
  const cells=splitCells(raw);
  if(cells.length>=3)return cells.slice(1,9).map((m,i)=>m||`未命名列 ${i+1}`);
 }
 return [];
}
const fieldNames={nx:'图像宽度',ny:'图像高度',resolution:'采集分辨率',f:'镜头焦距',pitch:'像素间距'};
const numberPattern='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
function parse(text,column=0){
 const raw=String(text).slice(0,50000),models=candidates(raw),index=Math.max(0,Math.min(models.length-1,Math.trunc(Number(column)||0)));
 const fields={},metadata={},warnings=[],evidence={},unmatched=[],issues=[],blocked=new Set();
 let model=models[index]||'';
 function flag(k,kind,message,line,choices=[]){
  const keys=k==='resolution'?['nx','ny']:[k];
  for(const key of keys){blocked.add(key);delete fields[key];evidence[key]=line;}
  issues.push({field:k,keys,kind,message,evidence:line,choices});warnings.push(message);
 }
 function put(k,v,line){
  if(blocked.has(k))return;
  if(Object.hasOwn(fields,k)&&fields[k]!==v){flag(k,'conflict',`${fieldNames[k]} 在多行中有不同值，请手动确认。`,[evidence[k],line].join('\n'));return;}
  fields[k]=v;evidence[k]=line;
 }
 function resolution(value,line){
  const pairs=[...value.matchAll(/([+-]?\d{2,5})\s*[xX×*]\s*([+-]?\d{2,5})/g)].map(m=>({nx:Number(m[1]),ny:Number(m[2])}));
  const unique=[...new Map(pairs.map(p=>[p.nx+'x'+p.ny,p])).values()];
  if(unique.length>1){flag('resolution','choices','检测到多个采集分辨率，请选择本次实际使用的模式。',line,unique);return;}
  if(unique.length===1){
   // A second shorthand mode (e.g. 720P) must not be silently discarded.
   const rest=value.replace(/([+-]?\d{2,5})\s*[xX×*]\s*([+-]?\d{2,5})/g,'').replace(/\b\d+(?:\.\d+)?\s*(?:fps|hz)\b/gi,'');
   if(/\d+\s*[kp]\b/i.test(rest)){flag('resolution','multiple','分辨率同时包含另一种简写模式，请手动填入实际宽高。',line);return;}
   put('nx',unique[0].nx,line);put('ny',unique[0].ny,line);return;
  }
  flag('resolution','missing','分辨率必须明确为宽 × 高；不把 2K / 720P 自动换算。',line);
 }
 for(const original of raw.split(/\r?\n/)){
  const cells=splitCells(original),label=clean(cells[0]||'').trim(),line=clean(original).trim().replace(/^\|\s*/,'');
  if(!line||/^[-|:\s]+$/.test(line))continue;
  const match=patterns.find(([,re])=>re.test(models.length>1?label:line));
  if(!match){
   if(/等效.*焦距|(?:35\s*mm|full[- ]?frame).*equiv|equiv.*focal/i.test(line))flag('f','equivalent','等效焦距不是本模型的物理焦距，请手动确认实际镜头焦距。',original);
   else if(!models.length&&/^\d{2,5}\s*[xX×*]\s*\d{2,5}\s*(?:px)?\s*$/.test(line))resolution(line,original);
   else unmatched.push(original);
   continue;
  }
  const [k,re]=match;
  let value=models.length>1?cells[index+1]:line.replace(re,'').replace(/^\s*[:：=]\s*/,'').trim();
  if(k==='model'){model=models.length?models[index]:String(value||'').replace(/\|$/,'').trim();continue;}
  if(models.length>1&&cells.length!==models.length+1){
   const msg=`「${metaLabels[k]||fieldNames[k]||k}」的列数不匹配；请用 Tab 或 | 分隔并保留空列。`;
   if(['resolution','nx','ny','pitch','f'].includes(k))flag(k,'columns',msg,original);else warnings.push(msg);
   continue;
  }
  value=clean(value||'').replace(/\|$/,'').trim();
  if(k==='fpx'){warnings.push('识别到标定像素焦距：请在「使用标定 fpx」中填写，不将其当作毫米焦距。');continue;}
  if(k==='resolution'){resolution(value,original);continue;}
  if(k==='f'&&/等效|equiv|35\s*mm\s*(?:format|film|full)/i.test(value)){
   flag(k,'equivalent','等效焦距不能当成实际焦距，请手动确认实际镜头的毫米焦距。',original);continue;
  }
  if(['nx','ny','pitch','f'].includes(k)){
   const prefixUnit=value.match(/^\s*[(（]([^)]*)[)）]\s*[:：=]?\s*/);
   const content=value.replace(/^\s*[(（][^)]*[)）]\s*[:：=]?\s*/,'').replace(/^[:：=]\s*/,'');
   const nums=[...content.matchAll(new RegExp(numberPattern,'g'))].map(m=>Number(m[0]));
   const context=models.length>1?label+' '+value:(prefixUnit?prefixUnit[1]+' ':'')+value;
   if(nums.length!==1||/[~～–—]|\d\s*-\s*\d|\d\s*(?:至|到|to)\s*\d|±/i.test(content)){
    flag(k,'range',`${fieldNames[k]} ${nums.length?'包含范围、多值或公差':'缺少明确数值'}；请填写本次使用的确定值${k==='f'?'（mm）':k==='pitch'?'（μm）':''}。`,original);continue;
   }
   if(k==='f'||k==='pitch'){
    const unit=k==='f'?/(?:mm|毫米)/i:/(?:um|微米)/i;
    const wrong=k==='f'?/(?:um|cm|英寸|微米)/i:/(?:mm|cm|英寸|毫米)/i;
    if(!unit.test(context)||wrong.test(context)){
     flag(k,'unit',`${fieldNames[k]} 单位不明确或不受支持，请明确填写 ${k==='f'?'mm':'μm'}。`,original);continue;
    }
    // Do not take the sole digit from a sentence/uncertainty marker as a measurement.
    const remainder=content.replace(new RegExp(numberPattern,'g'),'').replace(k==='f'?/(?:mm|毫米)/gi:/(?:um|微米)/gi,'').trim();
    if(remainder){flag(k,'qualifier',`${fieldNames[k]} 含有限定说明，请核对原文后手动确认。`,original);continue;}
   }else if(!new RegExp('^'+numberPattern+'\\s*(?:px|pixels?|像素)?$','i').test(content)){
    flag(k,'qualifier',`${fieldNames[k]} 格式不明确，请手动填写整数像素数。`,original);continue;
   }
   put(k,nums[0],original);
  }else if(value)metadata[k]=value;
 }
 return {model,fields,metadata,warnings:[...new Set(warnings)],issues,evidence,unmatched,models,column:models.length?index:0,raw};
}
function validate(fields){
 const errs=[];
 for(const k of coreKeys){
  const v=fields[k];
  if(typeof v!=='number'||!Number.isFinite(v))errs.push({key:k,message:'尚未填写'});
  else if(['nx','ny'].includes(k)&&(!Number.isInteger(Number(v))||v<16||v>16384))errs.push({key:k,message:'须为 16–16384 的整数'});
  else if(k==='f'&&(v<0.001||v>10000))errs.push({key:k,message:'软件范围为 0.001–10000 mm'});
  else if(k==='pitch'&&(v<0.001||v>1000))errs.push({key:k,message:'软件范围为 0.001–1000 μm'});
 }
 return errs;
}
const api={presets,coreKeys,metaLabels,parse,candidates,validate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.CameraSpec=api;
})(typeof window!=='undefined'?window:globalThis);
