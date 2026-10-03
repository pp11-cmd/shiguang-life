const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const KEY='jiajia-purchase-v1';
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));
const statusText={unrecorded:'未录入',pending:'待打印',printed:'已打印'};
let view='today',todayFilter='all',editAction=null,deleteAction=null,toastTimer=null,printPromptTimer=null,pendingPrintIds=[];

function freshState(){return {version:4,users:[],days:{},selectedDate:localDate(),productMemory:[]};}
function migrate(input){
  const source=input&&typeof input==='object'?input:{};
  if((source.version===3||source.version===4)&&Array.isArray(source.users)&&source.days&&typeof source.days==='object'){
    const out=freshState();
    out.users=source.users.filter(u=>u&&typeof u.name==='string').map(u=>({id:typeof u.id==='string'?u.id:uid(),name:u.name.trim(),needsCut:!!u.needsCut})).filter(u=>u.name);
    const ids=new Set(out.users.map(u=>u.id));
    for(const [date,day] of Object.entries(source.days)){
      if(!validDate(date)||!day)continue;
      const orders=(Array.isArray(day.orders)?day.orders:[]).filter(o=>ids.has(o.userId)).map(o=>({userId:o.userId,items:(Array.isArray(o.items)?o.items:[]).filter(i=>i&&typeof i.text==='string').map(i=>({id:typeof i.id==='string'?i.id:uid(),text:i.text})),status:['unrecorded','pending','printed'].includes(o.status)?o.status:'unrecorded',needsCut:typeof o.needsCut==='boolean'?o.needsCut:!!out.users.find(u=>u.id===o.userId)?.needsCut}));
      for(const o of orders)if(!o.items.length&&o.status==='pending')o.status='unrecorded';
      out.days[date]={orders,activeUserId:ids.has(day.activeUserId)?day.activeUserId:null};
    }
    out.selectedDate=validDate(source.selectedDate)?source.selectedDate:localDate();
    out.productMemory=Array.isArray(source.productMemory)?source.productMemory.filter(x=>x&&typeof x.name==='string'):[];
    return out;
  }
  const out=freshState(),byName=new Map();
  const legacyDays=source.days&&typeof source.days==='object'?source.days:{[validDate(source.selectedDate)?source.selectedDate:localDate()]:{families:Array.isArray(source.families)?source.families:[]}};
  for(const day of Object.values(legacyDays))for(const f of (Array.isArray(day?.families)?day.families:[])){
    const name=String(f?.name||'').trim();if(!name||byName.has(name))continue;
    const user={id:uid(),name,needsCut:!!f.needsCut};byName.set(name,user);out.users.push(user);
  }
  for(const [date,day] of Object.entries(legacyDays)){
    if(!validDate(date))continue;
    const orders=[];
    for(const f of (Array.isArray(day?.families)?day.families:[])){
      const user=byName.get(String(f.name).trim());if(!user)continue;
      const items=(Array.isArray(f.items)?f.items:[]).filter(i=>i&&typeof i.text==='string').map(i=>({id:typeof i.id==='string'?i.id:uid(),text:i.text}));
      orders.push({userId:user.id,items,status:items.length?'pending':'unrecorded',needsCut:!!f.needsCut});
    }
    const activeName=(Array.isArray(day?.families)?day.families:[]).find(f=>f.id===day.active)?.name;
    out.days[date]={orders,activeUserId:byName.get(activeName)?.id||null};
  }
  out.selectedDate=validDate(source.selectedDate)?source.selectedDate:localDate();
  out.productMemory=Array.isArray(source.productMemory)?source.productMemory.filter(x=>x&&typeof x.name==='string'):[];
  return out;
}

let state=freshState(),storageFailed=false;
try{const raw=localStorage.getItem(KEY);if(raw)state=migrate(JSON.parse(raw));}catch{storageFailed=true;}
if(!state.days[state.selectedDate])state.days[state.selectedDate]={orders:[],activeUserId:null};

function day(){return state.days[state.selectedDate]||(state.days[state.selectedDate]={orders:[],activeUserId:null});}
function user(id){return state.users.find(u=>u.id===id);}
function order(id,create=false){let o=day().orders.find(o=>o.userId===id);if(!o&&create){o={userId:id,items:[],status:'unrecorded',needsCut:false};day().orders.push(o);}return o;}
function activeUser(){return user(day().activeUserId)||state.users[0]||null;}
function activeOrder(create=true){const u=activeUser();return u?order(u.id,create):null;}
function derivedStatus(id){const o=order(id);if(o?.status==='printed')return'printed';return o?.items?.length?'pending':'unrecorded';}
function setOrderStatus(o,status){o.status=status==='printed'?'printed':(o.items.length?'pending':'unrecorded');}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
function save(){
  state.version=4;
  try{if(storageFailed)throw Error();localStorage.setItem(KEY,JSON.stringify(state));$('#saveStatus').textContent='已保存';}
  catch{$('#saveStatus').textContent='保存失败';toast('本地保存不可用，请先保持页面打开。');}
  renderDates();
}
function renderDates(){
  $('#orderDate').value=state.selectedDate;
  $('#savedDates').innerHTML='<option value="">历史日期</option>'+Object.keys(state.days).filter(d=>state.days[d].orders.some(o=>o.items.length)).sort().reverse().map(d=>`<option value="${d}">${d}</option>`).join('');
}
function changeDate(date){
  if(!validDate(date))return renderDates();
  state.selectedDate=date;if(!state.days[date])state.days[date]={orders:[],activeUserId:state.users[0]?.id||null};
  $('#itemInput').value='';renderAll();save();
}
function setView(next){
  view=next;
  for(const name of ['today','entry','users','print'])$('#'+name+'View').hidden=name!==next;
  $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
  if(next==='entry')renderEntry();
  if(next==='users')renderUsers();
  if(next==='print'){resetPrintSelection();renderPrint();}
  window.scrollTo({top:0,behavior:'smooth'});
}
function selectUser(id,openEntry=true){
  if(!user(id))return;day().activeUserId=id;save();renderAll();if(openEntry)setView('entry');
}
function statusChip(status){return `<span class="status-chip status-${status}">${statusText[status]}</span>`;}

function renderToday(){
  const counts={unrecorded:0,pending:0,printed:0};for(const u of state.users)counts[derivedStatus(u.id)]++;
  for(const key of Object.keys(counts))$('#'+key+'Count').textContent=counts[key];
  $('#todayLabel').textContent=state.selectedDate===localDate()?'今天':state.selectedDate;
  $$('#todayFilters [data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===todayFilter));
  const list=state.users.filter(u=>todayFilter==='all'||derivedStatus(u.id)===todayFilter);
  $('#todayList').innerHTML=list.length?list.map(u=>{
    const s=derivedStatus(u.id),o=order(u.id),count=o?.items.length||0;
    const actions=s==='printed'?`<button data-action="reprint" data-id="${u.id}">补打</button><button data-action="undo-print" data-id="${u.id}">撤销</button>`:`<button class="${s==='pending'?'':'primary'}" data-action="${s==='pending'?'go-print':'entry'}" data-id="${u.id}">${s==='pending'?'打印':'录入'}</button>`;
    return `<article class="person-card"><button class="person-main" data-action="entry" data-id="${u.id}"><span class="person-name">${esc(u.name)}</span><span class="person-meta">${statusChip(s)}${o?.needsCut?'<span class="cut-badge">需裁</span>':''}<span>${count} 条</span></span></button><div class="person-actions">${actions}</div></article>`;
  }).join(''):'<div class="empty-state">还没有清单，点“开始录入”直接填写姓名。</div>';
}

function renderEntry(){
  if(!activeUser()&&state.users.length)day().activeUserId=state.users[0].id;
  const u=activeUser(),o=activeOrder(false);
  $('#entryNameHistory').innerHTML=state.users.map(x=>`<option value="${esc(x.name)}"></option>`).join('');
  if(document.activeElement!==$('#entryNameInput'))$('#entryNameInput').value=u?.name||'';
  const index=u?state.users.findIndex(x=>x.id===u.id):-1;
  $('#previousUser').disabled=index<=0;$('#nextUser').disabled=index<0||index>=state.users.length-1;
  $('#entryName').textContent=u?.name||'输入客户姓名';$('#activeName').textContent=u?.name||'采购清单';
  $('#entryStatus').className='status-chip '+(u?'status-'+derivedStatus(u.id):'status-unrecorded');$('#entryStatus').textContent=u?statusText[derivedStatus(u.id)]:'未选择';
  $('#entryNeedsCut').checked=!!o?.needsCut;$('#entryNeedsCut').disabled=!u;
  const items=o?.items||[];$('#itemCount').textContent=items.length+' 条';
  $('#items').innerHTML=items.length?items.map((it,i)=>`<div class="order-item"><span class="order-number">${i+1}</span><span class="order-text">${esc(ListCore.display(it.text))}</span><span class="item-actions"><button data-action="edit-item" data-id="${it.id}">改</button><button class="danger" data-action="delete-item" data-id="${it.id}">删</button></span></div>`).join(''):'<div class="empty-state">还没有商品</div>';
  const disabled=!u;for(const id of ['voiceEntry','recognizeButton','quickAdd','finishNext'])$('#'+id).disabled=disabled;
  drawProducts();
}
function recognize(){
  const raw=$('#itemInput').value.trim();if(!raw)return toast('请先输入或说出采购内容。');
  const parsed=ListCore.parse(raw),o=activeOrder(true);if(!o||!parsed.length)return toast('没有识别到商品，请检查输入。');o.items.push(...parsed.map(x=>({id:uid(),text:x.text})));setOrderStatus(o,'pending');rememberProducts(parsed);$('#itemInput').value='';$('#itemInput').blur();save();renderAll();toast(`已加入 ${parsed.length} 条商品`);
}

const catalogs={常用:['黄瓜','尖椒','油菜','菠菜','香菜','胡萝卜','金针蘑','豆腐','土豆','西红柿','白菜','生菜','芹菜','韭菜','茄子','青椒','鸡蛋','大葱','蒜','西兰花'],叶菜:['白菜','菠菜','生菜','芹菜','韭菜','小白菜','茼蒿','油麦菜','娃娃菜','空心菜','小油菜','上海青','圆白菜'],瓜果根茎:['黄瓜','胡萝卜','土豆','西红柿','茄子','青椒','尖椒','冬瓜','南瓜','白萝卜','山药','莲藕','红薯','莴笋','西葫芦'],菌菇蛋豆:['金针蘑','香菇','平菇','木耳','豆腐','豆干','鸡蛋','豆芽','杏鲍菇','口蘑','蟹味菇','豆皮','腐竹'],调料:['姜','蒜','大葱','小葱','辣椒','花椒','八角','香叶','盐','白糖','酱油','醋']};
let category='常用';
function productChoices(){const recent=[...(state.productMemory||[])].sort((a,b)=>(b.lastUsed||0)-(a.lastUsed||0)).map(x=>x.name);return category==='常用'?[...new Set([...recent,...catalogs.常用])].slice(0,24):catalogs[category];}
function drawProducts(){
  $('#categoryButtons').innerHTML=Object.keys(catalogs).map(c=>`<button class="${c===category?'active':''}" data-category="${c}">${c}</button>`).join('');
  $('#productButtons').innerHTML=productChoices().map(n=>`<button data-product="${esc(n)}">${esc(n)}</button>`).join('');
}
function rememberProducts(items){
  state.productMemory=Array.isArray(state.productMemory)?state.productMemory:[];
  for(const item of items){const p=ListCore.parseOne(item.text);const name=p.name?.trim();if(!name||name.length>80)continue;let r=state.productMemory.find(x=>x.name===name);if(!r){r={name,count:0,lastUsed:0,unit:''};state.productMemory.push(r);}r.count=(r.count||0)+1;r.lastUsed=Date.now();if(p.unit)r.unit=p.unit;}
  state.productMemory=state.productMemory.sort((a,b)=>(b.lastUsed||0)-(a.lastUsed||0)).slice(0,300);
}

function renderUsers(){
  $('#userCount').textContent=state.users.length+' 人';
  $('#usersList').innerHTML=state.users.length?state.users.map(u=>`<article class="user-card customer-row"><b>${esc(u.name)}</b></article>`).join(''):'<div class="empty-state">录入清单后，客户姓名会自动保存在这里。</div>';
}

let selectedPrint=new Set(),printFilter='pending';
function printableUsers(){return state.users.filter(u=>(order(u.id)?.items.length||0)>0);}
function filteredPrintUsers(){return printableUsers().filter(u=>printFilter==='all'||(printFilter==='cut'&&order(u.id)?.needsCut)||(printFilter==='pending'&&derivedStatus(u.id)==='pending')||(printFilter==='printed'&&derivedStatus(u.id)==='printed'));}
function resetPrintSelection(){selectedPrint=new Set(filteredPrintUsers().map(u=>u.id));}
function renderPrintChoices(){
  const eligible=filteredPrintUsers();
  $$('#printFilters [data-print-filter]').forEach(b=>b.classList.toggle('active',b.dataset.printFilter===printFilter));
  selectedPrint=new Set([...selectedPrint].filter(id=>eligible.some(u=>u.id===id)));
  $('#printChoices').innerHTML=eligible.length?`<section class="print-group"><h3>选择清单和裁剪方式</h3><div class="print-choice-grid">${eligible.map(u=>{const o=order(u.id);return `<article class="print-choice"><label><input type="checkbox" data-print-user="${u.id}" ${selectedPrint.has(u.id)?'checked':''}><span>${esc(u.name)} · ${o.items.length} 条</span></label><label class="print-cut"><input type="checkbox" data-cut-user="${u.id}" ${o.needsCut?'checked':''}>需要裁剪</label></article>`;}).join('')}</div></section>`:'<div class="empty-state">没有可打印的清单</div>';
}
function printConfig(){
  const mode=$('#layoutMode').value,orientation=$('#orientation').value,density=$('#density').value,font=Number($('#fontSize').value),landscape=orientation==='landscape';
  const fixedGrid=landscape?(density==='comfortable'?[2,2]:density==='standard'?[3,2]:[3,3]):(density==='comfortable'?[1,2]:density==='standard'?[2,2]:[2,3]);
  const smartCols=landscape?(density==='comfortable'?2:density==='standard'?3:4):(density==='comfortable'?1:density==='standard'?2:3);
  const cols=mode==='custom'?Number($('#manualCols').value):(mode==='smart'?smartCols:fixedGrid[0]);
  const rows=mode==='custom'?Number($('#manualRows').value):fixedGrid[1];
  const gap=density==='compact'?2:3,pad=density==='comfortable'?3.2:density==='standard'?2.7:2.2,row=Math.max(5.5,font*.3528*1.38),blankRows=Number($('#blankRows').value);
  return {mode,orientation,density,font,width:landscape?297:210,height:landscape?210:297,cols,rows,gap,pad,row,blankRows,write:blankRows*row};
}
function chunkOrder(u,cfg,slotH){
  const o=order(u.id),header=cfg.font*.3528*1.7,available=slotH-cfg.pad*2-header-cfg.write-2,per=Math.max(1,Math.floor(available/cfg.row)),chunks=[];
  for(let i=0;i<o.items.length;i+=per)chunks.push(o.items.slice(i,i+per));return chunks;
}
function cardNode(card,cfg,width,height,smart=false){
  const node=document.createElement('section');node.className='print-card'+(smart?' smart':'');node.style.cssText=`width:${width}mm;${height?`height:${height}mm;`:''}padding:${cfg.pad}mm`;
  node.innerHTML=`<h3>${esc(card.u.name)}${card.total>1?` ${card.index+1}/${card.total}`:''}</h3>`+card.items.map(i=>`<div class="print-row" style="min-height:${cfg.row}mm"><span class="print-label">${esc(ListCore.display(i.text))}</span><span class="write-column"></span></div>`).join('')+`<div class="print-write-space" style="min-height:${cfg.write}mm"></div>`;return node;
}
function addSheet(page,cfg,pageIndex,total,innerW,innerH,slotW,slotH){
  const sheet=document.createElement('article');sheet.className='print-sheet';sheet.style.cssText=`width:${cfg.width}mm;height:${cfg.height}mm;padding:7mm 7mm 12mm;font-size:${cfg.font}pt`;
  const grid=document.createElement('div');grid.className='sheet-grid'+(cfg.mode==='smart'?' smart-grid':'');
  if(cfg.mode==='smart'){
    grid.style.cssText=`width:${innerW}mm;height:${innerH}mm;grid-template-columns:repeat(${cfg.cols},${slotW}mm);gap:${cfg.gap}mm`;
    for(const column of page.columns){const columnNode=document.createElement('div');columnNode.className='smart-column';columnNode.style.setProperty('--smart-gap',cfg.gap+'mm');for(const card of column)columnNode.append(cardNode(card,cfg,slotW,card.height,true));grid.append(columnNode);}
  }else{
    grid.style.cssText=`width:${innerW}mm;height:${innerH}mm;grid-template-columns:repeat(${cfg.cols},${slotW}mm);grid-template-rows:repeat(${cfg.rows},${slotH}mm);gap:${cfg.gap}mm`;
    for(const card of page.cards)grid.append(cardNode(card,cfg,slotW,slotH));
  }
  sheet.append(grid);const footer=document.createElement('div');footer.className='sheet-footer';footer.textContent=`${state.selectedDate} · ${page.group} · 第 ${pageIndex+1}/${total} 页`;sheet.append(footer);$('#papers').append(sheet);
}
function makePreview(){
  const cfg=printConfig();$('#fontValue').textContent=cfg.font;$('#pageStyle').textContent=`@page{size:A4 ${cfg.orientation};margin:0}`;if(cfg.mode==='custom')$('#manualLayout').open=true;
  const users=state.users.filter(u=>selectedPrint.has(u.id)&&(order(u.id)?.items.length||0));$('#papers').replaceChildren();
  if(!users.length){$('#papers').innerHTML='<div class="empty-state">请选择要打印的用户</div>';$('#layoutInfo').textContent='未选择清单';$('#printButton').disabled=true;return;}
  const innerW=cfg.width-14,innerH=cfg.height-19,slotW=(innerW-(cfg.cols-1)*cfg.gap)/cfg.cols,slotH=cfg.mode==='smart'?null:(innerH-(cfg.rows-1)*cfg.gap)/cfg.rows,groups=[{name:'需要裁剪',users:users.filter(u=>order(u.id)?.needsCut)},{name:'无需裁剪',users:users.filter(u=>!order(u.id)?.needsCut)}].filter(g=>g.users.length),pages=[];
  for(const group of groups){
    if(cfg.mode==='smart'){
      const maxItems=Math.max(1,Math.floor((innerH-cfg.pad*2-cfg.font*.3528*1.7-cfg.write-2)/cfg.row)),cards=[];
      for(const u of group.users){const items=order(u.id).items,total=Math.ceil(items.length/maxItems);for(let i=0;i<total;i++){const part=items.slice(i*maxItems,(i+1)*maxItems);cards.push({u,items:part,index:i,total,height:Math.min(innerH,cfg.pad*2+cfg.font*.3528*1.7+part.length*cfg.row+cfg.write+2)});}}
      let page={group:group.name,columns:Array.from({length:cfg.cols},()=>[]),used:Array(cfg.cols).fill(0)};pages.push(page);
      for(const card of cards){let column=-1,best=Infinity;for(let i=0;i<cfg.cols;i++){const needed=page.used[i]+(page.used[i]?cfg.gap:0)+card.height;if(needed<=innerH&&needed<best){column=i;best=needed;}}if(column<0){page={group:group.name,columns:Array.from({length:cfg.cols},()=>[]),used:Array(cfg.cols).fill(0)};pages.push(page);column=0;}page.columns[column].push(card);page.used[column]+= (page.used[column]?cfg.gap:0)+card.height;}
    }else{
      const cards=[];for(const u of group.users){const chunks=chunkOrder(u,cfg,slotH);chunks.forEach((items,index)=>cards.push({u,items,index,total:chunks.length}));}const slots=cfg.cols*cfg.rows;for(let i=0;i<cards.length;i+=slots)pages.push({group:group.name,cards:cards.slice(i,i+slots)});
    }
  }
  pages.forEach((page,index)=>addSheet(page,cfg,index,pages.length,innerW,innerH,slotW,slotH));
  const modeName={smart:'自动省纸',cut:'整齐裁剪',custom:'自己排版'}[cfg.mode];$('#layoutInfo').textContent=`${users.length} 家 · ${pages.length} 页 · ${modeName} · ${cfg.cols} 列 · ${cfg.font} 磅`;$('#printButton').disabled=false;scalePapers();
}
function renderPrint(){renderPrintChoices();makePreview();}
function scalePapers(){const w=$('#paperViewport').clientWidth-16;for(const p of $$('#papers .print-sheet')){const scale=Math.min(1,w/p.offsetWidth);p.style.transform=`scale(${scale})`;p.style.transformOrigin='top center';p.style.marginBottom=-(p.offsetHeight*(1-scale))+'px';}}

function renderAll(){renderDates();renderToday();renderEntry();renderUsers();if(view==='print')renderPrint();}
function edit(title,label,value,fn){$('#dialogTitle').textContent=title;$('#editLabel').textContent=label;$('#editInput').value=value;editAction=fn;$('#editDialog').showModal();setTimeout(()=>$('#editInput').focus(),50);}
function askDelete(title,text,fn){$('#deleteTitle').textContent=title;$('#deleteText').textContent=text;deleteAction=fn;$('#deleteDialog').showModal();}

$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('#startEntry').onclick=()=>setView('entry');
$('#statusStats').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){todayFilter=b.dataset.filter;renderToday();}};
$('#todayFilters').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){todayFilter=b.dataset.filter;renderToday();}};
$('#todayList').onclick=e=>{
  const b=e.target.closest('[data-action]');if(!b)return;const id=b.dataset.id,o=order(id,true);
  if(b.dataset.action==='entry')selectUser(id,true);
  if(b.dataset.action==='go-print'){printFilter='all';selectedPrint=new Set([id]);setView('print');selectedPrint=new Set([id]);renderPrint();}
  if(b.dataset.action==='undo-print'){setOrderStatus(o,'pending');save();renderAll();}
  if(b.dataset.action==='reprint'){printFilter='all';selectedPrint=new Set([id]);setView('print');selectedPrint=new Set([id]);renderPrint();}
};

function useTypedName(){const name=$('#entryNameInput').value.trim();if(!name)return toast('请输入客户姓名。');let u=state.users.find(x=>x.name===name);if(!u){u={id:uid(),name,needsCut:false};state.users.push(u);toast('已自动保存为常用客户');}selectUser(u.id,false);$('#entryNameInput').blur();}
$('#useEntryName').onclick=useTypedName;
$('#entryNameInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();useTypedName();}};
$('#previousUser').onclick=()=>{const i=state.users.findIndex(u=>u.id===activeUser()?.id);if(i>0)selectUser(state.users[i-1].id,false);};
$('#nextUser').onclick=()=>{const i=state.users.findIndex(u=>u.id===activeUser()?.id);if(i>=0&&i<state.users.length-1)selectUser(state.users[i+1].id,false);};
$('#voiceEntry').onclick=()=>{const input=$('#itemInput');input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);toast('请点手机键盘上的麦克风开始说话');};
$('#recognizeButton').onclick=recognize;
$('#clearInput').onclick=()=>{$('#itemInput').value='';$('#itemInput').focus();};
$('#entryNeedsCut').onchange=()=>{const o=activeOrder(true);if(!o)return;o.needsCut=$('#entryNeedsCut').checked;save();renderAll();};
$('#items').onclick=e=>{const b=e.target.closest('[data-action]');if(!b)return;const o=activeOrder(false);if(!o)return;const index=o.items.findIndex(i=>i.id===b.dataset.id),it=o.items[index];if(!it)return;if(b.dataset.action==='delete-item')askDelete('删除商品',`删除“${ListCore.display(it.text)}”？`,()=>{o.items.splice(index,1);setOrderStatus(o,'pending');save();renderAll();});if(b.dataset.action==='edit-item')edit('修改商品','商品和数量',it.text,value=>{const p=ListCore.parse(value);if(p.length!==1){toast('请只填写一条商品。');return false;}it.text=p[0].text;setOrderStatus(o,'pending');rememberProducts(p);});};
$('#finishNext').onclick=()=>{const u=activeUser(),o=activeOrder(true);if(!u||!o.items.length)return toast('请先加入商品。');setOrderStatus(o,'pending');const i=state.users.findIndex(x=>x.id===u.id);const next=state.users[i+1];save();renderAll();if(next){day().activeUserId=next.id;$('#itemInput').value='';save();renderAll();toast('已完成，进入下一家');}else{setView('today');toast('今天的最后一家已完成');}};

$('#categoryButtons').onclick=e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;drawProducts();}};
$('#productButtons').onclick=e=>{const b=e.target.closest('[data-product]');if(!b)return;$('#quickName').value=b.dataset.product;const r=state.productMemory.find(x=>x.name===b.dataset.product);if(r?.unit)$('#quickUnit').value=r.unit;};
$('#qtyButtons').innerHTML=['半','1','1.5','2','3','5'].map(n=>`<button data-qty="${n}">${n}</button>`).join('')+'<button id="plusHalf">+0.5</button>';
$('#qtyButtons').onclick=e=>{if(e.target.id==='plusHalf'){const raw=$('#quickQty').value.trim(),v=raw==='半'?0.5:Number(ListCore.number(raw||'0'));if(!Number.isFinite(v))return toast('数量不正确');$('#quickQty').value=String(Math.round((v+.5)*100)/100);}else{const b=e.target.closest('[data-qty]');if(b)$('#quickQty').value=b.dataset.qty;}};
$('#quickAdd').onclick=()=>{const name=$('#quickName').value.trim(),qty=$('#quickQty').value.trim(),unit=$('#quickUnit').value;if(!name||!qty)return toast('请选择商品并填写数量。');const p=ListCore.parseOne(name+qty+unit);const o=activeOrder(true);o.items.push({id:uid(),text:p.text});setOrderStatus(o,'pending');rememberProducts([p]);$('#quickName').value='';$('#quickQty').value='';save();renderAll();$('#quickName').blur();$('#quickQty').blur();};

$('#exportCustomers').onclick=()=>{if(!state.users.length)return toast('还没有客户姓名。');const csv='\ufeff姓名\r\n'+state.users.map(u=>`"${u.name.replaceAll('"','""')}"`).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='客户名单-'+localDate()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('客户名单已导出');};

if($('#printFilters'))$('#printFilters').onclick=e=>{const b=e.target.closest('[data-print-filter]');if(!b)return;printFilter=b.dataset.printFilter;resetPrintSelection();renderPrint();};
$('#printChoices').onchange=e=>{const c=e.target.closest('[data-print-user]'),cut=e.target.closest('[data-cut-user]');if(c)c.checked?selectedPrint.add(c.dataset.printUser):selectedPrint.delete(c.dataset.printUser);if(cut){const o=order(cut.dataset.cutUser,true);o.needsCut=cut.checked;save();renderToday();}makePreview();};
$('#selectAllPrint').onclick=()=>{selectedPrint=new Set(filteredPrintUsers().map(u=>u.id));renderPrint();};
$('#selectNonePrint').onclick=()=>{selectedPrint.clear();renderPrint();};
for(const id of ['layoutMode','orientation','density','fontSize','manualCols','manualRows','blankRows'])$('#'+id).addEventListener('input',makePreview);
$('#printButton').onclick=()=>{makePreview();if($('#printButton').disabled)return;pendingPrintIds=[...selectedPrint];clearTimeout(printPromptTimer);window.print();printPromptTimer=setTimeout(()=>{if(!$('#printDialog').open)$('#printDialog').showModal();},800);};
window.addEventListener('afterprint',()=>{clearTimeout(printPromptTimer);if(pendingPrintIds.length&&!$('#printDialog').open)$('#printDialog').showModal();});
$('#retryPrint').onclick=()=>{$('#printDialog').close();clearTimeout(printPromptTimer);window.print();printPromptTimer=setTimeout(()=>{if(!$('#printDialog').open)$('#printDialog').showModal();},800);};
$('#confirmPrinted').onclick=()=>{for(const id of pendingPrintIds){const o=order(id);if(o?.items.length)setOrderStatus(o,'printed');}pendingPrintIds=[];$('#printDialog').close();save();renderAll();toast('已标记为已打印');};
window.addEventListener('resize',()=>{if(view==='print')scalePapers();});

$('#editForm').onsubmit=e=>{e.preventDefault();const value=$('#editInput').value.trim();if(!value)return;if(editAction?.(value)===false)return;$('#editDialog').close();save();renderAll();};
$('#cancelEdit').onclick=()=>$('#editDialog').close();
$('#cancelDelete').onclick=()=>$('#deleteDialog').close();
$('#confirmDelete').onclick=()=>{$('#deleteDialog').close();deleteAction?.();};
$('#orderDate').onchange=e=>changeDate(e.target.value);$('#todayDate').onclick=()=>changeDate(localDate());$('#savedDates').onchange=e=>{if(e.target.value)changeDate(e.target.value);};

$('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='采购助手备份-'+localDate()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已下载');};
$('#importData').onclick=()=>$('#importFile').click();
$('#importFile').onchange=async()=>{const file=$('#importFile').files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error();const imported=migrate(JSON.parse(await file.text()));askDelete('导入备份',`导入 ${imported.users.length} 位用户及历史清单？同名用户会合并。`,()=>{const idMap=new Map();for(const iu of imported.users){let target=state.users.find(u=>u.name===iu.name);if(!target){target={...iu,id:uid()};state.users.push(target);}idMap.set(iu.id,target.id);}for(const [date,idDay] of Object.entries(imported.days)){if(!state.days[date])state.days[date]={orders:[],activeUserId:null};for(const io of idDay.orders){const userId=idMap.get(io.userId);if(!userId)continue;let target=state.days[date].orders.find(o=>o.userId===userId);if(!target){target={userId,items:[],status:'unrecorded',needsCut:!!io.needsCut};state.days[date].orders.push(target);}target.items.push(...io.items.map(i=>({id:uid(),text:i.text})));if(io.needsCut)target.needsCut=true;if(io.status==='printed')target.status='printed';else if(target.items.length)target.status='pending';}}storageFailed=false;save();renderAll();toast('备份已导入');});}catch{toast('无法读取这个备份文件。');}finally{$('#importFile').value='';}};

drawProducts();renderAll();save();setView('entry');
