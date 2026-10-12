const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-10, `${actual} != ${expected}`);
const data = () => E.initialState();
test('图表示例：18% 增伤、10 爆伤、600 固定攻击、16% 战斗攻击', () => {
  const s=data(),t=E.aggregate(s.characters),r=E.calculate(s.baseline,t);
  assert.equal(t.damage,18);assert.equal(t.critDamage,10);assert.equal(t.flatAttack,600);assert.equal(t.attackPercent,16);
  assert.equal(r.after.attack,3500);close(r.ratios.attack,1.4);
  // Independent hand calculation: 3500/2500 × 148/130 × 180/175.
  close(r.multiplier,1.6393846153846154);close(r.increase,63.93846153846154);
});
test('同一增伤区相加，不能将通用与属性增伤分别相乘',()=>{
  const b=data().baseline;b.elementDamage=50;b.damage=20;
  const t={...E.zero(),damage:20,elementDamage:30};const r=E.calculate(b,t);
  close(r.multiplier,220/170);
});
test('战斗攻击百分比以入场面板为基准，固定攻击不被它再乘',()=>{
  const b=data().baseline;Object.assign(b,{initialAttack:2000,attackPercent:50,flatAttack:400});
  const r=E.calculate(b,{...E.zero(),attackPercent:20,flatAttack:600});
  assert.equal(r.before.attack,3400);assert.equal(r.after.attack,4400);close(r.multiplier,4400/3400);
});
test('暴击期望与暴击率封顶',()=>{
  const b=data().baseline;Object.assign(b,{critRate:90,critDamage:100});
  const r=E.calculate(b,{...E.zero(),critRate:30,critDamage:50});
  assert.equal(r.after.critRate,100);assert.equal(r.overflow,20);close(r.multiplier,2.5/1.9);
});
test('必定暴击、非暴击和常规异常分别忽略不适用的暴击项',()=>{
  const b=data().baseline,t={...E.zero(),critRate:50,critDamage:50};
  b.mode='critical';close(E.calculate(b,t).multiplier,3/2.5);
  b.mode='noncrit';close(E.calculate(b,t).multiplier,1);
  b.mode='anomaly';close(E.calculate(b,t).multiplier,1);
  t.proficiency=100;close(E.calculate(b,t).multiplier,4/3);
});
test('关闭部件不计入汇总，空队伍没有增益',()=>{
  const s=data();s.characters[0].parts[2].enabled=false;
  assert.equal(E.aggregate(s.characters).flatAttack,0);close(E.calculate(s.baseline,E.aggregate([])).multiplier,1);
});
test('多角色同区合计，互不改变原角色数据',()=>{
  const s=data(),second=E.makeCharacter('苍角');second.parts[0].values.flatAttack=1000;
  const t=E.aggregate([...s.characters,second]);assert.equal(t.flatAttack,1600);assert.equal(s.characters[0].parts[2].values.flatAttack,600);
});
test('减防、穿透率与穿透值按顺序作用，防御最低 0',()=>{
  const b=data().baseline;Object.assign(b,{defense:1000,levelFactor:500,defShred:10,penRate:20,penFlat:20});
  const t={...E.zero(),defShred:40,penRate:30,penFlat:30},r=E.calculate(b,t);
  assert.equal(r.before.effectiveDefense,700);assert.equal(r.after.effectiveDefense,200);close(r.multiplier,12/7);
  t.penFlat=2000;assert.equal(E.calculate(b,t).after.effectiveDefense,0);
});
test('减抗、易伤、失衡是不同乘区，未失衡时忽略失衡加成',()=>{
  const b=data().baseline;Object.assign(b,{resistance:20,vulnerability:10,stunMultiplier:150});
  const t={...E.zero(),resShred:30,vulnerability:20,stunBonus:35};
  close(E.calculate(b,t).multiplier,1.1/0.8*1.3/1.1);
  b.stunned=true;close(E.calculate(b,t).multiplier,1.1/0.8*1.3/1.1*185/150);
});
test('存档往返、损坏数值、重复 ID 和未知字段校验',()=>{
  const s=data();assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))),s);
  const nan=data();nan.characters[0].parts[0].values.damage=-5;assert.throws(()=>E.validateState(nan));
  const huge=data();huge.characters[0].parts[0].values.damage=Infinity;assert.throws(()=>E.validateState(huge));
  const duplicate=data();duplicate.characters.push(structuredClone(duplicate.characters[0]));assert.throws(()=>E.validateState(duplicate));
  const unknown=data();unknown.baseline.unwanted='x';assert.equal(E.validateState(unknown).baseline.unwanted,undefined);
  assert.throws(()=>E.validateState({version:99,characters:[]}));
});
test('基准伤害为 0 时不产生 Infinity 或伪造收益',()=>{
  const b=data().baseline;b.initialAttack=0;assert.equal(E.calculate(b,E.zero()).valid,false);
  b.initialAttack=2500;b.mode='anomaly';b.proficiency=0;assert.equal(E.calculate(b,E.zero()).valid,false);
});
function teamFixture(){
  const s=data(),target=E.makeCharacter('艾莲'),a=E.makeCharacter('苍角'),b=E.makeCharacter('妮可');
  target.parts[0].values.damage=999;a.parts[0].values.flatAttack=1000;b.parts[0].values.damage=20;
  s.characters.push(target,a,b);s.targetId=target.id;s.baseline.name=target.name;s.baseline.element='冰';
  s.profiles[target.id]={...s.baseline};
  s.teams=[{id:'A',name:'攻击队',members:[target.id,s.characters[0].id,a.id],disabledParts:{},configTypes:{}},
    {id:'B',name:'增伤队',members:[target.id,s.characters[0].id,b.id],disabledParts:{},configTypes:{}}];
  s.compareTeamIds=['A','B'];s.referenceTeamId='B';s.activeTeamId='A';s.scope='team';return s;
}
test('旧版存档迁移保留全部角色、数值与面板，不虚构三人队伍',()=>{
  const old=data();old.version=1;old.scope='team';old.baseline.initialAttack=3456;
  delete old.teams;delete old.profiles;delete old.targetId;
  const migrated=E.validateState(old);
  assert.equal(migrated.version,3);assert.deepEqual(migrated.characters,old.characters);
  assert.deepEqual(migrated.baseline,old.baseline);assert.deepEqual(migrated.teams,[]);assert.equal(migrated.scope,'single');
});
test('三人队伍必须包含三个不同且存在的角色，部件引用必须有效',()=>{
  for(const members of [['A','B'],['A','A','B'],['A','B','missing']]){
    const s=teamFixture();s.teams[0].members=members;assert.throws(()=>E.validateState(s));
  }
  const s=teamFixture();s.teams[0].disabledParts[s.teams[0].members[1]]=['missing'];assert.throws(()=>E.validateState(s));
});
test('队伍只计另外两名队友；队伍部件开关与全局开关分别生效',()=>{
  const s=teamFixture(),team=s.teams[0],support=s.characters[2],before=structuredClone(s);
  const r=E.teamContributions(s,team);assert.equal(r.characters.length,2);assert.equal(r.totals.damage,18);assert.equal(r.totals.flatAttack,1600);
  assert.deepEqual(s,before);
  team.disabledParts[support.id]=[support.parts[0].id];assert.equal(E.teamContributions(s,team).totals.flatAttack,600);
  assert.equal(support.parts[0].enabled,true);support.parts[0].enabled=false;team.disabledParts={};
  assert.equal(E.teamContributions(s,team).totals.flatAttack,600);
  assert.equal(E.teamContributions(s,team,null).valid,false);assert.equal(E.teamContributions(s,s.teams[1],support.id).valid,false);
});
test('对比共用同一面板；相对伤害按倍率相除，百分点按提升相减',()=>{
  const s=teamFixture(),rows=E.compareTeams(s),a=rows.find(r=>r.team.id==='A'),b=rows.find(r=>r.team.id==='B');
  const manualA=4500/2500*148/130*180/175,manualB=3500/2500*168/130*180/175;
  close(a.result.multiplier,manualA);close(b.result.multiplier,manualB);assert.equal(rows[0].team.id,'A');
  close(a.relativePercent,(manualA/manualB-1)*100);close(a.deltaPoints,(manualA-manualB)*100);
  close(b.relativePercent,0);assert.notEqual(a.relativePercent,a.deltaPoints);
  close(E.compareTeams(s,undefined,'A').find(r=>r.team.id==='B').relativePercent,(manualB/manualA-1)*100);
});
test('新版存档往返保留队伍、独立面板与折叠偏好',()=>{
  const s=teamFixture();s.sidebarCollapsed=true;s.profiles[s.characters[2].id]={...E.baseline(),initialAttack:1234};
  s.teams[0].disabledParts[s.characters[2].id]=[s.characters[2].parts[0].id];
  assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))),s);
});
test('完整角色库匹配旧露西记录，重复补全不重复新增，包含风与辉光',()=>{
  const s=data();const oldId=s.characters[0].id;E.ensureCatalog(s);assert.equal(s.characters.length,60);
  assert.equal(s.characters.find(c=>c.catalogId==='1151').id,oldId);assert.equal(E.aggregate([s.characters.find(c=>c.id===oldId)]).flatAttack,600);
  E.ensureCatalog(s);assert.equal(s.characters.length,60);assert.ok(s.characters.some(c=>c.element==='风'));assert.ok(s.characters.some(c=>c.element==='辉光'));
  assert.ok(!s.characters.some(c=>['1631','1641'].includes(c.catalogId)));
});
test('现有与预设分别保存面板和增益；队伍锁定配置类型',()=>{
  const s=teamFixture(),c=s.characters[2];s.profiles[c.id]={...E.baseline(),initialAttack:1234};
  E.changeConfiguration(s,c,'existing');assert.equal(c.parts[0].values.flatAttack,0);
  c.parts[0].values.flatAttack=222;s.profiles[c.id].initialAttack=5678;s.teams[0].configTypes[c.id]='preset';
  assert.equal(E.teamContributions(s,s.teams[0]).totals.flatAttack,1600);
  E.changeConfiguration(s,c,'preset');assert.equal(c.parts[0].values.flatAttack,1000);assert.equal(s.profiles[c.id].initialAttack,1234);
  s.teams[0].configTypes[c.id]='existing';assert.equal(E.teamContributions(s,s.teams[0]).totals.flatAttack,822);
  assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))),s);
});
test('账号同步更新持有状态和现有面板，预设与队友增益不被覆盖',()=>{
  const s=E.ensureCatalog(data()),c=s.characters.find(c=>c.catalogId==='1151');s.profiles[c.id]={...E.baseline(),initialAttack:1234};
  E.applyAccountSnapshot(s,{agents:[{id:'1151',name:'露西',element:'火',panel:{initialAttack:3456,critRate:24},info:null}]});
  assert.equal(c.owned,true);assert.equal(c.parts[2].values.flatAttack,600);assert.equal(s.profiles[c.id].initialAttack,1234);
  E.changeConfiguration(s,c,'existing');assert.equal(s.profiles[c.id].initialAttack,3456);assert.equal(c.parts[2].values.flatAttack,0);
  c.parts[2].values.flatAttack=500;
  E.applyAccountSnapshot(s,{agents:[{id:'1151',name:'露西',element:'火',panel:{initialAttack:4000},info:null}]});
  assert.equal(c.parts[2].values.flatAttack,500);assert.equal(s.profiles[c.id].initialAttack,4000);
  E.changeConfiguration(s,c,'preset');assert.equal(s.profiles[c.id].initialAttack,1234);assert.equal(c.parts[2].values.flatAttack,600);
  assert.throws(()=>E.applyAccountSnapshot(s,{agents:[]}));
});
