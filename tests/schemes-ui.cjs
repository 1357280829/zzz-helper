/* Real Electron integration, isolated from the user's account and saved records.
 * Run: electron tests/schemes-ui.cjs
 */
'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),syncFs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const artifacts=path.resolve(__dirname,'../artifacts');
const profile=path.join(artifacts,'schemes-ui-'+Date.now());
syncFs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
app.disableHardwareAcceleration();

const adapter=require('../src/account.cjs');
const rawAccount={id:1151,name_mi18n:'露西',element_type:201,avatar_profession:4,level:50,rank:1,
  properties:[{property_id:1,property_name:'生命值',final:'9000'},{property_id:2,property_name:'攻击力',final:'2500'},
    {property_id:3,property_name:'防御力',final:'700'},{property_id:5,property_name:'暴击率',final:'25%'},
    {property_id:6,property_name:'暴击伤害',final:'100%'},{property_id:8,property_name:'异常精通',final:'120'}],
  weapon:{id:13115,name:'好斗的阿炮',level:50,star:3,rarity:'A',main_properties:[{property_id:12103,property_name:'攻击力',base:'523'}],properties:[{property_id:30502,property_name:'能量自动回复',base:'40%'}]},
  equip:[{equipment_type:1,name:'月光骑士颂',level:15,rarity:'S',equip_suit:{suit_id:33400},main_properties:[{property_id:11103,property_name:'生命值',base:'2200'}],properties:[{property_id:12102,property_name:'攻击力',base:'9%',level:3}]}],
  skills:[{skill_type:5,level:5,items:[]},{skill_type:0,level:10,items:[]},{skill_type:1,level:10,items:[]}],ranks:[]};
const account=adapter.normalizeAgent(rawAccount);
const actual={level:account.info.level,rank:account.info.rank,info:structuredClone(account.info),panel:structuredClone(account.panel),raw:structuredClone(account.info.raw)};
const legacyBuild={level:40,rank:4,core:3,potential:0,skills:{basic:12,dodge:12,assist:12,special:12,chain:12},
  weapon:{id:'13115',level:40,refine:4},
  discs:['hpFlat','atkFlat','defFlat','critDmg','fireDmg','energyRegenPct'].map((main,i)=>({slot:i+1,setId:i<4?'33400':'31000',rarity:'S',level:15,main,subs:[]})),overrides:{atk:1900}};
const legacy={version:4,characters:[{id:'1151',catalogId:'1151',name:'露西',element:'火',owned:true,configType:'preset',existing:actual,preset:legacyBuild}],
  activeId:'1151',sidebarCollapsed:false,comparison:{target:'1191',targetType:'preset',teams:[[{id:'1151',type:'preset'},{id:'1131',type:'preset'}],[{id:'1031',type:'preset'},{id:'1281',type:'preset'}]],mode:'average',skill:'basic',move:'',stunned:false}};
// Confirm the seed is accepted by the bundled snapshot without consulting any real profile.
const GameData=require('../src/data/game-data.js');
assert.ok(GameData.sets['31000'],'fixture set is present');
syncFs.writeFileSync(path.join(profile,'records.json'),JSON.stringify(legacy));
const originalService=adapter.createAccountService;
adapter.createAccountService=(session,progress)=>originalService(session,progress,async(url,params)=>url.includes('getUserGameRoles')?
  {retcode:0,data:{list:[{game_uid:'12345678',region:'prod_gf_cn',nickname:'测试账号'}]}}:
  {retcode:0,data:{avatar_list:[rawAccount]}});
require('../src/main.cjs');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try{
    const win=BrowserWindow.getAllWindows()[0],errors=[];
    win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    const run=source=>win.webContents.executeJavaScript(source);
    const wait=async(source)=>{for(let i=0;i<120;i++){if(await run(source))return;await sleep(50);}throw Error('Timed out: '+source);};
    const saved=()=>run(`window.desktop.load().then(r=>r.state)`);
    const flush=()=>wait(`document.getElementById('save-status').textContent==='已自动保存'`);
    const check=async(source,expected,label)=>{assert.deepEqual(await run(source),expected,label);console.log('PASS',label);};
    const click=async(selector)=>{await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await flush();};
    const change=async(selector,value)=>{await run(`(()=>{const x=document.querySelector(${JSON.stringify(selector)});if(!x)throw Error('Missing field '+${JSON.stringify(selector)});x.value=${JSON.stringify(value)};x.dispatchEvent(new Event('change',{bubbles:true}));})()`);await flush();};
    const char=(state,id)=>state.characters.find(c=>c.id===id);
    const current=(state,id)=>{const c=char(state,id);return c.presetPlans.find(p=>p.id===c.activePresetId);};
    const shot=async(name)=>{await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await fs.writeFile(path.join(artifacts,name),(await win.webContents.capturePage()).toPNG());};
    await wait(`document.querySelectorAll('.agent-card').length===60`);await flush();
    let state=await saved(),lucy=char(state,'1151'),ellen=char(state,'1191');
    assert.equal(state.version,7);
    assert.deepEqual(lucy.presetPlans.find(p=>p.id==='legacy').build,legacyBuild);
    assert.deepEqual(lucy.existing,actual);
    assert.equal(state.comparison.teams[0][0].planId,'legacy');
    console.log('PASS legacy migration preserves original build, actual and old team reference');
    assert.equal(ellen.presetPlans.find(p=>p.id==='standard-21').build.rank,2);
    assert.equal(ellen.presetPlans.find(p=>p.id==='standard-21').build.potential,6);
    assert.equal(ellen.presetPlans.find(p=>p.id==='standard-21').build.weapon.id,'14119');
    assert.equal(ellen.presetPlans.find(p=>p.id==='standard-21').build.weapon.refine,1);
    for(const c of state.characters){const b=c.presetPlans.find(p=>p.id==='standard-21').build;
      assert.equal(b.rank,2);assert.equal(b.weapon.refine,1);assert.equal(b.discs.flatMap(d=>d.subs).reduce((sum,s)=>sum+s.rolls,0),54);
      assert.ok(GameData.weapons[b.weapon.id],'standard has a collected signature W-Engine');
      assert.deepEqual(Object.keys(GameData.weapons[b.weapon.id].weapon_type),Object.keys(GameData.characters[c.id].weapon_type),'standard W-Engine matches role specialty');
      assert.ok(b.discs.every(d=>GameData.sets[d.setId]),'all six slots have a collected set');
      const counts={};for(const d of b.discs)counts[d.setId]=(counts[d.setId]||0)+1;
      assert.deepEqual(Object.values(counts).sort((a,b)=>a-b),[2,4],'standard uses a four-piece and two-piece set');
      assert.ok(b.discs.every(d=>d.rarity==='S'&&d.level===15&&d.subs.length===4&&d.subs.reduce((sum,s)=>sum+s.rolls,0)===9&&new Set(d.subs.map(s=>s.stat)).size===d.subs.length&&d.subs.every(s=>s.rolls<=6&&s.rolls>=1&&s.stat!==d.main)));
    }
    await check(`window.desktop.load().then(({state})=>state.characters.every(c=>{const b=c.presetPlans.find(p=>p.id==='standard-21').build;const summary=window.AssistantModel.presetRollSummary(b,c.id);return summary.effective===40&&summary.total===54}))`,true,'all standard schemes have 40 effective and 54 total rolls');
    console.log('PASS standard schemes use two mindscapes, R1 signature and 40 legal S-disc rolls');

    await click('[data-detail="1151"]');
    await check(`document.querySelectorAll('[data-standard-preset]').length`,9,'nine standard tier cards are visible');
    await click('[data-standard-preset="standard-00"]');
    await check(`document.getElementById('detail-preset-plan').value`,'standard-00','00 tier can be selected directly');
    await check(`document.querySelector('[data-build="rank"]').value`,'0','00 uses zero mindscapes');
    await check(`window.desktop.load().then(({state})=>{const c=state.characters.find(x=>x.id==='1151');return c.preset.weapon.id!==window.StandardBuilds.builds['1151'].weaponId&&c.preset.weapon.refine===1&&window.AssistantModel.presetRollSummary(c.preset,c.id).effective===40;})`,true,'00 uses a generic R1 engine and forty effective rolls');
    await click('[data-standard-preset="standard-01"]');
    await check(`document.querySelector('[data-build="rank"]').value`,'0','01 uses zero mindscapes');
    await check(`window.desktop.load().then(({state})=>{const c=state.characters.find(x=>x.id==='1151');return c.preset.weapon.id===window.StandardBuilds.builds['1151'].weaponId&&c.preset.weapon.refine===1;})`,true,'01 uses the R1 signature');
    await click('[data-standard-preset="standard-21"]');
    await check(`document.getElementById('detail-preset-plan').value`,'standard-21','standard is initially active');
    await check(`document.querySelector('[data-build="potential"]').disabled`,true,'unsupported potential selector is disabled');
    await check(`document.querySelector('[data-build="potential"]').value`,'0','unavailable potential defaults to zero');
    await check(`document.querySelector('[data-build="potential"]').closest('label').textContent.includes('潜能影像')`,true,'potential selector uses the requested terminology');
    await check(`document.getElementById('preset-delete').disabled`,true,'standard scheme cannot be deleted');
    await change('#detail-preset-plan','legacy');
    await check(`document.querySelector('[data-build="rank"]').value`,'4','legacy cultivation remains editable and unchanged');
    await check(`document.querySelector('[data-override="atk"]').value`,'1900','legacy exact panel override is preserved');
    await click('#preset-copy');
    state=await saved();const copiedId=char(state,'1151').activePresetId;
    assert.notEqual(copiedId,'legacy');assert.notEqual(copiedId,'standard-21');
    assert.deepEqual(current(state,'1151').build,legacyBuild);
    console.log('PASS copy makes a distinct deep copy');
    await change('#preset-plan-name','攻击方案 B');await click('#preset-rename');
    state=await saved();assert.equal(current(state,'1151').name,'攻击方案 B');
    await change('[data-override="atk"]','5000');
    state=await saved();assert.equal(current(state,'1151').build.overrides.atk,5000);
    assert.equal(char(state,'1151').presetPlans.find(p=>p.id==='legacy').build.overrides.atk,1900);
    console.log('PASS rename survives change events and edits remain independent');
    await click('#preset-add');
    state=await saved();const addedId=char(state,'1151').activePresetId;
    assert.notEqual(addedId,copiedId);assert.equal(current(state,'1151').build.rank,2);
    assert.equal(current(state,'1151').build.potential,0);assert.deepEqual(current(state,'1151').build.overrides,{});
    console.log('PASS new scheme resets to standard defaults rather than cloning overrides');
    await change('#detail-preset-plan',copiedId);
    await change('#detail-config','existing');
    await check(`document.querySelectorAll('#detail-page input[type=number],#preset-add,#preset-copy,#preset-rename,#preset-delete').length`,0,'existing configuration remains read-only');
    await change('#detail-preset-plan','legacy');
    state=await saved();assert.deepEqual(char(state,'1151').existing,actual);
    await run(`(()=>{const x=document.createElement('input');x.dataset.override='atk';x.value='999999';document.getElementById('detail-page').append(x);x.dispatchEvent(new Event('change',{bubbles:true}));x.remove();})()`);await flush();
    state=await saved();assert.deepEqual(char(state,'1151').existing,actual);assert.equal(char(state,'1151').presetPlans.find(p=>p.id==='legacy').build.overrides.atk,1900);
    console.log('PASS changing comparison scheme and synthetic edit cannot mutate actual');
    await click('#copy-existing-preset');
    state=await saved();assert.deepEqual(char(state,'1151').existing,actual);
    assert.equal(char(state,'1151').presetPlans.find(p=>p.id===copiedId).build.overrides.atk,5000);
    assert.ok(char(state,'1151').presetPlans.length>=5);
    assert.equal(current(state,'1151').build.rank,1);
    console.log('PASS actual copy adds a scheme and preserves all other schemes');

    await click('[data-page="catalog"]');await click('[data-detail="1191"]');
    await check(`document.querySelector('[data-build="potential"]').value`,'6','released potential role defaults to P6');
    await check(`document.querySelector('[data-build="potential"]').disabled`,false,'released potential is editable');
    await click('[data-page="teams"]');
    await change('#comparison-target-type','preset');await change('#comparison-target-plan','standard-21');
    await change('[data-team="0"][data-member="0"][data-team-field="planId"]','legacy');
    await change('[data-team="1"][data-member="0"][data-team-field="id"]','1151');
    await change('[data-team="1"][data-member="0"][data-team-field="planId"]',copiedId);
    state=await saved();assert.equal(state.comparison.targetPlanId,'standard-21');
    assert.equal(state.comparison.teams[0][0].planId,'legacy');assert.equal(state.comparison.teams[1][0].planId,copiedId);
    const gains=await run(`window.desktop.load().then(({state})=>window.AssistantModel.compare(state).rows.map(r=>r.effects.rows.filter(x=>x.ownerId==='1151').reduce((sum,row)=>sum+(row.values.flatAttack||0),0)))`);
    assert.ok(gains[1]>gains[0],JSON.stringify(gains));
    console.log('PASS two teams use explicit independent schemes for the same support');
    await run(`document.querySelector('[data-team="1"][data-member="0"][data-team-field="planId"]').nextElementSibling.querySelector('button').click()`);
    await check(`document.querySelector('.ss-search')!=null`,true,'scheme selectors support search');
    await check(`(()=>{const rows=[...document.querySelectorAll('.ss-option')].map(row=>[...row.querySelectorAll('.ss-option-label,.ss-meta-part,.ss-option-status')].map(x=>Math.round(x.getBoundingClientRect().left)));return rows.length>1&&rows.every(row=>JSON.stringify(row)===JSON.stringify(rows[0]))})()`,true,'scheme names, cultivation and state align in fixed columns');
    await run(`(()=>{const x=document.querySelector('.ss-search');x.value='攻击方案 B';x.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await check(`document.querySelectorAll('.ss-option').length`,1,'scheme names are searchable');
    await run(`window.SearchableSelects.close()`);await shot('v3-schemes-teams.png');
    await click('[data-page="catalog"]');await click('[data-detail="1151"]');await change('#detail-preset-plan',addedId);
    state=await saved();assert.equal(state.comparison.teams[1][0].planId,copiedId);
    const stable=await run(`window.desktop.load().then(({state})=>window.AssistantModel.compare(state).rows.map(r=>r.effects.rows.filter(x=>x.ownerId==='1151').reduce((sum,row)=>sum+(row.values.flatAttack||0),0)))`);
    assert.deepEqual(stable,gains);
    console.log('PASS changing active editor scheme does not alter pinned team results');
    const checkpoint=await saved();
    assert.equal(checkpoint.version,7);
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});
    await wait(`document.querySelectorAll('.agent-card').length===60`);await flush();
    state=await saved();assert.deepEqual(state.comparison,checkpoint.comparison);assert.deepEqual(char(state,'1151').presetPlans,char(checkpoint,'1151').presetPlans);
    console.log('PASS reload and autosave preserve all named schemes and pins');
    await click('[data-detail="1151"]');await change('#detail-preset-plan',copiedId);await click('#preset-delete');
    state=await saved();assert.ok(!char(state,'1151').presetPlans.some(p=>p.id===copiedId));
    assert.ok(char(state,'1151').presetPlans.some(p=>p.id===state.comparison.teams[1][0].planId));
    assert.ok(char(state,'1151').presetPlans.some(p=>p.id==='standard-21'));
    assert.deepEqual(char(state,'1151').existing,actual);
    console.log('PASS deletion repairs referenced teams and protects standard and actual');
    const comparisonAfterDeletion=structuredClone(state.comparison);
    await check(`document.querySelectorAll('#import,#export,#import-file').length`,0,'manual import and backup entries removed');
    const beforeSync=structuredClone(state.characters.map(c=>({id:c.id,plans:c.presetPlans,active:c.activePresetId})));
    await click('[data-page="sync"]');await click('#account-load-roles');await wait(`document.getElementById('account-status').textContent.includes('已读到绑定账号')`);
    await click('#account-sync');await wait(`document.getElementById('account-status').textContent.includes('同步完成')`);await flush();
    state=await saved();assert.deepEqual(state.characters.map(c=>({id:c.id,plans:c.presetPlans,active:c.activePresetId})),beforeSync);
    assert.deepEqual(char(state,'1151').existing.raw,actual.raw);assert.deepEqual(state.comparison,comparisonAfterDeletion);
    console.log('PASS account synchronization leaves all schemes and team pins intact');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('ALL PRESET SCHEME UI CHECKS PASSED');
    app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
