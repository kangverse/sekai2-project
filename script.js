const types=[
  {name:'Drone',group:'Aerial',desc:'Ascending, orbiting, and long-range flight',a:'#7298a8',b:'#254e54'},
  {name:'Walking',group:'Ground',desc:'First-person paths through real places',a:'#8caf8e',b:'#315b50'},
  {name:'Driving',group:'Vehicle',desc:'Urban roads and long-distance travel',a:'#c68f72',b:'#424f57'},
  {name:'Train',group:'Vehicle',desc:'Extended rail journeys and landscapes',a:'#9c8a72',b:'#39474b'},
  {name:'Boat',group:'Water',desc:'Waterborne motion at multiple scales',a:'#79aebd',b:'#24526a'},
  {name:'Cable Car',group:'Aerial',desc:'Vertical motion and distant vistas',a:'#c1a86a',b:'#725a55'},
  {name:'Static & Pan',group:'Static',desc:'Stable observation with local rotation',a:'#9b91a8',b:'#464256'},
  {name:'Panoramic',group:'360°',desc:'Looping, revisiting, full-view captures',a:'#88ad77',b:'#174d43'}
];
const wallColors=[['#496b70','#172f35'],['#9e8068','#3b433f'],['#6f9279','#21453c'],['#7d7590','#35344a'],['#b18b66','#4d443d']];
document.querySelectorAll('.wall-column').forEach((col,ci)=>{const cards=[...types,...types];cards.forEach((t,i)=>{const d=document.createElement('div');d.className='wall-card';d.style.setProperty('--a',wallColors[(i+ci)%wallColors.length][0]);d.style.setProperty('--b',wallColors[(i+ci)%wallColors.length][1]);d.innerHTML=`<span>${t.name} · ${String((i*17+ci*7)%113+1).padStart(3,'0')}</span>`;col.appendChild(d)})});
document.querySelector('#motion-pills').innerHTML=types.map(x=>`<span class="pill">${x.name}</span>`).join('');
const groups=['All','Aerial','Ground','Vehicle','Water','Static','360°'];
const filters=document.querySelector('#filters');
filters.innerHTML=groups.map((x,i)=>`<button class="filter ${i===0?'active':''}" data-filter="${x}">${x}</button>`).join('');
const grid=document.querySelector('#dataset-grid');
function renderCards(group='All'){
  grid.innerHTML=types.filter(x=>group==='All'||x.group===group).map((x,i)=>`<article class="data-card reveal visible"><div class="card-media" style="--ca:${x.a};--cb:${x.b}"><span class="media-type">${x.group}</span><span class="play">▶</span></div><div class="card-body"><div><h3>${x.name}</h3><small>120 s ready</small></div><p>${x.desc}</p></div></article>`).join('')
}
renderCards();filters.addEventListener('click',e=>{if(!e.target.matches('.filter'))return;filters.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');renderCards(e.target.dataset.filter)});
const fields=[['subject_motion','A drone rises steadily above the valley before banking toward a distant ridge.'],['environment_motion','Cloud shadows drift across the forest while small vehicles move along a winding road.'],['static_scene','A mountain lake is surrounded by evergreen forest, rocky peaks, and scattered snow.'],['camera_description','A stabilized aerial camera ascends, turns gradually, and maintains a wide view.'],['full_prompt','A continuous aerial journey reveals the larger spatial structure of the mountain landscape.']];
document.querySelector('#field-list').innerHTML=fields.map(x=>`<div class="field"><b>${x[0]}</b><p>${x[1]}</p></div>`).join('');
const segColors=['#386889','#51978e','#78aa78','#dda044','#ca6a4f','#7c5ba8'];document.querySelector('#segment-strip').innerHTML=segColors.map((c,i)=>`<span class="segment" style="background:${c}" title="Segment ${i+1}"></span>`).join('');
const timeline=document.querySelector('#timeline'),readout=document.querySelector('#time-readout'),visual=document.querySelector('#timeline-visual');timeline.addEventListener('input',()=>{const n=+timeline.value;readout.textContent=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;visual.style.setProperty('--progress',`${n/1.2}%`)});
const paths={Straight:[[.18,.85],[.22,.2]],Curve:[[.15,.82],[.25,.55],[.52,.38],[.83,.18]],'L-turn':[[.18,.86],[.2,.32],[.66,.3],[.84,.17]],Winding:[[.12,.78],[.28,.58],[.18,.42],[.45,.31],[.35,.17],[.76,.22],[.86,.1]],Loop:[[.22,.75],[.16,.35],[.45,.15],[.75,.3],[.72,.68],[.39,.77],[.22,.75]]};
const tabs=document.querySelector('#trajectory-tabs');tabs.innerHTML=Object.keys(paths).map((x,i)=>`<button class="trajectory-tab ${i===0?'active':''}">${x}</button>`).join('');
const canvas=document.querySelector('#trajectory-canvas'),ctx=canvas.getContext('2d');let current='Straight',phase=0;
function resize(){const d=window.devicePixelRatio||1,r=canvas.getBoundingClientRect();canvas.width=r.width*d;canvas.height=r.height*d;ctx.setTransform(d,0,0,d,0,0)}
function draw(){const r=canvas.getBoundingClientRect(),pts=paths[current].map(([x,y])=>[x*r.width,y*r.height]);ctx.clearRect(0,0,r.width,r.height);ctx.lineWidth=7;ctx.lineCap='round';for(let i=1;i<pts.length;i++){const g=ctx.createLinearGradient(...pts[i-1],...pts[i]);g.addColorStop(0,['#57a58b','#8bbb78','#d5d86c','#e39a59','#b3658f'][Math.min(i-1,4)]);g.addColorStop(1,['#8bbb78','#d5d86c','#e39a59','#b3658f','#7564a5'][Math.min(i-1,4)]);ctx.strokeStyle=g;ctx.beginPath();ctx.moveTo(...pts[i-1]);ctx.lineTo(...pts[i]);ctx.stroke()}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(...pts[0],8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eda45f';ctx.font='24px serif';ctx.fillText('★',pts.at(-1)[0]-12,pts.at(-1)[1]+8);phase=requestAnimationFrame(draw)}
tabs.addEventListener('click',e=>{if(!e.target.matches('button'))return;tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');current=e.target.textContent});window.addEventListener('resize',resize);resize();draw();
const observer=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});document.querySelectorAll('.reveal').forEach(x=>observer.observe(x));
