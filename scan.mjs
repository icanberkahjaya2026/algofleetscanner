// ============================================================
//  AlgoFleet by Cryptoday — Cloud Scan Bot (SOP v3.6)
//  Jalan di GitHub Actions tiap 10 menit (tanpa browser).
//  Scan universe → kirim Telegram saat ada coin ENTRY.
//  Engine = port persis dari app (3-lapis + pullback + conviction≥60).
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';

const BN = 'https://data-api.binance.vision/api/v3';
const TOKEN   = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SCAN_MODES = (process.env.SCAN_MODES || 'intraday').split(',').map(s => s.trim()).filter(Boolean);
const STATE_FILE = 'state.json';

if (!TOKEN || !CHAT_ID) { console.error('TELEGRAM_TOKEN / TELEGRAM_CHAT_ID belum di-set (Secrets).'); process.exit(1); }

/* ---------- config v3.6 (identik app) ---------- */
const MODES = {
  scalping:{label:'Scalping', entryTF:'5m', biasTF:'1h', macroTF:'4h', rrr:1.5, risk:0.006, adxMin:22, diGap:5.0,  structL:10, donch:40, atrSL:1.1, timeStop:48,  callback:1.5, trigger:'breakout', corrCap:3},
  intraday:{label:'Intraday', entryTF:'15m',biasTF:'4h', macroTF:'1d', rrr:2.0, risk:0.016, adxMin:20, diGap:16.0, structL:10, donch:40, atrSL:1.3, timeStop:96,  callback:3.0, trigger:'pullback', corrCap:2},
  swing:{label:'Swing',       entryTF:'1h', biasTF:'1d', macroTF:'1w', rrr:3.0, risk:0.009, adxMin:18, diGap:16.0, structL:10, donch:55, atrSL:1.6, timeStop:480, callback:4.0, trigger:'pullback', corrCap:null},
};
const CORE=['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','AVAX','LINK','LTC','DOT','ETC'];
const SWING_EXT=['TRX','ATOM','NEAR','UNI','AAVE','BCH','FIL','INJ'];
const SCALP_NEW=['WLD','ZEC','SUI','RIF','PROM','DEXE'];
const INTRA_NEW=['WLD','ZEC','SUI','RIF','PROM','DEXE','SYN','FET','XLM','ARB','APT','LDO','STX','TLM','ALGO','ICP','HBAR'];
const UNIVERSE={ scalping:[...CORE.slice(0,6),...SCALP_NEW], intraday:[...CORE,...SWING_EXT,...INTRA_NEW], swing:[...CORE,...SWING_EXT] };

/* ---------- indikator ---------- */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const last=a=>{for(let i=a.length-1;i>=0;i--)if(a[i]!=null&&!Number.isNaN(a[i]))return a[i];return null;};
function ema(v,p){const o=Array(v.length).fill(null);const k=2/(p+1);let e=null;for(let i=0;i<v.length;i++){e=e==null?v[i]:v[i]*k+e*(1-k);if(i>=p-1)o[i]=e;}return o;}
function sma(v,p){const o=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=p)s-=v[i-p];if(i>=p-1)o[i]=s/p;}return o;}
function atrArr(c,p=14){const tr=c.map((x,i)=>i===0?x.h-x.l:Math.max(x.h-x.l,Math.abs(x.h-c[i-1].c),Math.abs(x.l-c[i-1].c)));const o=Array(c.length).fill(null);let a=null;for(let i=0;i<tr.length;i++){if(i<p){if(i===p-1){a=tr.slice(0,p).reduce((s,x)=>s+x,0)/p;o[i]=a;}}else{a=(a*(p-1)+tr[i])/p;o[i]=a;}}return o;}
function rsiArr(v,p=14){const o=Array(v.length).fill(null);let g=0,l=0;for(let i=1;i<v.length;i++){const d=v[i]-v[i-1],up=Math.max(d,0),dn=Math.max(-d,0);if(i<=p){g+=up;l+=dn;if(i===p){g/=p;l/=p;o[i]=100-100/(1+g/(l||1e-9));}}else{g=(g*(p-1)+up)/p;l=(l*(p-1)+dn)/p;o[i]=100-100/(1+g/(l||1e-9));}}return o;}
function dmi(c,p=14){const len=c.length;const pdi=Array(len).fill(null),mdi=Array(len).fill(null),adx=Array(len).fill(null);if(len<2*p+2)return{pdi,mdi,adx};const pDM=Array(len).fill(0),mDM=Array(len).fill(0),tr=Array(len).fill(0);for(let i=1;i<len;i++){const up=c[i].h-c[i-1].h,dn=c[i-1].l-c[i].l;pDM[i]=(up>dn&&up>0)?up:0;mDM[i]=(dn>up&&dn>0)?dn:0;tr[i]=Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c));}let trS=0,pS=0,mS=0;const dx=Array(len).fill(null);for(let i=1;i<len;i++){if(i<=p){trS+=tr[i];pS+=pDM[i];mS+=mDM[i];}else{trS=trS-trS/p+tr[i];pS=pS-pS/p+pDM[i];mS=mS-mS/p+mDM[i];}if(i>=p){const pd=100*pS/(trS||1e-9),md=100*mS/(trS||1e-9);pdi[i]=pd;mdi[i]=md;dx[i]=100*Math.abs(pd-md)/((pd+md)||1e-9);}}let sum=0;for(let i=p;i<len;i++){if(dx[i]==null)continue;if(i<2*p){sum+=dx[i];}else if(i===2*p){sum+=dx[i];adx[i]=sum/p;}else{adx[i]=(adx[i-1]*(p-1)+dx[i])/p;}}return{pdi,mdi,adx};}
function emaSlope(cl,p){let per=p,e=ema(cl,per);if(last(e)==null){per=Math.max(30,Math.floor(cl.length*0.6));e=ema(cl,per);}const cur=last(e);let prev=null,seen=0;for(let i=e.length-1;i>=0;i--){if(e[i]!=null){seen++;if(seen===6){prev=e[i];break;}}}return{ema:cur,rising:(cur!=null&&prev!=null)?cur>prev:true};}
function structOf(c,L){const n=c.length;if(n<2*L+1)return'NEUTRAL';const rec=c.slice(n-L),pri=c.slice(n-2*L,n-L);const rH=Math.max(...rec.map(x=>x.h)),rL=Math.min(...rec.map(x=>x.l));const pH=Math.max(...pri.map(x=>x.h)),pL=Math.min(...pri.map(x=>x.l));if(rH>pH&&rL>pL)return'HH-HL';if(rH<pH&&rL<pL)return'LH-LL';return'NEUTRAL';}
function donchian(c,N){const n=c.length;if(n<N+1)return{up:null,lo:null};const w=c.slice(n-1-N,n-1);return{up:Math.max(...w.map(x=>x.h)),lo:Math.min(...w.map(x=>x.l))};}

/* ---------- data ---------- */
async function kl(sym,itv,lim){const r=await fetch(`${BN}/klines?symbol=${sym}USDT&interval=${itv}&limit=${lim+1}`);if(!r.ok)throw new Error('kl'+r.status);const a=await r.json();let o=a.map(k=>({t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5],ct:k[6]}));if(o.length&&o[o.length-1].ct>Date.now())o.pop();return o;}
async function allPrices(){try{const r=await fetch(`${BN}/ticker/price`);const a=await r.json();const m={};for(const x of a)m[x.symbol]=+x.price;return m;}catch(e){return{};}}
async function pool(items,worker,size){const res=Array(items.length);let i=0;const run=async()=>{while(i<items.length){const idx=i++;try{res[idx]=await worker(items[idx]);}catch(e){res[idx]=null;}}};await Promise.all(Array.from({length:Math.min(size,items.length)},run));return res;}
function isNFPday(){const d=new Date(Date.now()+7*3600000);return d.getUTCDay()===5 && d.getUTCDate()<=7;}
function decFor(p){p=Math.abs(p);if(p>=100)return 2;if(p>=1)return 3;if(p>=0.1)return 4;if(p>=0.01)return 5;if(p>=0.0001)return 7;return 9;}
const fmt=(p)=>'$'+Number(p).toLocaleString('en-US',{minimumFractionDigits:decFor(p),maximumFractionDigits:decFor(p)});
const pct=x=>(x>=0?'+':'')+x.toFixed(2)+'%';

/* ---------- engine (port evaluate v3.6) ---------- */
function evaluate(sym, mo, tf, live){
  const M=MODES[mo]; const eb=tf[M.entryTF], bb=tf[M.biasTF], mb=tf[M.macroTF];
  if(!eb||eb.length<30||!bb||bb.length<30||!mb||mb.length<20)return null;
  const ecl=eb.map(x=>x.c), evol=eb.map(x=>x.v);
  const e20a=ema(ecl,20), eRSIa=rsiArr(ecl,14), eATRa=atrArr(eb,14), eVolSMAa=sma(evol,20);
  const e20=last(e20a), eATR=last(eATRa)||0; const volSMA=last(eVolSMAa); const rvol=volSMA?evol[evol.length-1]/volSMA:1;
  const closeE=eb[eb.length-1].c; const structEntry=structOf(eb,M.structL); const donch=donchian(eb,M.donch);
  const recLow=Math.min(...eb.slice(-M.structL).map(x=>x.l)), recHigh=Math.max(...eb.slice(-M.structL).map(x=>x.h));
  if(e20==null||eATR<=0)return null;
  const price=(live!=null&&isFinite(live))?live:closeE, dec=decFor(price||1);
  const bcl=bb.map(x=>x.c); const b50=emaSlope(bcl,50).ema, b200=emaSlope(bcl,200).ema, bd=dmi(bb,14);
  const bAdx=last(bd.adx),bP=last(bd.pdi),bM=last(bd.mdi);
  let bAdxPrev=null,seen=0;for(let i=bd.adx.length-1;i>=0;i--){if(bd.adx[i]!=null){seen++;if(seen===4){bAdxPrev=bd.adx[i];break;}}}
  const adxRising=bAdxPrev!=null?bAdx>bAdxPrev:true; const diGap=(bP!=null&&bM!=null)?Math.abs(bP-bM):0; const structBias=structOf(bb,M.structL);
  const m200=emaSlope(mb.map(x=>x.c),200), macroClose=mb[mb.length-1].c;
  const cand=(bP!=null&&bM!=null)?(bP>=bM?'LONG':'SHORT'):'NONE'; if(cand==='NONE')return null; const long=cand==='LONG';
  const macroOK=long?(m200.ema!=null&&macroClose>m200.ema&&m200.rising):(m200.ema!=null&&macroClose<m200.ema&&!m200.rising);
  const emaOK=long?(b50!=null&&b200!=null&&b50>b200):(b50!=null&&b200!=null&&b50<b200);
  const adxOK=bAdx!=null&&bAdx>=M.adxMin&&adxRising;
  const diOK=long?(bP>bM&&diGap>=M.diGap):(bM>bP&&diGap>=M.diGap);
  const structBiasOK=long?(structBias!=='LH-LL'):(structBias!=='HH-HL');
  const biasOK=emaOK&&adxOK&&diOK&&structBiasOK; const structOK=long?(structEntry==='HH-HL'):(structEntry==='LH-LL');
  if(!(macroOK&&biasOK&&structOK))return null; // NO TRADE
  // trigger
  let ready;
  if(M.trigger==='breakout'){ ready = long?(closeE>donch.up&&rvol>=1.0):(closeE<donch.lo&&rvol>=1.0); }
  else{ const win=6,seg=eb.slice(-win);let touched=false,rsiExt=false;
    for(let i=0;i<seg.length;i++){const idx=eb.length-win+i,e=e20a[idx],r=eRSIa[idx];if(e!=null){if(long?seg[i].l<=e:seg[i].h>=e)touched=true;}if(r!=null){if(long?r<45:r>55)rsiExt=true;}}
    const kb=eb[eb.length-1],reclaim=long?(kb.c>e20&&kb.c>kb.o):(kb.c<e20&&kb.c<kb.o); ready=touched&&rsiExt&&reclaim&&rvol>=1.0; }
  // conviction
  const trend22=([emaOK,adxOK,diOK,structBiasOK].filter(Boolean).length/4)*22;
  const macro18=macroOK?18:(m200.ema!=null&&(long?macroClose>m200.ema:macroClose<m200.ema)?9:0);
  const adx15=clamp(((bAdx||0)-18)/(45-18),0,1)*15, digap15=clamp(diGap/25,0,1)*15;
  const struct12=structOK?12:(structEntry==='NEUTRAL'?6:0), rvol10=clamp((rvol-0.8)/0.7,0,1)*10;
  const mom8=long?clamp(1-((donch.up||price)-price)/(2*eATR),0,1)*8:clamp(1-(price-(donch.lo||price))/(2*eATR),0,1)*8;
  const conv=Math.round(clamp(trend22+macro18+adx15+digap15+struct12+rvol10+mom8,0,100));
  if(conv<60||!ready)return null; // hanya ENTRY
  // levels
  const entry=M.trigger==='breakout'?(long?donch.up:donch.lo):e20;
  let sl; if(long){const s=recLow,a=entry-M.atrSL*eATR;sl=Math.max(s,a);if(!(sl<entry))sl=a;}else{const s=recHigh,a=entry+M.atrSL*eATR;sl=Math.min(s,a);if(!(sl>entry))sl=a;}
  const R=Math.abs(entry-sl); const tp1=long?entry+R:entry-R; const slPct=entry?R/entry*100:0;
  return {sym, mode:mo, side:cand, conv, entry, sl, tp1, slPct, R, rrr:M.rrr, callback:M.callback, dec, barTime:eb[eb.length-1].ct, price};
}

/* ---------- telegram ---------- */
async function tg(text){
  try{
    const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:CHAT_ID,text,parse_mode:'HTML',disable_web_page_preview:true})});
    if(!r.ok)console.error('Telegram err', r.status, await r.text());
  }catch(e){console.error('Telegram fail', e.message);}
}
function msg(A, nfp){
  const dist=pct((A.tp1/A.entry-1)*100);
  return `🔔 <b>AlgoFleet — ENTRY</b> · ${MODES[A.mode].label}\n`+
    `━━━━━━━━━━━━━\n`+
    `${A.side==='LONG'?'🟢':'🔴'} <b>${A.sym} ${A.side}</b> · conviction <b>${A.conv}/100</b>\n`+
    `1. Entry LIMIT: <b>${fmt(A.entry)}</b>\n`+
    `2. Stop (1R): ${fmt(A.sl)} (${A.slPct.toFixed(2)}%)\n`+
    `3. TP1 +1R (bank 20%): ${fmt(A.tp1)} (${dist})\n`+
    `4. Runner 80%: trailing callback ${A.callback}% (act +1R)\n`+
    `RRR 1:${A.rrr} · risk ${(MODES[A.mode].risk*100).toFixed(1)}%/trade\n`+
    (nfp?`⚠️ <b>NEWS BLACKOUT (NFP)</b> — SOP: skip entry hari ini. Informatif.\n`:``)+
    `━━━━━━━━━━━━━\n`+
    `Entry LIMIT maker · SL→BE @+1R · heat-cap ≤3 · DYOR\n`+
    `📊 <a href="https://cryptoday-sop-bctnunscojgs3k88yga69h65.surge.sh">Buka AlgoFleet untuk analisa lengkap</a>`;
}

/* ---------- main ---------- */
function loadState(){try{return JSON.parse(readFileSync(STATE_FILE,'utf8'));}catch(e){return{keys:{}};}}
function saveState(s){writeFileSync(STATE_FILE,JSON.stringify(s));}

(async()=>{
  const state=loadState(); state.keys=state.keys||{};
  const now=Date.now(); const nfp=isNFPday();
  // prune keys > 12 jam
  for(const k in state.keys){ if(now-state.keys[k]>12*3600000) delete state.keys[k]; }
  const prices=await allPrices();
  const fresh=[];
  for(const mo of SCAN_MODES){
    if(!MODES[mo])continue; const M=MODES[mo]; const list=UNIVERSE[mo];
    const results=await pool(list, async(sym)=>{
      const need={}; need[M.entryTF]=220; need[M.biasTF]=300; need[M.macroTF]=300;
      const tf={}; await Promise.all(Object.keys(need).map(async t=>{tf[t]=await kl(sym,t,need[t]);}));
      return evaluate(sym, mo, tf, prices[sym+'USDT']);
    }, 8);
    const entries=results.filter(Boolean);
    // correlation-cap: batasi jumlah notif searah per mode
    if(M.corrCap){ const byDir={LONG:[],SHORT:[]}; entries.sort((a,b)=>b.conv-a.conv).forEach(e=>byDir[e.side].push(e));
      const capped=[...byDir.LONG.slice(0,M.corrCap),...byDir.SHORT.slice(0,M.corrCap)];
      entries.length=0; entries.push(...capped); }
    for(const A of entries){
      const key=`${A.mode}:${A.sym}:${A.side}:${A.barTime}`;
      if(state.keys[key])continue; // sudah dinotif utk bar ini
      state.keys[key]=now; fresh.push(A);
    }
    console.log(`[${mo}] scan ${list.length} coin → ${entries.length} ENTRY, ${fresh.filter(f=>f.mode===mo).length} baru`);
  }
  for(const A of fresh){ await tg(msg(A,nfp)); await new Promise(r=>setTimeout(r,350)); }
  saveState(state);
  const d=new Date(now+7*3600000);
  console.log(`selesai WIB ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')} — ${fresh.length} notif dikirim`);
})();
