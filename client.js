"use strict";

const REGION_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(/\s+/);
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_ENTRIES = REGION_CODES.map(code => ({ code, name: displayNames.of(code) })).filter(x => x.name);
const COUNTRY_NAMES = [...new Set(COUNTRY_ENTRIES.map(x => x.name))].sort((a,b)=>a.localeCompare(b));
const COUNTRY_CODE = new Map(COUNTRY_ENTRIES.map(x => [normalize(x.name), x.code]));
const ALIASES = new Map(Object.entries({
  usa:"United States",us:"United States","united states of america":"United States",america:"United States",
  uk:"United Kingdom",britain:"United Kingdom","great britain":"United Kingdom",uae:"United Arab Emirates",
  "south korea":"South Korea","north korea":"North Korea","czech republic":"Czechia",turkey:"Türkiye",turkiye:"Türkiye",
  "ivory coast":"Côte d’Ivoire","cote d ivoire":"Côte d’Ivoire","cape verde":"Cabo Verde",swaziland:"Eswatini",
  burma:"Myanmar","east timor":"Timor-Leste",vatican:"Vatican City"
}));
const $ = id => document.getElementById(id);

const radio = {
  view: $("radio-view"), audio: $("radio-player"), canvas: $("waveform"), state: $("audio-state"), play: $("play-pause"), restart: $("restart"),
  volumeToggle: $("volume-toggle"), volume: $("volume"), input: $("country-input"), suggestions: $("country-suggestions"), form: $("guess-form"),
  guessButton: $("guess-form").querySelector(".guess-button"), feedback: $("feedback"), next: $("next-after-answer"), actions: $("station-actions"),
  board: $("previous-guesses"), rows: $("previous-guesses-list"), slots: $("guess-slots")
};
const flight = {
  view: $("flight-view"), from: $("flight-from"), to: $("flight-to"), number: $("flight-number"), airline: $("flight-airline"), altitude: $("flight-altitude"), speed: $("flight-speed"), marker: $("plane-marker"),
  path: $("flight-route-path"), depDot: $("flight-departure-dot"), arrDot: $("flight-arrival-dot"),
  question: $("flight-question"), input: $("flight-country-input"), suggestions: $("flight-country-suggestions"), form: $("flight-guess-form"), guessButton: $("flight-guess-form").querySelector(".guess-button"), feedback: $("flight-feedback"), actions: $("flight-actions"), next: $("next-flight"),
  board: $("flight-previous-guesses"), rows: $("flight-previous-guesses-list"), slots: $("flight-guess-slots")
};
const news = {
  view: $("news-view"), title: $("news-title"), description: $("news-description"), source: $("news-source"), date: $("news-date"),
  question: $("news-question"), input: $("news-country-input"), suggestions: $("news-country-suggestions"), form: $("news-guess-form"), guessButton: $("news-guess-form").querySelector(".guess-button"), feedback: $("news-feedback"), actions: $("news-actions"), next: $("next-news"),
  board: $("news-previous-guesses"), rows: $("news-previous-guesses-list"), slots: $("news-guess-slots")
};

let currentRadio=null, radioTries=5, radioOver=false, radioLastDistance=null, radioHistory=[], streamRecovery=0;
let currentFlight=null, flightTries=5, flightOver=false, flightLastDistance=null, flightHistory=[];
let currentNews=null, newsTries=5, newsOver=false, newsLastDistance=null, newsHistory=[];
let audioContext=null, analyser=null, sourceNode=null, raf=null, smoothBars=[], normalizedEnvelope=.12;

function normalize(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"").replace(/[^a-zA-Z0-9]+/g," ").trim().toLowerCase()}
const LOOKUP=new Map(COUNTRY_NAMES.map(n=>[normalize(n),n])); for(const [a,n] of ALIASES) LOOKUP.set(normalize(a),n);
function levenshtein(a,b){a=normalize(a);b=normalize(b);const p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let last=p[0];p[0]=i;for(let j=1;j<=b.length;j++){const old=p[j];p[j]=Math.min(p[j]+1,p[j-1]+1,last+(a[i-1]===b[j-1]?0:1));last=old}}return p[b.length]}
function canonicalCountry(v){const k=normalize(v);if(!k)return null;if(LOOKUP.has(k))return LOOKUP.get(k);let best=null,d=Infinity;for(const [ck,n] of LOOKUP){const x=levenshtein(k,ck);if(x<d){d=x;best=n}}const limit=k.length<=5?1:k.length<=9?2:3;return d<=limit?best:null}
function comparable(v){return normalize(canonicalCountry(v)||v).replace(/^the /,"")}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function fetchJson(url){const r=await fetch(url,{cache:"no-store"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`${r.status} ${r.statusText}`);return b}
function flagFor(country){const canonical=canonicalCountry(country)||country;const code=COUNTRY_CODE.get(normalize(canonical));return code?String.fromCodePoint(...code.split("").map(c=>127397+c.charCodeAt(0))):"🌐"}

function buildSuggestions(q){q=normalize(q);if(!q)return[];const starts=COUNTRY_NAMES.filter(n=>normalize(n).startsWith(q));const contains=COUNTRY_NAMES.filter(n=>!starts.includes(n)&&normalize(n).includes(q));const fuzzy=COUNTRY_NAMES.filter(n=>!starts.includes(n)&&!contains.includes(n)).map(n=>({n,d:levenshtein(q,n)})).filter(x=>x.d<=Math.max(2,Math.floor(q.length*.28))).sort((a,b)=>a.d-b.d).map(x=>x.n);return [...starts,...contains,...fuzzy].slice(0,7)}
function wireCombobox(input,suggestions){
  let list=[],active=-1;
  const close=()=>{suggestions.classList.remove("open");suggestions.innerHTML="";input.setAttribute("aria-expanded","false");active=-1};
  const choose=i=>{if(!list[i])return;input.value=list[i];close();input.focus()};
  const update=()=>[...suggestions.querySelectorAll(".suggestion")].forEach((e,i)=>e.classList.toggle("active",i===active));
  input.addEventListener("input",()=>{list=buildSuggestions(input.value);active=-1;suggestions.innerHTML=list.map((n,i)=>`<button class="suggestion" type="button" data-index="${i}">${escapeHtml(n)}</button>`).join("");suggestions.classList.toggle("open",list.length>0);input.setAttribute("aria-expanded",String(list.length>0))});
  input.addEventListener("keydown",e=>{if(!suggestions.classList.contains("open"))return;if(e.key==="ArrowDown"){e.preventDefault();active=Math.min(active+1,list.length-1);update()}else if(e.key==="ArrowUp"){e.preventDefault();active=Math.max(active-1,0);update()}else if(e.key==="Enter"&&active>=0){e.preventDefault();choose(active)}else if(e.key==="Escape")close()});
  suggestions.addEventListener("mousedown",e=>{const b=e.target.closest(".suggestion");if(!b)return;e.preventDefault();choose(Number(b.dataset.index))});
  document.addEventListener("click",e=>{if(!e.target.closest(".country-combobox"))close()});
  return close;
}
const closeRadioSuggestions=wireCombobox(radio.input,radio.suggestions);
const closeFlightSuggestions=wireCombobox(flight.input,flight.suggestions);
const closeNewsSuggestions=wireCombobox(news.input,news.suggestions);

function haversine(a,b){const R=6371,toRad=x=>x*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),la1=toRad(a.lat),la2=toRad(b.lat);const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(x)))}
function bearing(a,b){const toRad=x=>x*Math.PI/180,toDeg=x=>x*180/Math.PI,la1=toRad(a.lat),la2=toRad(b.lat),dl=toRad(b.lon-a.lon);let d=(toDeg(Math.atan2(Math.sin(dl)*Math.cos(la2),Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dl)))+360)%360;const dirs=["North","Northeast","East","Southeast","South","Southwest","West","Northwest"];return dirs[Math.round(d/45)%8]}
async function distanceHint(guess,answer,lastDistance){
  try{const [g,a]=await Promise.all([fetchJson(`/api/country-location?name=${encodeURIComponent(guess)}`),fetchJson(`/api/country-location?name=${encodeURIComponent(answer)}`)]);if(!g.ready||!a.ready)return null;const km=haversine(g,a),direction=bearing(g,a);const temperature=lastDistance==null?null:km<lastDistance?"warmer":km>lastDistance?"colder":"same";return {km,direction,temperature};}catch{return null}
}

/* ---------------- Radio ---------------- */
function setPlaying(playing){radio.play.classList.toggle("paused",!playing);radio.play.setAttribute("aria-label",playing?"Pause radio":"Play radio")}
function setState(t){radio.state.textContent=t}
async function ensureAudioGraph(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return false;
  try{
    if(!audioContext)audioContext=new AudioCtx();
    if(!analyser){analyser=audioContext.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=.54;sourceNode=audioContext.createMediaElementSource(radio.audio);sourceNode.connect(analyser);analyser.connect(audioContext.destination)}
    if(audioContext.state==="suspended")await audioContext.resume();return audioContext.state==="running";
  }catch(e){console.warn("Audio analyser unavailable",e);return false}
}
function resizeCanvas(){const r=radio.canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));if(radio.canvas.width!==w||radio.canvas.height!==h){radio.canvas.width=w;radio.canvas.height=h;smoothBars=[]}}
function drawWave(){
  resizeCanvas();const ctx=radio.canvas.getContext("2d"),w=radio.canvas.width,h=radio.canvas.height,d=Math.min(devicePixelRatio||1,2),mid=h/2;ctx.clearRect(0,0,w,h);
  const spacingTarget=8.5*d,count=Math.max(72,Math.floor(w/spacingTarget)),spacing=w/count,data=new Uint8Array(analyser?.fftSize||4096),live=!!(analyser&&audioContext?.state==="running"&&!radio.audio.paused);
  if(live)analyser.getByteTimeDomainData(data);if(smoothBars.length!==count)smoothBars=new Array(count).fill(.018);
  let framePeak=.001;
  if(live){for(let i=0;i<data.length;i++)framePeak=Math.max(framePeak,Math.abs(data[i]-128)/128);normalizedEnvelope=normalizedEnvelope*.90+framePeak*.10}
  const gain=live?Math.min(5.6,Math.max(1.45,.56/Math.max(normalizedEnvelope,.035))):1;
  const raw=new Array(count).fill(.018);
  for(let i=0;i<count;i++){
    if(!live)continue;const a=Math.floor(i*data.length/count),b=Math.max(a+1,Math.floor((i+1)*data.length/count));let peak=0,rms=0,n=0;
    for(let j=a;j<b;j++){const s=Math.abs(data[j]-128)/128;peak=Math.max(peak,s);rms+=s*s;n++}
    rms=Math.sqrt(rms/Math.max(1,n));let v=(peak*.58+rms*.82)*gain;v=Math.pow(Math.min(1,v),.72);raw[i]=Math.max(.018,Math.min(.98,v));
  }
  for(let i=0;i<count;i++){
    const neighbor=(raw[Math.max(0,i-1)]+raw[i]+raw[Math.min(count-1,i+1)])/3;const target=raw[i]*.72+neighbor*.28;const cur=smoothBars[i]??.018;const ease=target>cur?.27:.14;smoothBars[i]=cur+(target-cur)*ease;
  }
  ctx.lineWidth=Math.max(1.3*d,2);ctx.lineCap="round";ctx.shadowColor="rgba(98,174,240,.18)";ctx.shadowBlur=3*d;
  for(let i=0;i<count;i++){const x=(i+.5)*spacing,half=Math.max(1.4*d,smoothBars[i]*h*.43),edge=Math.abs((i/(count-1))-.5)*2,alpha=.66+(1-edge)*.28;ctx.strokeStyle=`rgba(9,127,232,${alpha.toFixed(3)})`;ctx.beginPath();ctx.moveTo(x,mid-half);ctx.lineTo(x,mid+half);ctx.stroke()}
  ctx.shadowBlur=0;raf=requestAnimationFrame(drawWave);
}
async function tryPlay(user=false){try{if(user)await ensureAudioGraph();await radio.audio.play();if(user)await ensureAudioGraph();setPlaying(true);setState("Live audio playing");return true}catch{setPlaying(false);setState("Tap play to start audio");return false}}
function renderRadioHistory(){
  radio.board.hidden=radioHistory.length===0;
  radio.rows.innerHTML=radioHistory.map(g=>`<div class="guess-row"><div class="guess-pill guess-country"><span class="guess-flag">${flagFor(g.country)}</span><span>${escapeHtml(g.country)}</span></div><div class="guess-pill"><span class="guess-icon">${distanceIcon()}</span><span>${g.hint?`${g.hint.km.toLocaleString()} km`:"—"}</span></div><div class="guess-pill"><span class="guess-icon">${compassIcon()}</span><span>${g.hint?escapeHtml(g.hint.direction):"—"}</span></div></div>`).join("");
  const remaining=Math.max(0,5-radioHistory.length);radio.slots.innerHTML=remaining?`<div class="guess-slot"></div><div class="guess-slot"></div><div class="guess-slot"></div>`:"";
}
function renderGameHistory(ui,history){
  ui.board.hidden=history.length===0;
  ui.rows.innerHTML=history.map(g=>`<div class="guess-row"><div class="guess-pill guess-country"><span class="guess-flag">${flagFor(g.country)}</span><span>${escapeHtml(g.country)}</span></div><div class="guess-pill"><span class="guess-icon">${distanceIcon()}</span><span>${g.hint?`${g.hint.km.toLocaleString()} km`:"—"}</span></div><div class="guess-pill"><span class="guess-icon">${compassIcon()}</span><span>${g.hint?escapeHtml(g.hint.direction):"—"}</span></div></div>`).join("");
  const remaining=Math.max(0,5-history.length);ui.slots.innerHTML=remaining?`<div class="guess-slot"></div><div class="guess-slot"></div><div class="guess-slot"></div>`:"";
}
function distanceIcon(){return `<svg viewBox="0 0 24 24"><path d="M5 5h4a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h12"/><circle cx="5" cy="5" r="1.5"/><circle cx="19" cy="17" r="1.5"/></svg>`}
function compassIcon(){return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m15 9-2 5-5 2 2-5 5-2Z"/></svg>`}
async function loadStation(){
  streamRecovery=0;radioOver=true;currentRadio=null;radioTries=5;radioLastDistance=null;radioHistory=[];radio.input.value="";radio.input.disabled=true;radio.guessButton.disabled=true;radio.form.hidden=false;radio.feedback.textContent="";radio.feedback.className="feedback";radio.actions.hidden=true;renderRadioHistory();setState("Finding a station…");closeRadioSuggestions();
  try{const q=await fetchJson("/api/radio");if(!q.ready)throw new Error(q.error||"Radio unavailable");currentRadio=q;radio.audio.pause();radio.audio.src=q.stream;radio.audio.volume=Number(radio.volume.value);radio.audio.load();radioOver=false;radio.input.disabled=false;radio.guessButton.disabled=false;setState("Starting live audio…");await tryPlay(false)}catch(e){setState("Station unavailable");radio.feedback.className="feedback wrong";radio.feedback.textContent=e.message}
}
async function checkRadioGuess(){
  if(!currentRadio||radioOver)return;const raw=radio.input.value.trim();if(!raw){radio.feedback.className="feedback wrong";radio.feedback.textContent="Type a country first.";return}const corrected=canonicalCountry(raw);if(!corrected){radio.feedback.className="feedback wrong";radio.feedback.textContent="Choose a country from the list, or check the spelling.";return}radio.input.value=corrected;closeRadioSuggestions();
  const correct=comparable(corrected)===comparable(currentRadio.answer);let hint=correct?{km:0,direction:"Correct",temperature:null}:await distanceHint(corrected,currentRadio.answer,radioLastDistance);if(hint&&!correct)radioLastDistance=hint.km;radioHistory.push({country:corrected,hint,correct});renderRadioHistory();
  if(correct){radioOver=true;radio.feedback.className="feedback correct";radio.feedback.innerHTML=`<strong>Correct.</strong> The country was ${escapeHtml(currentRadio.answer)}.`;finishRadioRound();return}
  radioTries--;if(radioTries<=0){radioOver=true;radio.feedback.className="feedback wrong";radio.feedback.innerHTML=`<strong>Round over.</strong> The country was ${escapeHtml(currentRadio.answer)}.`;finishRadioRound();return}
  radio.feedback.className="feedback wrong";radio.feedback.innerHTML=`<strong>Not quite.</strong> ${radioTries} ${radioTries===1?"try":"tries"} left.${hint?`<span class="hint-line">${hint.km.toLocaleString()} km away · head ${escapeHtml(hint.direction.toLowerCase())}${hint.temperature?` · ${hint.temperature}`:""}.</span>`:""}`;radio.input.value="";radio.input.focus();
}
function finishRadioRound(){radio.input.disabled=true;radio.guessButton.disabled=true;radio.form.hidden=true;radio.actions.hidden=false}

/* ---------------- Flights ---------------- */
function resetFlightVisual(){flight.from.textContent="---";flight.to.textContent="---";flight.number.textContent="—";flight.airline.textContent="—";flight.altitude.textContent="—";flight.speed.textContent="—";flight.path.setAttribute("d","M60 150 Q340 40 620 150");flight.marker.setAttribute("transform","translate(340 80)");flight.question.textContent="Finding an active flight…"}
function toVec(lat,lon){const p=lat*Math.PI/180,l=lon*Math.PI/180;return [Math.cos(p)*Math.cos(l),Math.cos(p)*Math.sin(l),Math.sin(p)]}
function fromVec(v){const m=Math.hypot(...v)||1,x=v[0]/m,y=v[1]/m,z=v[2]/m;return {lat:Math.asin(z)*180/Math.PI,lon:Math.atan2(y,x)*180/Math.PI}}
function greatCircle(a,b,steps=48){const va=toVec(a.lat,a.lon),vb=toVec(b.lat,b.lon),dot=Math.max(-1,Math.min(1,va[0]*vb[0]+va[1]*vb[1]+va[2]*vb[2])),omega=Math.acos(dot),sin=Math.sin(omega);const out=[];for(let i=0;i<=steps;i++){const t=i/steps;if(sin<1e-6){out.push({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t});continue}const u=Math.sin((1-t)*omega)/sin,v=Math.sin(t*omega)/sin;out.push(fromVec([va[0]*u+vb[0]*v,va[1]*u+vb[1]*v,va[2]*u+vb[2]*v]))}for(let i=1;i<out.length;i++){while(out[i].lon-out[i-1].lon>180)out[i].lon-=360;while(out[i].lon-out[i-1].lon<-180)out[i].lon+=360}return out}
function projectFlightRoute(q){const dep=q.route?.departure,arr=q.route?.arrival;if(!dep||!arr)return;const pts=greatCircle(dep,arr),extra=q.live?[{lat:q.live.lat,lon:q.live.lon}]:[];const all=[...pts,...extra];let minLon=Math.min(...pts.map(p=>p.lon)),maxLon=Math.max(...pts.map(p=>p.lon)),minLat=Math.min(...pts.map(p=>p.lat)),maxLat=Math.max(...pts.map(p=>p.lat));const lonSpan=Math.max(8,maxLon-minLon),latSpan=Math.max(8,maxLat-minLat);minLon-=(lonSpan*.08);maxLon+=(lonSpan*.08);minLat-=(latSpan*.24);maxLat+=(latSpan*.24);const project=p=>({x:48+(p.lon-minLon)/(maxLon-minLon)*584,y:184-(p.lat-minLat)/(maxLat-minLat)*142});const xy=pts.map(project);flight.path.setAttribute("d",xy.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "));const d=xy[0],a=xy[xy.length-1];flight.depDot.setAttribute("cx",d.x);flight.depDot.setAttribute("cy",d.y);flight.arrDot.setAttribute("cx",a.x);flight.arrDot.setAttribute("cy",a.y);flight.from.setAttribute("x",d.x);flight.from.setAttribute("y",Math.min(210,d.y+26));flight.to.setAttribute("x",a.x);flight.to.setAttribute("y",Math.min(210,a.y+26));let mark=xy[Math.floor(xy.length/2)],angle=0;if(q.live){let live={lat:q.live.lat,lon:q.live.lon};while(live.lon-dep.lon>180)live.lon-=360;while(live.lon-dep.lon<-180)live.lon+=360;mark=project(live);const nearest=xy.reduce((best,p,i)=>Math.hypot(p.x-mark.x,p.y-mark.y)<best.d?{d:Math.hypot(p.x-mark.x,p.y-mark.y),i}:best,{d:Infinity,i:0}).i;const p1=xy[Math.max(0,nearest-1)],p2=xy[Math.min(xy.length-1,nearest+1)];angle=Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI+90}else{const i=Math.floor(xy.length/2),p1=xy[i-1],p2=xy[i+1];angle=Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI+90}flight.marker.setAttribute("transform",`translate(${mark.x.toFixed(1)} ${mark.y.toFixed(1)}) rotate(${angle.toFixed(1)})`)}
function fillFlightVisual(q){
  flight.from.textContent=q.route?.departure?.iata||"DEP";flight.to.textContent=q.route?.arrival?.iata||"ARR";flight.number.textContent=q.flight||"Active flight";flight.airline.textContent=q.airline||"Airline";flight.altitude.textContent=q.live?.altitudeM?`${Math.round(q.live.altitudeM).toLocaleString()} m`:"Route data";flight.speed.textContent=q.live?.speedKmh?`${Math.round(q.live.speedKmh).toLocaleString()} km/h`:"—";flight.question.textContent=q.prompt||"Which country is connected to this flight?";projectFlightRoute(q);
}
async function loadFlight(){
  flightOver=true;currentFlight=null;flightTries=5;flightLastDistance=null;flightHistory=[];renderGameHistory(flight,flightHistory);flight.input.value="";flight.input.disabled=true;flight.guessButton.disabled=true;flight.form.hidden=false;flight.actions.hidden=true;flight.feedback.textContent="";flight.feedback.className="feedback";resetFlightVisual();closeFlightSuggestions();
  try{const q=await fetchJson("/api/flights");if(!q.ready)throw new Error(q.error||"Flight data unavailable");currentFlight=q;flightOver=false;fillFlightVisual(q);flight.input.disabled=false;flight.guessButton.disabled=false}catch(e){flight.question.textContent="Flight unavailable";flight.feedback.className="feedback wrong";flight.feedback.textContent=e.message}
}
async function checkFlightGuess(){
  if(!currentFlight||flightOver)return;const raw=flight.input.value.trim();if(!raw){flight.feedback.className="feedback wrong";flight.feedback.textContent="Type a country first.";return}const corrected=canonicalCountry(raw);if(!corrected){flight.feedback.className="feedback wrong";flight.feedback.textContent="Choose a country from the list, or check the spelling.";return}flight.input.value=corrected;closeFlightSuggestions();
  const correct=comparable(corrected)===comparable(currentFlight.answer);let hint=correct?{km:0,direction:"Correct",temperature:null}:await distanceHint(corrected,currentFlight.answer,flightLastDistance);if(hint&&!correct)flightLastDistance=hint.km;flightHistory.push({country:corrected,hint,correct});renderGameHistory(flight,flightHistory);
  if(correct){flightOver=true;flight.feedback.className="feedback correct";flight.feedback.innerHTML=`<strong>Correct.</strong> ${escapeHtml(currentFlight.reveal||currentFlight.answer)}`;finishFlightRound();return}
  flightTries--;if(flightTries<=0){flightOver=true;flight.feedback.className="feedback wrong";flight.feedback.innerHTML=`<strong>Round over.</strong> ${escapeHtml(currentFlight.reveal||`The answer was ${currentFlight.answer}.`)}`;finishFlightRound();return}
  flight.feedback.className="feedback wrong";flight.feedback.innerHTML=`<strong>Not quite.</strong> ${flightTries} ${flightTries===1?"try":"tries"} left.${hint?`<span class="hint-line">${hint.km.toLocaleString()} km away · head ${escapeHtml(hint.direction.toLowerCase())}${hint.temperature?` · ${hint.temperature}`:""}.</span>`:""}`;flight.input.value="";flight.input.focus();
}
function finishFlightRound(){flight.input.disabled=true;flight.guessButton.disabled=true;flight.form.hidden=true;flight.actions.hidden=false}


/* ---------------- Newspaper ---------------- */
function resetNewsVisual(){news.title.textContent="Finding a story…";news.description.textContent="";news.source.textContent="World desk";news.date.textContent="Today";news.question.textContent="Finding a current headline…"}
function fillNewsVisual(q){news.title.textContent=q.title||"Untitled story";news.description.textContent=q.description||"";news.source.textContent=q.source||"News source";news.date.textContent=q.publishedAt?new Intl.DateTimeFormat("en",{month:"short",day:"numeric",year:"numeric"}).format(new Date(q.publishedAt)):"Current";news.question.textContent=q.prompt||"Which country is this story about?"}
async function loadNews(){newsOver=true;currentNews=null;newsTries=5;newsLastDistance=null;newsHistory=[];renderGameHistory(news,newsHistory);news.input.value="";news.input.disabled=true;news.guessButton.disabled=true;news.form.hidden=false;news.actions.hidden=true;news.feedback.textContent="";news.feedback.className="feedback";resetNewsVisual();closeNewsSuggestions();try{const q=await fetchJson("/api/news");if(!q.ready)throw new Error(q.error||"News unavailable");currentNews=q;newsOver=false;fillNewsVisual(q);news.input.disabled=false;news.guessButton.disabled=false}catch(e){news.question.textContent="News unavailable";news.feedback.className="feedback wrong";news.feedback.textContent=e.message}}
async function checkNewsGuess(){
  if(!currentNews||newsOver)return;const raw=news.input.value.trim();if(!raw){news.feedback.className="feedback wrong";news.feedback.textContent="Type a country first.";return}const corrected=canonicalCountry(raw);if(!corrected){news.feedback.className="feedback wrong";news.feedback.textContent="Choose a country from the list, or check the spelling.";return}news.input.value=corrected;closeNewsSuggestions();
  const correct=comparable(corrected)===comparable(currentNews.answer);let hint=correct?{km:0,direction:"Correct",temperature:null}:await distanceHint(corrected,currentNews.answer,newsLastDistance);if(hint&&!correct)newsLastDistance=hint.km;newsHistory.push({country:corrected,hint,correct});renderGameHistory(news,newsHistory);
  if(correct){newsOver=true;news.feedback.className="feedback correct";news.feedback.innerHTML=`<strong>Correct.</strong> ${escapeHtml(currentNews.reveal||currentNews.answer)}`;finishNewsRound();return}
  newsTries--;if(newsTries<=0){newsOver=true;news.feedback.className="feedback wrong";news.feedback.innerHTML=`<strong>Round over.</strong> The country was ${escapeHtml(currentNews.answer)}.`;finishNewsRound();return}
  news.feedback.className="feedback wrong";news.feedback.innerHTML=`<strong>Not quite.</strong> ${newsTries} ${newsTries===1?"try":"tries"} left.${hint?`<span class="hint-line">${hint.km.toLocaleString()} km away · head ${escapeHtml(hint.direction.toLowerCase())}${hint.temperature?` · ${hint.temperature}`:""}.</span>`:""}`;news.input.value="";news.input.focus();
}
function finishNewsRound(){news.input.disabled=true;news.guessButton.disabled=true;news.form.hidden=true;news.actions.hidden=false}

/* ---------------- Navigation + events ---------------- */
function switchGame(target){
  document.querySelectorAll(".game-view").forEach(v=>{const on=v.dataset.game===target;v.hidden=!on;v.classList.toggle("active",on)});document.querySelectorAll(".game-nav-button[data-target]").forEach(b=>b.classList.toggle("active",b.dataset.target===target));
  if(target!=="radio"&&!radio.audio.paused){radio.audio.pause();setPlaying(false);setState("Paused")}
  if(target==="flight"&&!currentFlight)loadFlight();else if(target==="news"&&!currentNews)loadNews();else if(target==="radio"&&currentRadio&&!radioOver)setState(radio.audio.paused?"Tap play to start audio":"Live audio playing");
}
document.querySelectorAll(".game-nav-button[data-target]").forEach(b=>b.addEventListener("click",()=>switchGame(b.dataset.target)));
radio.play.addEventListener("click",async()=>{await ensureAudioGraph();if(radio.audio.paused)await tryPlay(true);else{radio.audio.pause();setPlaying(false);setState("Paused")}});
radio.restart.addEventListener("click",async()=>{if(!currentRadio)return;await ensureAudioGraph();radio.audio.pause();radio.audio.src=currentRadio.stream;radio.audio.load();setState("Restarting stream…");await tryPlay(true)});
radio.volumeToggle.addEventListener("click",()=>radio.volumeToggle.closest(".volume-control").classList.toggle("open"));radio.volume.addEventListener("input",()=>radio.audio.volume=Number(radio.volume.value));
radio.audio.addEventListener("play",()=>setPlaying(true));radio.audio.addEventListener("pause",()=>setPlaying(false));radio.audio.addEventListener("waiting",()=>setState("Buffering…"));radio.audio.addEventListener("playing",()=>setState("Live audio playing"));radio.audio.addEventListener("error",()=>{setPlaying(false);if(currentRadio&&!radioOver&&streamRecovery<2){streamRecovery++;setState("Station dropped — finding another…");setTimeout(loadStation,450);return}setState("Stream unavailable");radio.feedback.className="feedback wrong";radio.feedback.textContent="This station stopped responding. Press Next to try another station.";radio.form.hidden=true;radio.actions.hidden=false});
function unlock(){ensureAudioGraph().then(ok=>{if(ok&&radio.audio.paused&&!radio.view.hidden)tryPlay(true)}).catch(()=>{});document.removeEventListener("pointerdown",unlock,true);document.removeEventListener("keydown",unlock,true)}document.addEventListener("pointerdown",unlock,true);document.addEventListener("keydown",unlock,true);
radio.form.addEventListener("submit",e=>{e.preventDefault();checkRadioGuess()});radio.next.addEventListener("click",loadStation);flight.form.addEventListener("submit",e=>{e.preventDefault();checkFlightGuess()});flight.next.addEventListener("click",loadFlight);news.form.addEventListener("submit",e=>{e.preventDefault();checkNewsGuess()});news.next.addEventListener("click",loadNews);window.addEventListener("resize",resizeCanvas);
if(!raf)drawWave();loadStation();
