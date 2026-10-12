// Compile release-only starter builds from the cached, localized game records.
// These are editable defaults, not a claim of optimal team DPS.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const D=require('../src/data/game-data.js');
const G=require('../src/data/character-guides.js');
const PROP={11102:'hpPct',11103:'hpFlat',12102:'atkPct',12103:'atkFlat',13102:'defPct',13103:'defFlat',20103:'critRate',21103:'critDmg',31203:'anomalyProficiency',31402:'anomalyMasteryPct',12202:'impactPct',23103:'penRatio',23203:'penFlat',30502:'energyRegenPct',31503:'physicalDmg',31603:'fireDmg',31703:'iceDmg',31803:'electricDmg',31903:'etherDmg',32303:'windDmg'};
const SUB=new Set(['hpFlat','atkFlat','defFlat','hpPct','atkPct','defPct','critRate','critDmg','anomalyProficiency','penFlat']);
const OPTIONS=[['hpFlat'],['atkFlat'],['defFlat'],['hpPct','atkPct','defPct','critRate','critDmg','anomalyProficiency'],['hpPct','atkPct','defPct','penRatio','physicalDmg','fireDmg','iceDmg','electricDmg','etherDmg','windDmg'],['hpPct','atkPct','defPct','impactPct','anomalyMasteryPct','energyRegenPct']];
const hpSupport=new Set(['1341','1451']),attackSupport=new Set(['1151','1311','1391','1421','1491']);
function priorities(a){
 const given=[...new Set(a.fairy_recommend.part_sub_list.map(x=>PROP[x]).filter(x=>SUB.has(x)))],profession=Number(Object.keys(a.weapon_type)[0]);
 let profile;
 if(hpSupport.has(String(a.id)))profile=['hpPct','hpFlat','critRate','critDmg'];
 else if(attackSupport.has(String(a.id)))profile=['atkPct','atkFlat','critRate','critDmg'];
 else if(String(a.id)==='1121')profile=['defPct','defFlat','atkPct','critDmg'];
 else if(profession===7)profile=['critRate','defPct','critDmg','defFlat'];
 else if(profession===6)profile=['critRate','critDmg','hpPct','hpFlat'];
 else if((profession===3&&String(a.id)!=='1091')||given.includes('anomalyProficiency'))profile=['anomalyProficiency','atkPct','atkFlat','penFlat'];
 else profile=['critRate','critDmg','atkPct','atkFlat'];
 // Keep the source's order when it belongs to this profile, then add the
 // corresponding flat scaling stat so all six slots can receive useful rolls.
 const selected=[...new Set([...given.filter(x=>profile.includes(x)),...profile])].slice(0,4);
 return selected;
}
const builds={};
for(const a of Object.values(D.characters)){
 const id=String(a.id),f=a.fairy_recommend;
 if(!f||!D.sets[f.slot4]||!D.sets[f.slot2])throw Error('Missing release recommendation: '+id);
 const signature=Object.values(D.weapons).filter(w=>w.code_name.endsWith('_'+id)||w.desc2?.includes('['+a.name+']'));
 if(signature.length!==1)throw Error('Ambiguous signature weapon: '+id);
 const w=signature[0];
 if(Object.keys(w.weapon_type)[0]!==Object.keys(a.weapon_type)[0])throw Error('Signature profession mismatch: '+id);
 const mainAlternatives=[['hpFlat'],['atkFlat'],['defFlat']];
 for(let i=0;i<3;i++){
  const candidates=f.alt_build?.[i]?.part_sub_list?.map(x=>PROP[x]).filter(x=>OPTIONS[i+3].includes(x));
  if(!candidates?.length)throw Error('No legal recommended main stat for '+id+' slot '+(i+4));
  mainAlternatives.push([...new Set(candidates)]);
 }
 const potentialLevels=(a.potential||[]).map(key=>a.potential_detail?.[key]?.level).filter(x=>Number.isInteger(x)&&x>0&&x<=6);
 const potentialMax=potentialLevels.length?Math.max(...potentialLevels):0;
 builds[id]={name:a.name,weaponId:String(w.id),weaponName:w.name,
  signatureEvidence:w.code_name.endsWith('_'+id)?'character-specific asset code '+w.code_name:'weapon description explicitly names '+a.name,
  sets:[...Array(4).fill(String(f.slot4)),...Array(2).fill(String(f.slot2))],
  mains:mainAlternatives.map(x=>x[0]),mainAlternatives,priorities:priorities(a),
  sourcePriorities:f.part_sub_list.map(x=>PROP[x]).filter(Boolean),
  potentialAvailable:potentialMax>0,potentialMax,
  source:`https://static.nanoka.cc/zzz/${D.version}/zh/character/${id}.json`,
  weaponSource:`https://static.nanoka.cc/zzz/${D.version}/zh/weapon/${w.id}.json`};
 const guide=G.profiles[id],ownReserve=({1201:25,1301:25,1321:25,1381:10,1431:30,1521:18,1591:66})[id]||0;
 builds[id].generic=guide.generic;
 builds[id].critCanOverflow=id==='1611';
 builds[id].tiers={};
 for(const tier of ['00','01','11','21','31','41','51','61','65']){
  const engine=D.weapons[tier==='00'?guide.generic.weaponId:w.id],refine=tier==='65'?5:1;
  const text=String(engine.talents[refine].desc).replace(/<[^>]*>/g,'');
  const weaponReserve=[...text.matchAll(/暴击率(?:额外)?提升([\d.]+)%/g)].reduce((sum,m)=>sum+Number(m[1]),0);
  builds[id].tiers[tier]={weaponId:String(engine.id),refine,combatCritReserve:ownReserve+weaponReserve};
 }
}
const data={version:D.version,source:'https://zzz.nanoka.cc',policy:{rank:2,core:6,level:60,refine:1,discLevel:15,effectiveRolls:40,totalRolls:54,initialSubstats:4},builds};
const text='/* Compiled from the formal game snapshot. See docs/STANDARD-BUILDS.md. */\n(function(r,d){if(typeof module==="object"&&module.exports)module.exports=d;else r.StandardBuilds=d;})(globalThis,'+JSON.stringify(data)+');\n';
fs.writeFileSync(path.resolve(__dirname,'../src/data/standard-builds.js'),text);
console.log('Standard builds:',Object.keys(builds).length,'potential available:',Object.values(builds).filter(x=>x.potentialAvailable).length,'formal version:',D.version);
