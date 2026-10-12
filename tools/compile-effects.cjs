// Extract numeric facts only. Descriptions shown by the app come from the release snapshot.
const fs=require('fs'),D=require('../src/data/game-data.js');
const norm=s=>String(s).replace(/[·\s「」&ⅠⅡⅢ]/g,'').trim();
const aliases={'月城柳':'柳','浮波柚叶':'柚叶','冯·莱卡恩':'莱卡恩','凯撒·金':'凯撒','柏妮思·怀特':'柏妮思','卢西娅·艾洛温':'卢西娅','诺姆·霍洛维尔':'诺姆','蕾米埃尔·丹':'蕾米埃尔','维琳娜·艾嘉德':'维琳娜','薇薇安·班希':'薇薇安','希格莉德·德拉叙尔':'希格莉德','克拉蕾·弗林特':'克拉蕾','星见雅':'雅','简·杜':'简','德玛拉电池II型':'德玛拉电池Ⅱ型','棘刺玫瑰':'荆棘玫瑰'};
const byName=(list,name)=>Object.values(list).find(x=>norm(x.name)===norm(aliases[name]||name));
const cleanEffect=e=>Object.fromEntries(Object.entries(e).filter(([k])=>!['coverage','condition','sourceLabel'].includes(k)).map(([k,v])=>[k,k==='source'?{label:v.label?.zhCN}:v]));
const facts={characters:{},self:{},weapons:{},sets:{},source:'https://github.com/ZztIsolation/zzz_calculator/tree/main/data'};
const buffs=JSON.parse(fs.readFileSync('artifacts/calc-combat_buffs.json'));
for(const c of buffs.teammates){const a=byName(D.characters,c.name.zhCN);if(!a){console.log('Missing agent',c.name.zhCN);continue;}
 facts.characters[a.id]=c.buffs.map(b=>({key:b.id,source:b.source.zhCN,effects:b.effects.map(e=>({...cleanEffect(e),sourceLabel:e.sourceLabel?.zhCN||e.source?.label?.zhCN||''})),modifiers:b.buffModifiers||[]}));}
for(const w of JSON.parse(fs.readFileSync('artifacts/calc-w_engines.json')).wEngines){const a=byName(D.weapons,w.name.zhCN);if(!a){console.log('Missing engine',w.name.zhCN);continue;}facts.weapons[a.id]={self:(w.effect?.selfBuff?.effects||[]).map(cleanEffect),team:(w.effect?.teamBuff?.effects||[]).map(cleanEffect)};}
for(const s of JSON.parse(fs.readFileSync('artifacts/calc-drive_disc_sets.json')).sets){const a=byName(D.sets,s.name.zhCN);if(!a){console.log('Missing set',s.name.zhCN);continue;}facts.sets[a.id]={two:(s.twoPiece?.effects||[]).map(cleanEffect),self:(s.fourPiece?.selfBuff?.effects||[]).map(cleanEffect),team:(s.fourPiece?.teamBuff?.effects||[]).map(cleanEffect)};}
const skills=JSON.parse(fs.readFileSync('artifacts/calc-agent_skills.json')).agentSkills;
require('./primary-generic-effects.cjs')(D,facts);
require('./primary-zhao-effects.cjs')(D,facts);
for(const c of JSON.parse(fs.readFileSync('artifacts/calc-agents.json')).agents){const a=byName(D.characters,c.name.zhCN);if(!a)continue;
 const rules=[];for(const [key,value]of Object.entries(c.combatBuffs||{}))for(const b of (Array.isArray(value)?value:[value]).filter(Boolean))rules.push({key:c.id+'-'+key+'-'+(b.cinemaLevel||''),source:b.cinemaLevel?'影画'+b.cinemaLevel:key==='additionalAbility'?'额外能力':key==='corePassive'?'核心被动':'自身状态',effects:(b.effects||[]).map(cleanEffect),modifiers:b.buffModifiers||[]});
 facts.self[a.id]={rules,coreScaling:c.coreSkill?.corePassiveScaling?.levels||[],potentialScaling:c.potentialVision?.scaling?.levels||[],moves:(skills.find(x=>x.agentId===c.id)?.categories||[]).flatMap(cat=>cat.moves.map(m=>({id:m.id,name:m.name.zhCN,skill:m.skillType||cat.id,element:m.damageElement}))),agentKey:c.id};
}
fs.writeFileSync('src/data/effects.js','/* Numeric effect facts; attribution in docs/DATA-SOURCES.md. */\n(function(r,d){if(typeof module==="object"&&module.exports)module.exports=d;else r.EffectData=d;})(globalThis,'+JSON.stringify(facts)+');\n');
console.log('Effect facts:',Object.keys(facts.characters).length,Object.keys(facts.weapons).length,Object.keys(facts.sets).length);
for(const c of Object.values(D.characters)){if(facts.characters[c.id])continue;let desc=[...Object.values(c.passive.level).at(-1).desc,...Object.values(c.talent).map(x=>x.desc),...Object.values(c.skill).flatMap(s=>s.description.map(x=>x.desc||''))];let t=desc.filter(x=>/全队|队伍中其他|友方|目标.{0,10}(抗性|防御力).{0,6}降低/.test(x));if(t.length)console.log('Needs rule',c.id,c.name,t.map(x=>x.replace(/<[^>]*>/g,'')).join('\n').slice(0,2800));}
