(function(){
'use strict';
const params=new URLSearchParams(location.search); const projectId=params.get('id')||params.get('project');
let project=null;
const modules=[
 ['config','Configurações'],['graphics','Gráficos / Tiles'],['maps','Mapas'],['sprites','Sprites'],['audio','Áudio'],['code','Programação'],['build','Build ROM']
];
const menu=document.getElementById('moduleMenu'), content=document.getElementById('moduleContent');
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderMenu(){menu.innerHTML=modules.map((m,i)=>`<button class="module-btn" data-module="${m[0]}">${m[1]}</button>`).join('');menu.querySelectorAll('button').forEach(b=>b.onclick=()=>openModule(b.dataset.module));}
async function openModule(name){menu.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.module===name));let mod;
 try{mod=await import(`./modules/${name}.js`); content.innerHTML=mod.render(project); if(mod.mount)mod.mount(content,project,api);}catch(e){content.innerHTML=`<div class="panel"><h2>Módulo</h2><p class="muted">${esc(e.message)}</p></div>`;}}
const api={refresh:()=>openModule('config'), setProject:p=>{project=p;updateTitle();}, getProject:()=>project};
function updateTitle(){document.getElementById('projectName').textContent=project?.name||'Sem projeto';}
async function load(){if(!projectId){content.innerHTML='<div class="panel"><h2>Nenhum projeto</h2><p>Abra um projeto pelo Dashboard.</p></div>';return}try{const r=await fetch(`backend/projects/load.php?id=${encodeURIComponent(projectId)}`,{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Não foi possível carregar o projeto.');project=d.project;updateTitle();renderMenu();openModule('config');}catch(e){content.innerHTML=`<div class="panel"><h2>Erro</h2><p>${esc(e.message)}</p></div>`}}
async function save(){if(!project)return;const r=await fetch('backend/projects/save.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:projectId,project})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Falha ao salvar.');project=d.project||project;updateTitle();alert('Projeto salvo.');}
document.getElementById('btnSave').onclick=()=>save().catch(e=>alert(e.message));document.getElementById('btnBack').onclick=()=>location.href='dashboard.html';document.getElementById('btnLogout').onclick=()=>fetch('/backend/auth/logout.php',{credentials:'same-origin'}).finally(()=>location.href='/login.html');document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(x=>alert(x.message));}});
load();
})();
