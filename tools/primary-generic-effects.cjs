// These two generic engines are absent from the imported calculator facts.
// Parse their five refinement levels from the cached formal game descriptions.
'use strict';
module.exports=function addPrimaryGenericEffects(data,facts){
  const plain=text=>String(text||'').replace(/<[^>]*>/g,'');
  facts.primaryWeaponSources={...(facts.primaryWeaponSources||{})};
  for(const [id,pattern,stats]of [
    ['12005',/异常掌控和异常精通提升([\d.]+)点/,['anomalyMasteryFlat','anomalyProficiency']],
    ['12006',/全队角色攻击力提升([\d.]+)%/,['atkPct']]
  ]){
    const weapon=data.weapons[id];
    if(!weapon||Object.keys(weapon.weapon_type)[0]!=='4')throw Error('Missing formal generic support engine '+id);
    const values=[1,2,3,4,5].map(level=>{
      const text=plain(weapon.talents[level]?.desc),match=text.match(pattern);
      if(!match||!text.includes('同名被动效果之间不可叠加'))throw Error('Unrecognized generic engine description '+id+' R'+level);
      return Number(match[1]);
    });
    facts.weapons[id]={self:[],team:stats.map(stat=>({id:'formal-'+id+'-'+stat,type:'fixed',target:{kind:'default'},stat,mode:stat==='atkPct'?'pct':'flat',...(stat==='atkPct'?{basis:'outOfCombatAtk'}:{}),value:values[0],modificationValues:{value:values},durationSeconds:10}))};
    facts.primaryWeaponSources[id]='https://static.nanoka.cc/zzz/'+data.version+'/zh/weapon/'+id+'.json';
  }
  return facts;
};
