'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/model.js'),A=require('../src/advice.js'),previous=require('../src/data/previous-standards.js'),{normalizeAgent}=require('../src/account.cjs');
const own=(s,ids)=>{for(const c of s.characters)c.owned=ids.includes(c.id);};
const fixture=(id,rank,weapon)=>normalizeAgent({id:Number(id),element_type:({'1191':202,'1141':202,'1131':202})[id]||201,name_mi18n:M.D.characters[id].name,level:60,rank,skills:[{skill_type:5,level:7}],properties:[{property_id:2,final:'3000'}],equip:[],weapon:weapon?{id:Number(weapon.id),level:60,star:weapon.refine}:null});
test('Pull costs count target gold separately from losing S rolls and consume pity only once',()=>{
 assert.deepEqual(A.cost('character',1),{newGold:1,maxS:2,pulls:180,polychromes:28800,withinBudget:true});assert.equal(A.cost('weapon',1).pulls,160);
 const s={...A.defaults,budget:150,characterPity:70,characterGuaranteed:true,weaponPity:50,weaponGuaranteed:true};assert.equal(A.cost('character',1,s).pulls,20);assert.equal(A.cost('character',2,s).pulls,200);assert.equal(A.cost('character',2,s).maxS,3);assert.equal(A.cost('weapon',2,s).pulls,190);assert.equal(A.cost('character',0,s).pulls,0);assert.equal(A.cost('character',2,s).withinBudget,false);
 assert.throws(()=>A.settings({characterPity:90}));assert.throws(()=>A.settings({weaponPity:80}));assert.throws(()=>A.settings({budget:-1}));assert.throws(()=>A.settings({characterGuaranteed:'yes'}));
});
test('Gold includes S mindscapes and refinements, splits permanent S, never counts A ranks as S gold',()=>{
 assert.deepEqual(A.gold(['1091'],{'1091':{rank:2,weapon:{id:'14109',refine:1}}}),{limited:4,total:4,unknown:[]});
 assert.deepEqual(A.gold(['1191','1141','1131'],{'1191':{rank:0,weapon:{id:'14119',refine:1}},'1141':{rank:1,weapon:{id:'14114',refine:2}},'1131':{rank:6,weapon:{id:'13113',refine:5}}}),{limited:2,total:6,unknown:[]});
 assert.deepEqual(A.gold(['1611'],{'1611':{rank:6,weapon:{id:'14161',refine:5}}}),{limited:12,total:12,unknown:[]});
 const unknown=A.gold(['1091']);assert.equal(unknown.limited,1);assert.deepEqual(unknown.unknown,['1091']);
});
test('All sixty individual guides have rotations, constraints, verified matching S/A alternatives and distinct valid trios',()=>{
 assert.deepEqual(Object.keys(A.G.profiles).sort(),Object.keys(M.D.characters).sort());
 for(const [id,p]of Object.entries(A.G.profiles)){assert.ok(p.rotation.length>=3,id);assert.ok(p.practical.length>15,id);assert.ok(p.teams.length>=2,id);assert.ok(p.source.endsWith('/'+id));const w=M.D.weapons[p.generic.weaponId];assert.ok(w.rarity>=3);assert.deepEqual(Object.keys(w.weapon_type),Object.keys(M.D.characters[id].weapon_type));assert.ok(!w.code_name.endsWith('_'+id));const preset=M.preset(id,'00');assert.equal(preset.weapon.id,p.generic.weaponId);for(const t of p.teams){assert.equal(new Set(t.ids).size,3);assert.ok(t.ids.includes(id));assert.ok(t.ids.every(id=>M.D.characters[id]));}}
 assert.match(A.profile('1291').practical,/结束/);assert.match(A.profile('1581').practical,/虚曜/);assert.match(A.profile('1611').practical,/锐暴/);assert.match(A.profile('1621').mechanism,/净化/);
});
test('Account teams use only owned members, have no duplicated members across requested teams, and do not read edited presets as ownership',()=>{
 const s=M.initialState();own(s,['1091','1221','1411','1191','1141','1131','1011','1031']);s.characters.find(c=>c.id==='1191').preset.rank=6;s.characters.find(c=>c.id==='1191').preset.weapon.refine=5;
 const before=JSON.stringify(s),r=A.analyze(s);assert.equal(r.selected.length,2);const ids=r.selected.flatMap(t=>t.ids);assert.equal(new Set(ids).size,6);assert.ok(ids.every(id=>r.owned.has(id)));assert.equal(JSON.stringify(s),before);assert.ok(r.selected.every(t=>t.gold.unknown.length));assert.ok(r.recommendations.every(p=>p.cost.newGold===1&&p.team.ids.filter(id=>!r.owned.has(id)).length<=1));
 own(s,[]);const empty=A.analyze(s);assert.equal(empty.selected.length,0);assert.equal(empty.recommendations.length,0);
});
test('Conditions recognize actual P0 roster, no owner self-activation, matching camp and other parry users',()=>{
 assert.equal(A.conditions(['1621','1541','1331'])[0].enabled,false);assert.equal(A.conditions(['1621','1611','1211'])[0].enabled,true);
 assert.equal(A.conditions(['1071','1191','1131'])[0].enabled,true);
 assert.equal(A.conditions(['1341','1141','1101'])[0].enabled,false);assert.equal(A.conditions(['1341','1141','1151'])[0].enabled,true);
 const graded=A.grade({ids:['1501','1331','1581'],curated:true},{});assert.ok(graded.checks.every(c=>c.enabled));assert.equal(A.grade({ids:['1461','1251','1311']},{}),null);
});
test('Actual S gold, owned engine reuse and vertical upgrades preserve account data and projected team costs',()=>{
 const s=M.initialState();M.applyAccountSnapshot(s,{agents:[fixture('1191',0,{id:'14001',refine:1}),fixture('1141',0,{id:'14119',refine:1}),fixture('1131',6,{id:'13113',refine:5})]});const before=JSON.stringify(s),r=A.analyze(s);assert.equal(r.selected.length,1);assert.ok(!r.recommendations.some(p=>p.kind==='weapon'&&p.id==='14119'),'already-equipped signature can be reallocated first');const up=r.recommendations.find(p=>p.kind==='mindscape'&&p.id==='1191');assert.equal(up.cost.newGold,1);assert.equal(up.team.gold.limited,r.selected[0].gold.limited+1);assert.equal(JSON.stringify(s),before);
});
test('v6 migration adds six tiers to thirty saved plans while preserving exact edits, active alias, account and team references',()=>{
 const old=M.initialState();old.version=6;delete old.advice;for(const c of old.characters){c.presetPlans=c.presetPlans.filter(p=>['standard-00','standard-01','standard-21'].includes(p.id));c.presetPlans.find(p=>p.id==='standard-00').build=structuredClone(previous[c.id]);}
 const c=old.characters.find(c=>c.id==='1191');for(let i=0;i<27;i++)c.presetPlans.push({id:'custom-'+i,name:'我的 '+i,build:structuredClone(c.preset)});c.presetPlans[0].build.overrides.atk=4321;c.activePresetId='custom-26';c.preset=c.presetPlans.at(-1).build;c.preset.overrides.atk=6789;old.comparison.targetPlanId=c.activePresetId;
 const original=structuredClone(old),next=M.validateState(old),n=next.characters.find(x=>x.id===c.id);assert.deepEqual(old,original);assert.equal(next.version,7);assert.equal(n.presetPlans.length,36);assert.equal(n.activePresetId,'custom-26');assert.equal(n.preset,n.presetPlans.find(p=>p.id==='custom-26').build);assert.equal(next.comparison.targetPlanId,'custom-26');assert.equal(n.presetPlans.find(p=>p.id==='standard-00').build.overrides.atk,4321);assert.equal(n.presetPlans.find(p=>p.id==='standard-00').build.weapon.id,'');for(const p of c.presetPlans)assert.deepEqual(n.presetPlans.find(x=>x.id===p.id).build,p.build);const untouched=next.characters.find(x=>x.id==='1151');assert.equal(untouched.presetPlans.find(p=>p.id==='standard-00').build.weapon.id,'13113');assert.deepEqual(M.validateState(JSON.parse(JSON.stringify(next))),next);
});
test('Budget and guarantees survive round-trip validation and cannot change account records',()=>{
 const s=M.initialState();s.advice={...A.defaults,budget:70,characterPity:50,characterGuaranteed:true,teamsWanted:3,focus:'anomaly'};const saved=M.validateState(JSON.parse(JSON.stringify(s)));assert.deepEqual(saved.advice,s.advice);assert.equal(A.cost('character',1,saved.advice).pulls,40);s.advice.weaponPity=80;assert.throws(()=>M.validateState(s));
});
