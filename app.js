"use strict";

const REGION_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(/\s+/);
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_NAMES = [...new Set(REGION_CODES.map(c => displayNames.of(c)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const ALIASES = new Map(Object.entries({
  usa:"United States",us:"United States","united states of america":"United States",america:"United States",
  uk:"United Kingdom",britain:"United Kingdom","great britain":"United Kingdom",uae:"United Arab Emirates",
  "south korea":"South Korea","north korea":"North Korea","czech republic":"Czechia",turkey:"Türkiye",turkiye:"Türkiye",
  "ivory coast":"Côte d’Ivoire","cote d ivoire":"Côte d’Ivoire","cape verde":"Cabo Verde",swaziland:"Eswatini",
  burma:"Myanmar","east timor":"Timor-Leste",vatican:"Vatican City"
}));

const $ = id => document.getElementById(id);
const els = {
  audio:$("radio-player"), canvas:$("waveform"), state:$("audio-state"), play:$("play-pause"), restart:$("restart"),
  volumeToggle:$("volume-toggle"), volume:$("volume"), input:$("country-input"), suggestions:$("country-suggestions"),
  form:$("guess-form"), guessButton:document.querySelector(".guess-button"), feedback:$("feedback"), next:$("next-after-answer"),
  stationActions:$("station-actions"), score:$("score"), attempts:$("attempts"), nowPlaying:$("now-playing")
};

let current=null, score=0, triesLeft=5, roundOver=false, currentSuggestions=[], activeSuggestion=-1;
let audioContext=null, analyser=null, sourceNode=null, raf=null, lastDistance=null, streamRecovery=0;

function normalize(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"").replace(/[^a-zA-Z0-9]+/g," ").trim().toLowerCase()}
const LOOKUP=new Map(COUNTRY_NAMES.map(n=>[normalize(n),n])); for(const [a,n] of ALIASES) LOOKUP.set(normalize(a),n);
function levenshtein(a,b){a=normalize(a);b=normalize(b);const p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let last=p[0];p[0]=i;for(let j=1;j<=b.length;j++){const old=p[j];p[j]=Math.min(p[j]+1,p[j-1]+1,last+(a[i-1]===b[j-1]?0:1));last=old}}return p[b.length]}
function canonicalCountry(v){const k=normalize(v);if(!k)return null;if(LOOKUP.has(k))return LOOKUP.get(k);let best=null,d=Infinity;for(const [ck,n] of LOOKUP){const x=levenshtein(k,ck);if(x<d){d=x;best=n}}const limit=k.length<=5?1:k.length<=9?2:3;return d<=limit?best:null}
function comparable(v){return normalize(canonicalCountry(v)||v).replace(/^the /,"")}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function fetchJson(url){const r=await fetch(url,{cache:"no-store"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`${r.status} ${r.statusText}`);return b}

function setPlaying(playing){els.play.classList.toggle("paused",!playing);els.play.setAttribute("aria-label",playing?"Pause radio":"Play radio")}
function setState(t){els.state.textContent=t}

async function ensureAudioGraph(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return false;
  try{
    if(!audioContext) audioContext=new AudioCtx();
    if(!analyser){
      analyser=audioContext.createAnalyser(); analyser.fftSize=2048; analyser.smoothingTimeConstant=.68;
      sourceNode=audioContext.createMediaElementSource(els.audio); sourceNode.connect(analyser); analyser.connect(audioContext.destination);
    }
    if(audioContext.state==="suspended") await audioContext.resume();
    return audioContext.state==="running";
  }catch(e){ console.warn("Audio analyser unavailable",e); return false; }
}

function resizeCanvas(){const r=els.canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));if(els.canvas.width!==w||els.canvas.height!==h){els.canvas.width=w;els.canvas.height=h}}
function drawWave(){
  resizeCanvas();
  const ctx=els.canvas.getContext("2d"),w=els.canvas.width,h=els.canvas.height,d=Math.min(devicePixelRatio||1,2),mid=h/2;
  ctx.clearRect(0,0,w,h);

  const gap=9*d;
  const count=Math.max(48,Math.floor(w/gap));
  const spacing=w/count;
  const data=new Uint8Array(analyser?.fftSize||2048);
  const live=!!(analyser&&audioContext?.state==="running"&&!els.audio.paused);
  if(live) analyser.getByteTimeDomainData(data);

  ctx.lineWidth=Math.max(1.4*d,2);
  ctx.lineCap="round";
  ctx.shadowColor="rgba(98,174,240,.42)";
  ctx.shadowBlur=7*d;

  for(let i=0;i<count;i++){
    let amp=.012;
    if(live){
      const a=Math.floor(i*data.length/count);
      const b=Math.max(a+1,Math.floor((i+1)*data.length/count));
      let peak=0;
      for(let j=a;j<b;j++) peak=Math.max(peak,Math.abs(data[j]-128)/128);
      amp=Math.max(.014,Math.min(.96,peak*1.42));
    }
    const x=(i+.5)*spacing;
    const half=Math.max(1.3*d,amp*h*.39);
    const edge=Math.abs((i/(count-1))-.5)*2;
    const alpha=.48+(1-edge)*.45;
    ctx.strokeStyle=`rgba(230,243,254,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x,mid-half);
    ctx.lineTo(x,mid+half);
    ctx.stroke();
  }

  ctx.shadowBlur=0;
  raf=requestAnimationFrame(drawWave);
}

async function tryPlay(user=false){
  try{ if(user) await ensureAudioGraph(); await els.audio.play(); if(user) await ensureAudioGraph(); setPlaying(true); setState("Live audio playing"); return true; }
  catch{ setPlaying(false); setState("Tap play to start audio"); return false; }
}

async function loadStation(){
  streamRecovery=0; roundOver=true; current=null; triesLeft=5; lastDistance=null; els.attempts.textContent="5"; els.input.value=""; els.input.disabled=true; els.guessButton.disabled=true; els.feedback.textContent=""; els.feedback.className="feedback"; els.stationActions.hidden=true; els.nowPlaying.textContent="Mystery station"; setState("Finding a station…"); closeSuggestions();
  try{
    const q=await fetchJson("/api/radio"); if(!q.ready) throw new Error(q.error||"Radio unavailable"); current=q;
    els.audio.pause(); els.audio.src=q.stream; els.audio.volume=Number(els.volume.value); els.audio.load();
    roundOver=false; els.input.disabled=false; els.guessButton.disabled=false;
    setState("Starting live audio…"); await tryPlay(false);
  }catch(e){ setState("Station unavailable"); els.feedback.className="feedback wrong"; els.feedback.textContent=e.message; }
}

function buildSuggestions(q){q=normalize(q);if(!q)return[];const starts=COUNTRY_NAMES.filter(n=>normalize(n).startsWith(q));const contains=COUNTRY_NAMES.filter(n=>!starts.includes(n)&&normalize(n).includes(q));const fuzzy=COUNTRY_NAMES.filter(n=>!starts.includes(n)&&!contains.includes(n)).map(n=>({n,d:levenshtein(q,n)})).filter(x=>x.d<=Math.max(2,Math.floor(q.length*.28))).sort((a,b)=>a.d-b.d).map(x=>x.n);return [...starts,...contains,...fuzzy].slice(0,7)}
function renderSuggestions(){currentSuggestions=buildSuggestions(els.input.value);activeSuggestion=-1;els.suggestions.innerHTML=currentSuggestions.map((n,i)=>`<button class="suggestion" type="button" data-index="${i}">${escapeHtml(n)}</button>`).join("");els.suggestions.classList.toggle("open",currentSuggestions.length>0);els.input.setAttribute("aria-expanded",String(currentSuggestions.length>0))}
function closeSuggestions(){els.suggestions.classList.remove("open");els.suggestions.innerHTML="";els.input.setAttribute("aria-expanded","false");activeSuggestion=-1}
function chooseSuggestion(i){if(!currentSuggestions[i])return;els.input.value=currentSuggestions[i];closeSuggestions();els.input.focus()}
function updateActive(){[...els.suggestions.querySelectorAll(".suggestion")].forEach((e,i)=>e.classList.toggle("active",i===activeSuggestion))}

function haversine(a,b){const R=6371,toRad=x=>x*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),la1=toRad(a.lat),la2=toRad(b.lat);const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(x)))}
function bearing(a,b){const toRad=x=>x*Math.PI/180,toDeg=x=>x*180/Math.PI,la1=toRad(a.lat),la2=toRad(b.lat),dl=toRad(b.lon-a.lon);let d=(toDeg(Math.atan2(Math.sin(dl)*Math.cos(la2),Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dl)))+360)%360;const dirs=["north","northeast","east","southeast","south","southwest","west","northwest"];return dirs[Math.round(d/45)%8]}
async function distanceHint(guess,answer){
  try{const [g,a]=await Promise.all([fetchJson(`/api/country-location?name=${encodeURIComponent(guess)}`),fetchJson(`/api/country-location?name=${encodeURIComponent(answer)}`)]);if(!g.ready||!a.ready)return null;const km=haversine(g,a),dir=bearing(g,a);let temp="";if(lastDistance!=null)temp=km<lastDistance?" · warmer":km>lastDistance?" · colder":"";lastDistance=km;return `${km.toLocaleString()} km away · head ${dir}${temp}`;}catch{return null}
}

async function checkGuess(){
  if(!current||roundOver)return; const raw=els.input.value.trim(); if(!raw){els.feedback.className="feedback wrong";els.feedback.textContent="Type a country first.";return}
  const corrected=canonicalCountry(raw); if(!corrected){els.feedback.className="feedback wrong";els.feedback.textContent="Choose a country from the list, or check the spelling.";return}
  if(normalize(corrected)!==normalize(raw)) els.input.value=corrected; closeSuggestions();
  if(comparable(corrected)===comparable(current.answer)){
    roundOver=true; score+=100+triesLeft*20; els.score.textContent=String(score); els.feedback.className="feedback correct"; els.feedback.innerHTML=`<strong>Correct.</strong> ${escapeHtml(current.station||"This station")} is from ${escapeHtml(current.place||"a city")}, ${escapeHtml(current.answer)}.`; finishRound(); return;
  }
  triesLeft--; els.attempts.textContent=String(triesLeft); els.guessButton.disabled=true; const hint=await distanceHint(corrected,current.answer); els.guessButton.disabled=false;
  if(triesLeft<=0){roundOver=true;els.feedback.className="feedback wrong";els.feedback.innerHTML=`<strong>Round over.</strong> The station is from ${escapeHtml(current.place||"a city")}, ${escapeHtml(current.answer)}.${hint?`<span class="hint-line">Your last guess was ${escapeHtml(hint)}.</span>`:""}`;finishRound();return}
  els.feedback.className="feedback wrong";els.feedback.innerHTML=`<strong>Not quite.</strong> ${triesLeft} ${triesLeft===1?"try":"tries"} left.${hint?`<span class="hint-line">${escapeHtml(hint)}.</span>`:""}`; els.input.select();
}
function finishRound(){els.input.disabled=true;els.guessButton.disabled=true;els.stationActions.hidden=false;els.nowPlaying.textContent=`${current.place||"Unknown city"}, ${current.answer}`}

els.play.addEventListener("click",async()=>{await ensureAudioGraph();if(els.audio.paused)await tryPlay(true);else{els.audio.pause();setPlaying(false);setState("Paused")}});
els.restart.addEventListener("click",async()=>{if(!current)return;await ensureAudioGraph();els.audio.pause();els.audio.src=current.stream;els.audio.load();setState("Restarting stream…");await tryPlay(true)});
els.volumeToggle.addEventListener("click",()=>els.volumeToggle.closest(".volume-control").classList.toggle("open"));els.volume.addEventListener("input",()=>els.audio.volume=Number(els.volume.value));
els.audio.addEventListener("play",()=>setPlaying(true));els.audio.addEventListener("pause",()=>setPlaying(false));els.audio.addEventListener("waiting",()=>setState("Buffering…"));els.audio.addEventListener("playing",()=>setState("Live audio playing"));els.audio.addEventListener("error",()=>{
  setPlaying(false);
  if(current&&!roundOver&&streamRecovery<2){
    streamRecovery++;
    setState("Station dropped — finding another…");
    setTimeout(loadStation,450);
    return;
  }
  setState("Stream unavailable");
  els.feedback.className="feedback wrong";
  els.feedback.textContent="This station stopped responding. Start a new round to try another station.";
});
function unlock(){ensureAudioGraph().then(ok=>{if(ok&&els.audio.paused)tryPlay(true)}).catch(()=>{});document.removeEventListener("pointerdown",unlock,true);document.removeEventListener("keydown",unlock,true)}
document.addEventListener("pointerdown",unlock,true);document.addEventListener("keydown",unlock,true);
els.input.addEventListener("input",renderSuggestions);els.input.addEventListener("keydown",e=>{if(!els.suggestions.classList.contains("open"))return;if(e.key==="ArrowDown"){e.preventDefault();activeSuggestion=Math.min(activeSuggestion+1,currentSuggestions.length-1);updateActive()}else if(e.key==="ArrowUp"){e.preventDefault();activeSuggestion=Math.max(activeSuggestion-1,0);updateActive()}else if(e.key==="Enter"&&activeSuggestion>=0){e.preventDefault();chooseSuggestion(activeSuggestion)}else if(e.key==="Escape")closeSuggestions()});
els.suggestions.addEventListener("mousedown",e=>{const b=e.target.closest(".suggestion");if(!b)return;e.preventDefault();chooseSuggestion(Number(b.dataset.index))});document.addEventListener("click",e=>{if(!e.target.closest(".country-combobox"))closeSuggestions()});els.form.addEventListener("submit",e=>{e.preventDefault();checkGuess()});els.next.addEventListener("click",loadStation);window.addEventListener("resize",resizeCanvas);
if(!raf)drawWave();loadStation();
