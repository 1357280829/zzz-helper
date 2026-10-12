/* Electron integration for aligned two-team result tables.
 * Run: electron tests/team-results-ui.cjs
 * Uses only a new local fixture profile; it never reads or logs account data.
 */
'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),syncFs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const artifacts=path.resolve(__dirname,'../artifacts'),profile=path.join(artifacts,'team-results-ui-'+Date.now());
syncFs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.disableHardwareAcceleration();
const M=require('../src/model.js'),E=require('../src/engine.js'),seed=M.initialState();
syncFs.writeFileSync(path.join(profile,'records.json'),JSON.stringify(seed));
const original=M.compare(seed),baseline=original.baseline,base=E.snapshot(baseline,E.zero());
const effect=(ownerId,owner,key,source,values,description)=>({ownerId,owner,key,source,values,description});
const commonA=effect('1151','露西','disc-team','驱动盘 · 月光骑士颂',{damage:18},'甲队由露西佩戴，四件效果。');
const commonB=effect('1031','妮可','disc-team','驱动盘 · 月光骑士颂',{damage:18},'乙队由妮可佩戴，描述和来源角色不同。');
const lucyA=effect('1151','露西','lucy.fixture','强化特殊技',{flatAttack:600,critDamage:10},'等级与触发条件 A；数值随等级计算。');
const lucyB=effect('1151','露西','lucy.fixture','强化特殊技',{flatAttack:300,critDamage:10},'等级与触发条件 B；数值与 A 不同。');
const health=effect('1341','照','zhao.fixture','核心被动',{生命值提升:5},'只用于展示的生命值增益。');
const team=(index,totals,rows)=>{const after=E.snapshot(baseline,totals),multiplier=after.value/base.value;
  return {index,valid:true,warnings:[],effects:{totals,rows,warnings:[],anomalyBonus:0,imbuement:0,alwaysStun:0},reference:{totals:E.zero(),rows:[]},after,base,multiplier,increase:(multiplier-1)*100};};
const a=team(0,{...E.zero(),damage:18,flatAttack:600,critDamage:10,defShred:40,attackPercent:10},[
  commonA,lucyA,effect('1031','妮可','nicole.fixture','核心被动',{defShred:40},'只有甲队提供减防。'),health,
  effect('1151','露西','weapon-team','音擎 · 好斗的阿炮',{attackPercent:10},'不同装备即使数值相同也保留独立来源。')]);
const b=team(1,{...E.zero(),damage:18,flatAttack:300,critDamage:10,penRate:30,attackPercent:10},[
  commonB,lucyB,effect('1211','丽娜','rina.fixture','核心被动',{penRate:30},'只有乙队提供穿透率。'),structuredClone(health),
  effect('1031','妮可','weapon-team','音擎 · 聚宝箱',{attackPercent:10},'与甲队音擎不同，不可强行配成相同部件。')]);
const fixture={target:original.target,baseline,rows:[a,b],relative:(b.multiplier/a.multiplier-1)*100};
require('../src/main.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try{
    const win=BrowserWindow.getAllWindows()[0],errors=[];
    win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    const run=source=>win.webContents.executeJavaScript(source);
    const wait=async(source)=>{for(let i=0;i<120;i++){if(await run(source))return;await delay(50);}throw Error('Timed out: '+source);};
    const check=async(source,expected,label)=>{assert.deepEqual(await run(source),expected,label);console.log('PASS',label);};
    const render=async(data)=>{await run(`(()=>{const host=document.getElementById('teams-page');window.__teamResultsFixture=${JSON.stringify(data)};host.innerHTML=window.TeamResults.render(window.__teamResultsFixture);host.hidden=false;document.getElementById('catalog-page').hidden=true;window.scrollTo(0,0);})()`);await delay(20);};
    const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const resultSnapshot=`(()=>({overall:[...document.querySelectorAll('#team-result-comparison .overall-value')].map(x=>x.textContent),effects:[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].map(row=>({source:row.dataset.source,metric:row.dataset.metric,match:row.dataset.match,values:[...row.children].map(cell=>cell.querySelector('.comparison-value')?.textContent)})).sort((a,b)=>(a.source+a.metric).localeCompare(b.source+b.metric))}))()`;
    await wait(`document.querySelectorAll('.agent-card').length===60`);
    await wait(`document.getElementById('save-status').textContent==='已自动保存'`);
    await check(`Boolean(window.TeamResults&&typeof window.TeamResults.render==='function')`,true,'team result module is loaded');
    await run(`document.querySelector('[data-page="teams"]').click()`);
    await check(`document.querySelectorAll('#team-result-comparison thead th').length`,2,'real summary has exactly two team columns');
    await check(`document.querySelectorAll('#team-effect-comparison thead th').length`,2,'real detail has exactly two team columns');
    await check(`[...document.querySelectorAll('#team-result-comparison tbody tr,#team-effect-comparison tbody tr')].every(row=>row.children.length===2&&[...row.children].every(x=>x.tagName==='TD'))`,true,'real result rows have exactly two corresponding cells');
    await check(`document.querySelectorAll('#teams-page .result-number').length`,0,'independent per-team result cards have been replaced');

    const zhaoScenario=M.initialState();
    zhaoScenario.comparison.target='1141';zhaoScenario.comparison.targetPlanId='standard-21';
    zhaoScenario.comparison.teams=[[{id:'1341',type:'preset',planId:'standard-21'},{id:'1101',type:'preset',planId:'standard-21'}],[{id:'1341',type:'preset',planId:'standard-21'},{id:'1151',type:'preset',planId:'standard-21'}]];
    const zhaoResult=M.compare(zhaoScenario);
    await render(zhaoResult);
    await check(`(()=>{const row=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].find(x=>x.dataset.source.includes('zhao.additional_cohesion_damage'));return row&&row.children[0].textContent.includes('无此增益')&&row.children[1].querySelector('.comparison-source').textContent==='额外能力：凝聚力'&&row.children[1].querySelector('.comparison-value').textContent==='+36%'&&row.children[1].querySelector('.effect-description').textContent.includes('初始最大生命值高于15000点')&&!row.children[1].querySelector('.effect-description').textContent.includes('霜寒值')})()`,true,'Zhao extra damage has correct text and respects each team composition');
    await check(`(()=>{const rows=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].filter(x=>x.dataset.source.includes('buff_7a09645b2f'));return rows.length===2&&rows.every(row=>row.dataset.metric!=='damage'&&row.textContent.includes('核心被动'))})()`,true,'Zhao core only contains HP and flat ATK');
    await check(`(()=>{const row=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].find(x=>x.dataset.source.includes('zhao.additional_cohesion_damage'));return row.getBoundingClientRect().height<=110&&parseFloat(getComputedStyle(row.querySelector('.comparison-status')).fontSize)>=14})()`,true,'compact result fits source and value in a readable row');

    await render(fixture);
    await check(`document.querySelectorAll('#team-result-comparison tbody [data-kind="metric"]').length`,7,'metric union includes display-only benefits');
    await check(`document.querySelectorAll('#team-effect-comparison tbody [data-kind="effect"]').length`,8,'multi-metric source is split and matching source rows align');
    await check(`[...document.querySelectorAll('#team-result-comparison tbody tr,#team-effect-comparison tbody tr')].every(row=>row.children.length===2)`,true,'controlled rows still contain two cells');
    await check(`(()=>{const rows=[...document.querySelectorAll('#team-result-comparison [data-kind="metric"]')].map(x=>x.dataset.match);return rows.includes('same')&&rows.includes('different')&&rows.indexOf('same')>rows.lastIndexOf('different')})()`,true,'different metrics precede matching metrics');
    await check(`(()=>{const rows=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].map(x=>x.dataset.match);return rows.includes('same')&&rows.includes('different')&&rows.indexOf('same')>rows.lastIndexOf('different')})()`,true,'different component effects precede matching effects');
    await check(`document.querySelector('#team-result-comparison [data-metric="flatAttack"]').dataset.match`,'different','different flat attacks share one comparison row');
    await check(`(()=>{const cells=document.querySelector('#team-result-comparison [data-metric="flatAttack"]').children;return cells[0].textContent.includes('600')&&cells[1].textContent.includes('300')})()`,true,'A and B numerical values remain in their correct columns');
    await check(`document.querySelector('#team-result-comparison [data-metric="critDamage"]').dataset.match`,'same','matching crit damage is marked as matching');
    await check(`(()=>{const rows=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].filter(x=>x.dataset.metric==='flatAttack'||x.dataset.metric==='critDamage');return rows.length===2&&rows[0].dataset.source===rows[1].dataset.source&&rows.every(x=>x.textContent.includes('露西'))})()`,true,'same skill identity aligns independently of values and description');
    await check(`(()=>{const row=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].find(x=>x.dataset.metric==='damage');return row.dataset.match==='same'&&row.children[0].textContent.includes('露西')&&row.children[1].textContent.includes('妮可')})()`,true,'shared set aligns across different wearers and keeps both owner names');
    await check(`(()=>{const rows=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')].filter(x=>x.dataset.metric==='attackPercent');return rows.length===2&&rows[0].dataset.source!==rows[1].dataset.source&&rows.every(x=>x.dataset.match==='different'&&x.textContent.includes('无此增益'))})()`,true,'different equipment is not paired merely because values match');
    await check(`(()=>{const row=document.querySelector('#team-result-comparison [data-metric="defShred"]');return row.children[0].textContent.includes('40')&&row.children[1].textContent.includes('无此增益')&&!row.children[1].textContent.includes('+0')})()`,true,'missing B metric explicitly says no benefit');
    await check(`(()=>{const row=document.querySelector('#team-result-comparison [data-metric="penRate"]');return row.children[0].textContent.includes('无此增益')&&row.children[1].textContent.includes('30')})()`,true,'missing A metric explicitly says no benefit');
    await check(`(()=>{const rows=[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"]')];return rows.find(x=>x.dataset.metric==='defShred').children[1].textContent.includes('无此增益')&&rows.find(x=>x.dataset.metric==='penRate').children[0].textContent.includes('无此增益')})()`,true,'one-sided source rows use explicit absence text');
    await check(`[...document.querySelectorAll('#team-result-comparison [data-match],#team-effect-comparison [data-match]')].every(x=>x.dataset.match==='same'?/相同|一致/.test(x.textContent):/差异|不同/.test(x.textContent))`,true,'matching state is communicated with text as well as color');
    await check(`(()=>{const same=document.querySelector('#team-result-comparison [data-match="same"] td'),different=document.querySelector('#team-result-comparison [data-match="different"] td');const s=getComputedStyle(same),d=getComputedStyle(different);return s.backgroundColor!==d.backgroundColor||s.color!==d.color||s.borderColor!==d.borderColor})()`,true,'same and different rows have distinct visual colors');
    await check(`[...document.querySelectorAll('.comparison-factors table')].every(table=>table.querySelectorAll('thead th').length===2&&[...table.querySelectorAll('tbody tr')].every(row=>row.children.length===2))&&document.querySelectorAll('.comparison-factors table').length>0`,true,'calculation factors also use two-column tables');
    await check(`[...document.querySelectorAll('#team-result-comparison .comparison-overall .overall-value')].length`,2,'overall gains use one corresponding row with two values');

    await run(`(async()=>{window.__comparisonBefore=${resultSnapshot};window.__inputBefore=JSON.stringify(window.__teamResultsFixture);window.__recordsBefore=await window.desktop.load().then(r=>JSON.stringify(r.state));document.querySelectorAll('.comparison-owner img').forEach(x=>x.loading='eager')})()`);
    await wait(`[...document.querySelectorAll('.comparison-owner img')].every(x=>x.complete&&x.naturalWidth>0)`);
    await check(`[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"] td')].filter(x=>x.querySelector('.comparison-value')&&!x.querySelector('.comparison-absent')).every(x=>x.querySelector('.comparison-owner img'))`,true,'each recognized detail source shows its role face and name');
    await check(`document.querySelector('#team-result-comparison [data-metric="flatAttack"] .comparison-contributor').textContent.includes('露西')`,true,'summary metrics identify contributing roles');
    await click('[data-team-result-toggle="summary:different"]');
    await check(`document.querySelector('#team-result-comparison tbody[data-benefit-group="different"]').hidden`,true,'summary differences can be folded');
    await check(`[...document.querySelectorAll('[data-team-result-toggle="summary:different"]')].every(x=>x.getAttribute('aria-expanded')==='false')`,true,'both corresponding fold controls expose the same state');
    await render(fixture);
    await check(`document.querySelector('#team-result-comparison tbody[data-benefit-group="different"]').hidden`,true,'summary fold state survives result rerender');
    await click('[data-team-result-toggle="summary:different"]');await click('[data-team-result-toggle="detail-gain:same"]');
    await check(`document.querySelector('#team-effect-comparison tbody[data-benefit-group="same"]').hidden`,true,'matching component effects can be folded separately');
    await click('[data-team-result-view="role"]');
    await check(`document.querySelector('.team-results').dataset.resultView`,'role','detail switches to role grouping');
    await check(`[...document.querySelectorAll('#team-effect-comparison tbody[data-role-group]')].map(x=>x.dataset.roleGroup).sort()`,['1031','1151','1211','1341','shared'],'role groups include one independent shared-equipment group');
    await check(`document.querySelectorAll('#team-effect-comparison [data-kind="effect"]').length`,8,'role grouping never duplicates or drops a benefit');
    await check(`(()=>{const table=document.getElementById('team-effect-comparison');return [...table.querySelectorAll('tbody[data-role-group]')].every(group=>{const key='detail-role:'+group.dataset.roleGroup;const matches=[...table.querySelectorAll('[data-kind="effect"]')].filter(row=>JSON.parse(row.closest('tbody').dataset.foldKeys).includes(key)).map(row=>row.dataset.match);return !matches.includes('same')||matches.indexOf('same')>matches.lastIndexOf('different')})})()`,true,'differences precede matches inside every role group');
    await check(`JSON.stringify(${resultSnapshot})===JSON.stringify(window.__comparisonBefore)`,true,'role grouping preserves all numerical results and matching states');
    await check(`JSON.stringify(window.__teamResultsFixture)===window.__inputBefore`,true,'view switches and folds do not mutate calculation input');
    await check(`(()=>{const row=document.querySelector('#team-effect-comparison [data-metric="damage"]');return JSON.parse(row.closest('tbody').dataset.foldKeys).includes('detail-role:shared')&&row.children[0].textContent.includes('露西')&&row.children[1].textContent.includes('妮可')})()`,true,'cross-role shared set remains paired with both complete owners');
    await check(`(()=>{const body=document.querySelector('#team-effect-comparison tbody[data-role-group="1151"]');return body.textContent.includes('露西')&&body.querySelectorAll('img').length===2})()`,true,'the same role is identified in both aligned group headings');
    await click('[data-team-result-toggle="detail-role:1151"]');
    await check(`(()=>{const bodies=[...document.querySelectorAll('#team-effect-comparison tbody[data-fold-keys]')].filter(x=>JSON.parse(x.dataset.foldKeys).includes('detail-role:1151'));return bodies.length>0&&bodies.every(x=>x.hidden)})()`,true,'folding a role hides its difference and matching sections together');
    await check(`(()=>{const bodies=[...document.querySelectorAll('#team-effect-comparison tbody[data-fold-keys]')].filter(x=>JSON.parse(x.dataset.foldKeys).includes('detail-role:1031'));return bodies.some(x=>!x.hidden)})()`,true,'folding one role leaves other roles visible');
    await click('[data-team-result-view="gain"]');await click('[data-team-result-view="role"]');
    await check(`document.querySelector('[data-team-result-toggle="detail-role:1151"]').getAttribute('aria-expanded')`,'false','role fold state survives both view switches');
    await click('[data-team-result-toggle="detail-role:1151"]');
    await run(`document.querySelector('.comparison-factors').open=true;document.querySelector('#team-effect-comparison [data-metric="flatAttack"] details').open=true`);await delay(30);
    await click('[data-team-result-view="gain"]');
    await check(`document.querySelector('.comparison-factors').open&&document.querySelector('#team-effect-comparison [data-metric="flatAttack"] details').open`,true,'factor and original-description folds survive view switches');
    await check(`document.querySelector('#team-effect-comparison tbody[data-benefit-group="same"]').hidden`,true,'gain view retains its separate matching-benefit fold');
    await click('[data-team-result-toggle="detail-gain:same"]');
    await check(`JSON.stringify(${resultSnapshot})===JSON.stringify(window.__comparisonBefore)`,true,'restoring gain view preserves the same corresponding result rows');
    await check(`window.desktop.load().then(r=>JSON.stringify(r.state)===window.__recordsBefore)`,true,'presentation state never changes saved roles or team configuration');

    const merged=structuredClone(fixture);merged.rows[0].effects.rows[0].owner='露西 / 苍角';merged.rows[1].effects.rows[0].owner='妮可 / 丽娜';
    await render(merged);await click('[data-team-result-view="role"]');
    await check(`(()=>{const row=document.querySelector('#team-effect-comparison [data-metric="damage"]');return row.children[0].querySelectorAll('.comparison-owner img').length===2&&row.children[1].querySelectorAll('.comparison-owner img').length===2&&row.children[0].textContent.includes('露西 / 苍角')&&row.children[1].textContent.includes('妮可 / 丽娜')})()`,true,'merged owner text is complete and maps to every known face');
    await check(`document.querySelectorAll('#team-effect-comparison [data-kind="effect"]').length`,8,'merged equipment owners do not duplicate shared benefit rows');
    await render(fixture);await click('[data-team-result-view="gain"]');

    const mastery=structuredClone(fixture);mastery.rows[0].effects.rows[3].values={anomalyMasteryFlat:10};mastery.rows[1].effects.rows[3].values={anomalyMasteryFlat:16};
    await render(mastery);
    await check(`(()=>{const row=document.querySelector('#team-result-comparison [data-metric="anomalyMasteryFlat"]');return row.children[0].textContent.includes('异常掌控提升')&&row.children[0].querySelector('.comparison-value').textContent==='+10点'&&row.children[1].querySelector('.comparison-value').textContent==='+16点'})()`,true,'flat anomaly mastery uses a Chinese label and point units');
    await check(`document.querySelector('#team-effect-comparison [data-metric="anomalyMasteryFlat"]').textContent.includes('异常掌控提升')`,true,'component anomaly mastery has the same readable label');

    const near=structuredClone(fixture);
    for(const [i,value]of [18.001,18.002].entries()){
      const row=near.rows[i];row.effects.totals.damage=value;row.effects.rows[0].values.damage=value;
      row.after=E.snapshot(baseline,row.effects.totals);row.multiplier=row.after.value/base.value;row.increase=(row.multiplier-1)*100;
    }
    near.relative=(near.rows[1].multiplier/near.rows[0].multiplier-1)*100;
    await render(near);
    await check(`(()=>{const row=document.querySelector('#team-result-comparison [data-metric="damage"]');const values=[...row.querySelectorAll('.comparison-value')].map(x=>x.textContent);return row.dataset.match==='different'&&values[0].includes('18.001')&&values[1].includes('18.002')})()`,true,'summary adds precision when two-decimal rounding would hide a difference');
    await check(`(()=>{const row=document.querySelector('#team-effect-comparison [data-metric="damage"]');const values=[...row.querySelectorAll('.comparison-value')].map(x=>x.textContent);return row.dataset.match==='different'&&values[0].includes('18.001')&&values[1].includes('18.002')})()`,true,'component values also expose small numerical differences');
    await check(`(()=>{const row=document.querySelector('.comparison-factors [data-factor="damage"]');const values=[...row.querySelectorAll('.comparison-factor-value')].map(x=>x.textContent);return row.dataset.match==='different'&&values[0]!==values[1]})()`,true,'factor values add precision when fixed rounding would hide the difference');
    await check(`parseFloat(getComputedStyle(document.querySelector('.comparison-status')).fontSize)>=14`,true,'comparison status text remains readable');

    const broken=structuredClone(fixture);broken.rows[1]={index:1,error:'乙队缺少完整角色面板'};broken.relative=null;
    await render(broken);
    await check(`document.querySelector('#team-result-comparison .comparison-overall').children[1].textContent.includes('乙队缺少完整角色面板')`,true,'one-team errors are shown in the corresponding column');
    await check(`(()=>{const cells=[...document.querySelectorAll('#team-result-comparison [data-kind="metric"] td:nth-child(2),#team-effect-comparison [data-kind="effect"] td:nth-child(2)')];return cells.length>0&&cells.every(x=>/未确认|无法计算|待核验/.test(x.textContent)&&!/[+]\s*0(?:\.0+)?\s*%/.test(x.textContent))})()`,true,'unreadable team cells are unknown rather than fabricated zero');
    await check(`[...document.querySelectorAll('#team-result-comparison [data-kind="metric"],#team-effect-comparison [data-kind="effect"]')].every(x=>x.dataset.match==='unknown')`,true,'an unreadable side never claims a numeric match or difference');
    await check(`(()=>{const x=document.querySelector('#team-result-comparison .comparison-overall').children[1].querySelector('.overall-value');return !/[+-]?\d+(?:\.\d+)?\s*%/.test(x?.textContent||'')})()`,true,'failed team has no candidate overall percentage');
    await click('[data-team-result-view="role"]');
    await check(`[...document.querySelectorAll('#team-effect-comparison tbody[data-role-group] td:nth-child(2)')].every(x=>x.textContent.includes('角色增益未确认')&&!x.textContent.includes('本队无此角色增益'))`,true,'role grouping does not claim absence when the failed team is unknown');
    await check(`[...document.querySelectorAll('#team-effect-comparison [data-kind="effect"] td:nth-child(2)')].every(x=>x.textContent.includes('未确认'))`,true,'role-view missing values also remain unknown');
    await click('[data-team-result-view="gain"]');

    const partial=structuredClone(fixture);partial.rows[1].valid=false;partial.rows[1].warnings=['影画条件尚未校验'];partial.rows[1].increase=123456789;partial.rows[1].multiplier=123456789;partial.rows[1].after.attack=123456789;partial.relative=null;
    await render(partial);
    await check(`!document.getElementById('teams-page').textContent.replace(/,/g,'').includes('123456789')`,true,'unverified candidate gain, multiplier and factors are hidden');
    await check(`document.querySelector('#team-result-comparison .comparison-overall').children[1].textContent.includes('影画条件尚未校验')`,true,'unverified conditions are explained beside the affected team');
    await check(`[...document.querySelectorAll('#team-result-comparison [data-kind="metric"] td:nth-child(2)')].every(x=>/待核验|未确认/.test(x.textContent))`,true,'recognized partial values remain visibly unverified');

    await render({error:'共同受益角色缺少完整现有面板'});
    await check(`document.getElementById('teams-page').textContent.includes('共同受益角色缺少完整现有面板')&&document.querySelectorAll('#teams-page .overall-value,#teams-page .comparison-factor-value').length===0`,true,'missing common target displays only the error and no invented results');

    await run(`document.querySelector('[data-page="teams"]').click()`);await wait(`document.getElementById('team-result-comparison')!=null`);
    await run(`document.querySelector('#team-result-comparison').scrollIntoView({block:'start'});document.querySelectorAll('.comparison-factors').forEach(x=>{if(x.tagName==='DETAILS')x.open=true})`);
    await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await delay(100);
    await fs.writeFile(path.join(artifacts,'v4-team-results.png'),(await win.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(artifacts,'v5-team-gains.png'),(await win.webContents.capturePage()).toPNG());
    await click('[data-team-result-view="role"]');
    await run(`document.querySelector('#team-effect-comparison').scrollIntoView({block:'start'});document.querySelectorAll('#team-effect-comparison img').forEach(x=>x.loading='eager')`);
    await wait(`[...document.querySelectorAll('#team-effect-comparison img')].every(x=>x.complete&&x.naturalWidth>0)`);
    await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await delay(100);
    await fs.writeFile(path.join(artifacts,'v5-team-roles.png'),(await win.webContents.capturePage()).toPNG());
    await run(`document.querySelectorAll('#team-effect-comparison tbody[data-role-group]').forEach(group=>{if(group.dataset.roleGroup!=='shared'){const button=group.querySelector('[data-team-result-toggle]');if(button.getAttribute('aria-expanded')==='true')button.click()}});document.getElementById('team-effect-comparison').scrollIntoView({block:'start'})`);
    await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await delay(100);
    await fs.writeFile(path.join(artifacts,'v5-team-shared.png'),(await win.webContents.capturePage()).toPNG());
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('ALL TEAM RESULT COMPARISON CHECKS PASSED');app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
