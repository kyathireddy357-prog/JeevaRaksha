const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,o={}){
  o={credentials:'same-origin',...o};
  if(o.json){o.method=o.method||'POST';o.headers={'Content-Type':'application/json'};o.body=JSON.stringify(o.json)}
  const r=await fetch('/api'+path,o);let d={};try{d=await r.json()}catch{}
  if(!r.ok)throw new Error(Array.isArray(d.detail)?d.detail.map(e=>e.msg).join('; '):d.detail||'Request failed ('+r.status+')');
  return d}
function toast(m,ok=true){const t=$('#toast');t.textContent=m;t.className='toast '+(ok?'ok':'err');t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,4000)}
const act=(a,del)=>`<li><div><strong>${esc(a.title)}</strong><small>${esc(a.kind)} · ${esc(a.created_at)} UTC</small></div>${del?`<button class="btn ghost" data-del="${a.id}">Delete</button>`:''}</li>`;
const pwToggle=f=>$('#show',f).onchange=e=>f.querySelectorAll('[data-pw]').forEach(i=>i.type=e.target.checked?'text':'password');
const PAGES={};
PAGES.register=()=>{const f=$('#f');pwToggle(f);
  f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f)),n=d.name.trim();
    const err=n.length<2?'Enter your full name.':!/^\S+@\S+\.\S+$/.test(d.email)?'Enter a valid email address.':d.mobile&&!/^\+?\d{7,15}$/.test(d.mobile)?'Mobile number must be 7 to 15 digits.':d.password.length<8?'Password must be at least 8 characters.':d.password!==d.confirm?'Passwords do not match.':'';
    if(err)return $('#err').textContent=err;
    try{await api('/register',{json:{name:n,email:d.email,mobile:d.mobile,password:d.password}});location.href='dashboard.html'}catch(x){$('#err').textContent=x.message}}};
PAGES.login=()=>{const f=$('#f');pwToggle(f);
  f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));
    if(!/^\S+@\S+\.\S+$/.test(d.email)||!d.password)return $('#err').textContent='Enter your email and password.';
    try{await api('/login',{json:d});location.href='dashboard.html'}catch(x){$('#err').textContent=x.message}}};
PAGES.dashboard=async u=>{$('#hi').textContent='Welcome, '+u.name;
  const a=await api('/history?limit=5');$('#recent').innerHTML=a.length?a.map(x=>act(x)).join(''):'<li class="empty">No activity yet. Try the assistant or symptom guidance.</li>'};
PAGES.assistant=()=>{const log=$('#log');
  const add=(who,t,note)=>{const d=document.createElement('div');d.className='msg '+who;const p=document.createElement('p');p.textContent=t;d.append(p);
    if(note){const s=document.createElement('small');s.textContent=note;d.append(s)}log.append(d);log.scrollTop=log.scrollHeight;return d};
  add('bot','Hello. I share general health information. I am not a doctor and cannot confirm a diagnosis. In an emergency, call your local emergency number.');
  $('#f').onsubmit=async e=>{e.preventDefault();const m=$('#msg').value.trim();if(!m)return;$('#msg').value='';add('me',m);const w=add('bot','Thinking…');$('#send').disabled=true;
    try{const r=await api('/chat',{json:{message:m}});w.remove();add('bot',r.reply,r.demo?'Demo response: no AI service is connected.':'AI-generated general information, not medical advice.')}
    catch(x){w.remove();add('bot','Sorry, something went wrong: '+x.message)}finally{$('#send').disabled=false}}};
const SYM=['Fever','Cough','Sore throat','Headache','Fatigue','Nausea','Vomiting','Diarrhoea','Abdominal pain','Skin rash','Chest pain','Difficulty breathing','Confusion','Severe bleeding','Fainting','Seizure','One-sided weakness'];
PAGES.symptoms=()=>{$('#list').innerHTML=SYM.map((s,i)=>`<label for="s${i}"><input type="checkbox" id="s${i}" value="${s}">${s}</label>`).join('');
  $('#f').onsubmit=async e=>{e.preventDefault();const s=[...document.querySelectorAll('#list input:checked')].map(i=>i.value);
    if(!s.length)return $('#err').textContent='Select at least one symptom.';$('#err').textContent='';
    try{const r=await api('/symptoms',{json:{symptoms:s,other:$('#other').value.trim(),duration:$('#dur').value,severity:$('#sev').value}});
      $('#out').innerHTML=`<div class="${r.emergency?'alert':'ok'}"><strong>${r.emergency?'Possible emergency':'Guidance'}</strong><p>${esc(r.advice)}</p></div><h3>Your summary</h3><p>${esc(r.summary)}</p><p class="mut">${esc(r.note)} Do not start prescription medicines without a doctor.</p>${r.emergency?'<a class="btn danger" href="emergency.html">Go to emergency help</a>':''}`}
    catch(x){$('#err').textContent=x.message}}};
PAGES.emergency=async u=>{$('#num').textContent=u.emergency_number;
  $('#call').onclick=()=>{if(confirm('Call '+u.emergency_number+' now?'))location.href='tel:'+u.emergency_number};
  if(u.contact_phone){$('#cc').innerHTML=`<p>${esc(u.contact_name||'Emergency contact')}: ${esc(u.contact_phone)}</p><button class="btn ghost" id="callc">Call contact</button>`;
    $('#callc').onclick=()=>{if(confirm('Call '+(u.contact_name||u.contact_phone)+'?'))location.href='tel:'+u.contact_phone}}
  else $('#cc').innerHTML='<p class="empty">No emergency contact saved. Add one on your <a href="profile.html">profile</a>.</p>';
  $('#loc').onclick=()=>{if(!navigator.geolocation)return toast('Location is not supported on this device.',false);
    if(!confirm('Allow JeevaRaksha to read your current location on this screen? It is not sent to our server.'))return;
    navigator.geolocation.getCurrentPosition(p=>{const url=`https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`;
      $('#locout').innerHTML=`<p>Your location: <a href="${url}" target="_blank" rel="noopener">${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}</a></p>`+
        (u.contact_phone?`<a class="btn" href="sms:${encodeURIComponent(u.contact_phone)}?body=${encodeURIComponent('I need help. My location: '+url)}">Open message to contact (you press send)</a>`:'')},
      e=>toast('Location permission denied or unavailable.',false))}};
PAGES.reports=()=>{const inp=$('#file'),prev=$('#prev'),bar=$('#bar');
  inp.onchange=()=>{prev.innerHTML='';const f=inp.files[0];if(!f)return;const ok=['application/pdf','image/png','image/jpeg'].includes(f.type);
    if(!ok||f.size>5242880){inp.value='';return toast(!ok?'Only PDF, PNG or JPG files are allowed.':'File is larger than 5 MB.',false)}
    if(f.type.startsWith('image/')){const i=new Image();i.alt='Preview of selected report';i.src=URL.createObjectURL(f);i.style.maxWidth='240px';prev.append(i)}else prev.textContent='Selected: '+f.name+' (PDF preview not available here)'};
  $('#f').onsubmit=e=>{e.preventDefault();const f=inp.files[0];if(!f)return toast('Choose a file first.',false);
    const x=new XMLHttpRequest(),fd=new FormData();fd.append('file',f);x.open('POST','/api/reports');bar.hidden=false;bar.value=0;
    x.upload.onprogress=v=>{if(v.lengthComputable)bar.value=v.loaded/v.total*100};
    x.onload=()=>{bar.hidden=true;if(x.status===200){toast('Report stored.');inp.value='';prev.innerHTML='';load()}else{let m='Upload failed.';try{m=JSON.parse(x.responseText).detail||m}catch{}toast(m,false)}};
    x.onerror=()=>{bar.hidden=true;toast('Network error. Try again.',false)};x.send(fd)};
  async function load(){const rs=await api('/reports');$('#rs').innerHTML=rs.length?rs.map(r=>`<li><div><strong>${esc(r.filename)}</strong><small>${(r.size/1024).toFixed(0)} KB · ${esc(r.created_at)} UTC</small></div><span><a class="btn ghost" href="/api/reports/${r.id}/file">Download</a> <button class="btn ghost" data-r="${r.id}">Delete</button></span></li>`).join(''):'<li class="empty">No reports uploaded yet.</li>'}
  $('#rs').onclick=async e=>{const id=e.target.dataset.r;if(id&&confirm('Delete this report permanently?')){await api('/reports/'+id,{method:'DELETE'});load()}};load()};
PAGES.profile=async u=>{const f=$('#f');for(const k of ['name','mobile','emergency_number','contact_name','contact_phone','email'])f.elements[k].value=u[k]||'';
  f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));delete d.email;
    try{await api('/me',{method:'PUT',json:d});toast('Profile saved.')}catch(x){$('#err').textContent=x.message}};
  const load=async()=>{const a=await api('/history?q='+encodeURIComponent($('#q').value));$('#hist').innerHTML=a.length?a.map(x=>act(x,1)).join(''):'<li class="empty">No matching activity.</li>'};
  $('#q').oninput=load;$('#hist').onclick=async e=>{const id=e.target.dataset.del;if(id){await api('/history/'+id,{method:'DELETE'});load()}};
  $('#clear').onclick=async()=>{if(confirm('Delete all your activity history?')){await api('/history',{method:'DELETE'});load()}};load()};
(async function boot(){
  const page=document.body.dataset.page,prot=document.body.dataset.protected==='1';let u=null;try{u=await api('/me')}catch{}
  if(prot&&!u)return location.href='login.html';if(u&&(page==='login'||page==='register'))return location.href='dashboard.html';
  const L=u?[['dashboard','Dashboard'],['assistant','Assistant'],['symptoms','Symptoms'],['emergency','Emergency'],['reports','Reports'],['profile','Profile']]:[['index','Home'],['login','Log in'],['register','Register']];
  $('#nav').innerHTML=L.map(([h,t])=>`<a href="${h}.html"${h===page?' aria-current="page"':''}>${t}</a>`).join('')+(u?'<button class="btn ghost" id="out">Log out</button>':'');
  $('#menu').onclick=()=>{const o=$('#nav').classList.toggle('open');$('#menu').setAttribute('aria-expanded',o)};
  if(u)$('#out').onclick=async()=>{await api('/logout',{method:'POST'});location.href='index.html'};
  if(PAGES[page])PAGES[page](u)})();
