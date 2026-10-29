// Ambiente determinístico injetado antes de qualquer script da página
(()=>{
 let seed=12345;
 Math.random=function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 let now=1000;
 performance.now=()=>now; const D0=1.7e12; Date.now=()=>D0+now;
 const rafQ=[];window.requestAnimationFrame=cb=>{rafQ.push(cb);return rafQ.length;};window.cancelAnimationFrame=()=>{};
 let tid=1;const timers=new Map();
 window.setTimeout=(fn,ms=0,...a)=>{const id=tid++;timers.set(id,{t:now+(+ms||0),fn,a,iv:0,o:id});return id;};
 window.setInterval=(fn,ms=0,...a)=>{const id=tid++;timers.set(id,{t:now+(+ms||0),fn,a,iv:Math.max(1,+ms||0),o:id});return id;};
 window.clearTimeout=window.clearInterval=id=>{timers.delete(id);};
 try{delete window.requestIdleCallback;}catch(e){} window.requestIdleCallback=undefined;
 function runTimers(){for(let g=0;g<10000;g++){let best=null;for(const [id,t] of timers)if(t.t<=now&&(!best||t.t<best[1].t||(t.t===best[1].t&&t.o<best[1].o)))best=[id,t];if(!best)return;const [id,t]=best;if(t.iv){t.t+=t.iv;}else timers.delete(id);try{typeof t.fn==='function'?t.fn(...t.a):0;}catch(e){console.error('timer',e&&e.stack||e);}}}
 window.__step=(n,dtMs)=>{dtMs=dtMs||16.667;for(let i=0;i<n;i++){now+=dtMs;runTimers();const q=rafQ.splice(0);for(const cb of q){try{cb(now);}catch(e){console.error('raf',e&&e.stack||e);throw e;}}}return now;};
 window.__rng=()=>seed;
 window.AudioContext=undefined;window.webkitAudioContext=undefined;
 const OI=window.Image,imgs=[];
 function TI(w,h){const im=arguments.length?new OI(w,h):new OI();imgs.push(im);return im;}
 TI.prototype=OI.prototype;window.Image=TI;
 window.__imgsReady=()=>imgs.length>0&&imgs.every(i=>i.complete);
 window.__imgCount=()=>imgs.length;
})();
