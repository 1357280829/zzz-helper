(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'),require('./catalog.js'));
  else root.TeamResults=factory(root.BuffEngine,root.AgentCatalog);
})(typeof globalThis!=='undefined'?globalThis:this,function(E,C){
  'use strict';
  const folds=new Map();
  const descriptions=new Map();
  let view='gain',lastComparison=null;
  const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(value,digits=2)=>Number(value).toLocaleString('zh-CN',{maximumFractionDigits:digits});
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const same=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<1e-8;
  const signed=(value,unit='',digits=2)=>(value>0?'+':'')+fmt(value,digits)+unit;
  const precision=(a,b)=>{for(let digits=2;digits<10;digits++)if(same(a,b)||!finite(a)||!finite(b)||fmt(a,digits)!==fmt(b,digits))return digits;return 10;};
  const sourceName=value=>String(value||'').replaceAll('潜能觉醒','潜能影像');
  const extras={生命值提升:'%',防御力提升:'',能量回复:'',属性异常独立增伤:'%',失衡外易伤倍率:'%',anomalyMasteryFlat:'点'};
  const extraLabels={anomalyMasteryFlat:'异常掌控提升'};
  const metric=key=>E.METRICS.find(m=>m.key===key)||{key,label:extraLabels[key]||key,unit:extras[key]||''};
  const verified=row=>Boolean(row&&!row.error&&row.valid);
  const statusText={different:'数值不同',same:'数值相同',unknown:'待核验'};
  const state=(rows,a,b)=>!rows.every(verified)?'unknown':same(a,b)?'same':'different';
  const ordered=list=>list.filter(x=>x.match!=='same').concat(list.filter(x=>x.match==='same'));
  const mark=match=>`<span class="comparison-status">${statusText[match]}</span>`;
  const heading=(label,match)=>`<div class="comparison-cell-heading"><span>${h(label)}</span>${mark(match)}</div>`;
  const isOpen=key=>folds.get(key)!==false;
  function ownerInfo(effect){
    const label=String(effect?.owner||'来源角色未标注'),ids=[];
    const add=id=>{if(C?.characters?.some(c=>String(c.id)===String(id))&&!ids.includes(String(id)))ids.push(String(id));};
    add(effect?.ownerId);
    for(const name of label.split(/\s*(?:\/|、|,)\s*/)){
      const c=C?.characters?.find(c=>c.name===name.trim());if(c)add(c.id);
    }
    return {label,ids,key:ids.length?ids.slice().sort().join('+'):label};
  }
  function avatars(info){
    return `<span class="comparison-avatars">${info.ids.length?info.ids.map(id=>`<img src="data/images/head-${h(id)}.webp" alt="${h(C.characters.find(c=>String(c.id)===id)?.name||info.label)}" loading="lazy">`).join(''):'<span class="comparison-avatar-placeholder" aria-hidden="true">◇</span>'}</span>`;
  }
  function ownerHTML(effect){const info=ownerInfo(effect);return `<div class="comparison-owner" data-owner="${h(info.key)}">${avatars(info)}<span>${h(info.label)}</span></div>`;}
  function contributors(row,item){
    const owners=new Map();
    for(const effect of row?.effects?.rows||[]){const value=effect.values?.[item.key];if(!finite(value)||Math.abs(value)<1e-8)continue;const info=ownerInfo(effect),old=owners.get(info.key);if(old)old.value+=value;else owners.set(info.key,{info,value});}
    return owners.size?`<div class="comparison-contributors" aria-label="角色贡献">${[...owners.values()].map(({info,value})=>`<span class="comparison-contributor">${avatars(info)}<span>${h(info.label)}</span><b>${h(signed(value,item.metric.unit,precision(...item.values)))}</b></span>`).join('')}</div>`:'';
  }
  function totals(row){
    if(row?.error||!row?.effects)return null;
    const result={};
    for(const m of E.METRICS){const v=row.effects.totals?.[m.key],ref=row.reference?.totals?.[m.key];if(finite(v))result[m.key]=v-(finite(ref)?ref:0);}
    for(const effect of row.effects.rows||[])for(const [key,value]of Object.entries(effect.values||{})){
      if(!E.METRICS.some(m=>m.key===key)&&finite(value))result[key]=(result[key]||0)+value;
    }
    return result;
  }
  function metricRows(rows){
    const values=rows.map(totals),keys=[...new Set([...E.METRICS.map(m=>m.key),...values.flatMap(x=>Object.keys(x||{}))])];
    return ordered(keys.filter(key=>values.some(v=>finite(v?.[key])&&Math.abs(v[key])>1e-8)).map(key=>{
      const pair=values.map((v,i)=>finite(v?.[key])?v[key]:verified(rows[i])?0:null);
      return {key,metric:metric(key),values:pair,match:state(rows,...pair)};
    }));
  }
  function identity(effect){
    // Equipment is comparable across wearers; a character's own skill retains its owner.
    return JSON.stringify(effect.key==='weapon-team'||effect.key==='disc-team'
      ?[effect.key,effect.source]:[effect.ownerId||effect.owner,effect.key||effect.source]);
  }
  function effectRows(rows){
    const pairs=new Map();
    for(let side=0;side<2;side++){
      const occurrence=new Map();
      for(const effect of rows[side]?.effects?.rows||[])for(const [key,value]of Object.entries(effect.values||{})){
        if(!finite(value)||Math.abs(value)<1e-8)continue;
        const source=identity(effect),base=JSON.stringify([source,key]),count=occurrence.get(base)||0;
        occurrence.set(base,count+1);const id=base+':'+count;
        if(!pairs.has(id))pairs.set(id,{source,key,metric:metric(key),effects:[null,null]});
        pairs.get(id).effects[side]={...effect,value};
      }
    }
    return ordered([...pairs.values()].map(pair=>({...pair,match:!rows.every(verified)?'unknown':
      pair.effects.every(Boolean)&&same(pair.effects[0].value,pair.effects[1].value)?'same':'different'})));
  }
  function overallCell(row){
    const valid=verified(row)&&finite(row.increase)&&finite(row.multiplier);
    const problem=row?.error||'存在未校验效果，暂无法完整计算。';
    return `<td><span class="comparison-overall-label">整体提升</span><div class="overall-value">${valid?signed(row.increase,'%'):'—'}</div><div class="result-meta">${valid?'相对同一目标未加入队友增益的面板 · '+fmt(row.multiplier,4)+' 倍':h(problem)}</div>${row?.warnings?.length?`<div class="warning">${h(row.warnings.join('\n'))}</div>`:''}</td>`;
  }
  function metricCell(item,row,side){
    const value=item.values[side],valid=verified(row),valueText=finite(value)&&Math.abs(value)>1e-8?signed(value,item.metric.unit,precision(...item.values)):valid?'无此增益':'未确认';
    return `<td><div class="comparison-cell">${heading(item.metric.label,item.match)}<strong class="comparison-value ${finite(value)&&Math.abs(value)>1e-8?'':'comparison-absent'}">${h(valueText)}</strong>${contributors(row,item)}${!valid&&finite(value)&&value!==0?'<small class="comparison-pending">已识别的部分数值 · 待核验</small>':''}</div></td>`;
  }
  function effectCell(item,row,side){
    const effect=item.effects[side];
    if(!effect)return `<td>${heading(item.metric.label,item.match)}<div class="comparison-source">${h(sourceName(item.effects[1-side]?.source))}</div><strong class="comparison-value comparison-absent">${verified(row)?'无此增益':'未确认'}</strong></td>`;
    const shared=effect.key==='disc-team'||/同(?:名|类|种).{0,14}不.{0,4}叠加/.test(effect.description||'');
    const detailKey=JSON.stringify([item.source,item.key,side]);
    return `<td><div class="comparison-cell">${heading(item.metric.label,item.match)}<div class="comparison-effect-info"><div class="comparison-source">${h(sourceName(effect.source))}</div>${ownerHTML(effect)}</div><strong class="comparison-value">${h(signed(effect.value,item.metric.unit,precision(...item.effects.map(e=>e?.value))))}</strong>${verified(row)?'':'<small class="comparison-pending">已识别的部分数值 · 待核验</small>'}${shared?'<small class="comparison-rule">同类效果取最高值，不叠加</small>':''}<details data-team-result-details="${h(detailKey)}" ${descriptions.get(detailKey)?'open':''}><summary>查看原始效果</summary><div class="effect-description">${h(effect.description)}</div></details></div></td>`;
  }
  function table(id,body,cls='',grouped=false){
    return `<div class="table-scroll"><table id="${id}" class="team-comparison-table ${cls}"><colgroup><col><col></colgroup><thead><tr><th scope="col"><span class="team-label">TEAM A</span><strong>队伍 A</strong></th><th scope="col"><span class="team-label">TEAM B</span><strong>队伍 B</strong></th></tr></thead>${grouped?body:'<tbody>'+body+'</tbody>'}</table></div>`;
  }
  function foldAttributes(keys){return `data-fold-keys="${h(JSON.stringify(keys))}" ${keys.every(isOpen)?'':'hidden'}`;}
  function groupHeader(key,label,count,parents=[],role=null){
    return `<tbody ${foldAttributes(parents)} ${role?`data-role-group="${h(role.key)}"`:''}><tr data-kind="group"><td>${foldButton(0)}</td><td>${foldButton(1)}</td></tr></tbody>`;
    function foldButton(side){
      return `<button type="button" class="comparison-fold-button" data-team-result-toggle="${h(key)}" aria-expanded="${isOpen(key)}" aria-label="队伍 ${side?'B':'A'} · ${h(label)} · 折叠分组"><span class="comparison-fold-title"><span class="comparison-fold-caret" aria-hidden="true">${isOpen(key)?'▾':'▸'}</span>${role&&role.ids.length?avatars(role):''}<span>${h(label)}</span></span><span class="comparison-fold-count">${count} 项</span></button>${role&&!role.present[side]?`<small class="comparison-role-absent">${role.verified[side]?'本队无此角色增益':'角色增益未确认'}</small>`:''}`;
    }
  }
  function itemRow(item,rows,kind){
    const attrs=kind==='metric'?`data-metric="${h(item.key)}"`:`data-source="${h(item.source)}" data-metric="${h(item.key)}"`;
    return `<tr data-kind="${kind}" ${attrs} data-match="${item.match}">${rows.map((row,side)=>kind==='metric'?metricCell(item,row,side):effectCell(item,row,side)).join('')}</tr>`;
  }
  function groupedItems(items,rows,prefix,kind,parents=[]){
    return ['different','same'].map(match=>{
      const group=items.filter(item=>match==='same'?item.match==='same':item.match!=='same');if(!group.length)return '';
      const key=prefix+':'+match,label=match==='same'?'相同增益':group.some(item=>item.match==='unknown')?'差异 / 待核验增益':'差异增益';
      return groupHeader(key,label,group.length,parents)+`<tbody data-benefit-group="${match}" ${foldAttributes([...parents,key])}>${group.map(item=>itemRow(item,rows,kind)).join('')}</tbody>`;
    }).join('');
  }
  function roleGroups(items){
    const groups=new Map();
    for(const item of items){
      const info=item.effects.map(effect=>effect?ownerInfo(effect):null),effect=item.effects.find(Boolean);
      const shared=item.effects.every(Boolean)&&(effect.key==='weapon-team'||effect.key==='disc-team')&&info[0].key!==info[1].key;
      const owner=info.find(Boolean),key=shared?'shared':owner.key;
      if(!groups.has(key))groups.set(key,{key,label:shared?'共有部件 · 跨角色对照':owner.label,ids:shared?[]:owner.ids,items:[],present:[false,false]});
      const group=groups.get(key);group.items.push(item);for(let side=0;side<2;side++)if(item.effects[side])group.present[side]=true;
    }
    // Roles with differences come first; each role's matching benefits are listed last.
    return [...groups.values()].filter(g=>g.key!=='shared'&&g.items.some(x=>x.match!=='same'))
      .concat([...groups.values()].filter(g=>g.key!=='shared'&&g.items.every(x=>x.match==='same')))
      .concat(groups.has('shared')?[groups.get('shared')]:[]);
  }
  function detailBody(items,rows){
    if(!items.length)return `<tbody>${emptyRow(rows,'effect')}</tbody>`;
    if(view==='gain')return groupedItems(items,rows,'detail-gain','effect');
    return roleGroups(items).map(group=>{
      group.verified=rows.map(verified);
      const key='detail-role:'+group.key;
      return groupHeader(key,group.label,group.items.length,[],group)+groupedItems(group.items,rows,key,'effect',[key]);
    }).join('');
  }
  function emptyRow(rows,kind){
    return `<tr data-kind="${kind}" data-match="${rows.every(verified)?'same':'unknown'}">${rows.map(r=>`<td class="comparison-empty">${verified(r)?'当前没有可计入的部件增益':'数据未确认，请先检查上方提示。'}</td>`).join('')}</tr>`;
  }
  function factors(rows){
    const names={attack:'攻击乘区',damage:'增伤乘区',crit:'暴击期望',mastery:'异常精通',defense:'防御乘区',resistance:'抗性乘区',vulnerability:'易伤乘区',stun:'失衡乘区'};
    const items=ordered(Object.entries(names).map(([key,label])=>({key,label,match:!rows.every(verified)?'unknown':same(rows[0].base?.[key],rows[1].base?.[key])&&same(rows[0].after?.[key],rows[1].after?.[key])?'same':'different'})));
    const body=items.map(item=>{
      const beforeDigits=Math.max(4,precision(...rows.map(r=>r.base?.[item.key]))),afterDigits=Math.max(4,precision(...rows.map(r=>r.after?.[item.key])));
      return `<tr data-kind="factor" data-factor="${item.key}" data-match="${item.match}">${rows.map(row=>`<td>${heading(item.label,item.match)}<strong class="comparison-factor-value">${verified(row)&&finite(row.base?.[item.key])&&finite(row.after?.[item.key])?fmt(row.base[item.key],beforeDigits)+' → '+fmt(row.after[item.key],afterDigits):'— · 未确认'}</strong></td>`).join('')}</tr>`;
    }).join('');
    return `<details class="comparison-factors" data-team-result-details="factors" ${descriptions.get('factors')?'open':''}><summary>乘区计算过程 · 两队对应</summary>${table('team-factor-comparison',body)}</details>`;
  }
  function render(comparison){
    lastComparison=comparison;
    if(comparison.error)return `<div class="warning">${h(comparison.error)}</div>`;
    const rows=[0,1].map(i=>comparison.rows?.find(r=>r.index===i)||comparison.rows?.[i]||{index:i,error:'尚无可计算的队伍数据。'});
    const metrics=metricRows(rows),effects=effectRows(rows);
    const summary=`<tbody><tr class="comparison-overall" data-kind="overall">${rows.map(overallCell).join('')}</tr></tbody>`+
      (metrics.length?groupedItems(metrics,rows,'summary','metric'):`<tbody>${emptyRow(rows,'metric')}</tbody>`);
    const controls=`<div class="comparison-view-switch" role="group" aria-label="明细分组方式">${[['gain','按增益'],['role','按角色']].map(([key,label])=>`<button type="button" data-team-result-view="${key}" aria-pressed="${view===key}">${label}</button>`).join('')}</div>`;
    return `<div class="team-results" data-result-view="${view}"><div class="comparison-legend"><span class="comparison-different-key">差异项优先 · A 蓝色 / B 橙色</span><span class="comparison-same-key">相同项靠后 · 点击组标题折叠</span></div><h3>整体提升与队友数值增益</h3>${table('team-result-comparison',summary,'',true)}<div class="comparison-detail-heading"><h3 class="comparison-detail-title">队友部件增益明细</h3>${controls}</div><p class="comparison-note">按角色查看各自贡献，或按增益逐行对照。共有部件保留两队来源角色；切换分组不会改变计算结果。</p>${table('team-effect-comparison',detailBody(effects,rows),'',true)}${factors(rows)}</div>`;
  }
  if(typeof document!=='undefined')document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-team-result-toggle],[data-team-result-view]'),container=button?.closest('.team-results');
    if(!button||!container)return;event.preventDefault();
    if(button.dataset.teamResultToggle){
      const key=button.dataset.teamResultToggle;folds.set(key,!isOpen(key));
      for(const control of container.querySelectorAll('[data-team-result-toggle]'))if(control.dataset.teamResultToggle===key){control.setAttribute('aria-expanded',String(isOpen(key)));control.querySelector('.comparison-fold-caret').textContent=isOpen(key)?'▾':'▸';}
      for(const body of container.querySelectorAll('[data-fold-keys]'))body.hidden=!JSON.parse(body.dataset.foldKeys).every(isOpen);
    }else if(lastComparison){
      view=button.dataset.teamResultView==='role'?'role':'gain';const scroll=window.scrollY;
      container.outerHTML=render(lastComparison);window.scrollTo(0,scroll);
      document.querySelector(`.team-results [data-team-result-view="${view}"]`)?.focus({preventScroll:true});
    }
  });
  if(typeof document!=='undefined')document.addEventListener('toggle',event=>{
    const node=event.target;if(node.matches?.('details[data-team-result-details]')&&node.closest('.team-results'))descriptions.set(node.dataset.teamResultDetails,node.open);
  },true);
  return {render,metricRows,effectRows,roleGroups};
});
