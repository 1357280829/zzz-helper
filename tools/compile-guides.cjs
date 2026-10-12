'use strict';
const fs=require('node:fs'),D=require('../src/data/game-data.js'),P=require('./character-guides.cjs');
const genericByType={1:'14104',2:'14110',3:'13009',4:'13115',5:'13007',6:'13019',7:'13021'};
const genericOverrides={1021:'14104',1041:'13004',1101:'13005',1151:'13113',1181:'13009',1301:'13013',1341:'13010',1361:'14003',1421:'13127',1441:'13019',1481:'14003',1541:'13003',1561:'13018',1571:'14003',1581:'14118',1621:'13005'};
const genericNotes={
1:'以普攻 / 冲刺 / 闪反连续命中维持攻击层数；未命中和离场过久会掉层。',2:'冲击与后台回能适合速切，强化特殊技后冲击加成需实际施放。',3:'异常状态覆盖期间提供稳定攻击和增伤；无异常目标上被动不生效。',4:'回能与全队攻击可跨角色使用；友方单位分别叠层，不能默认所有队都能叠满四层。',5:'盾量与生存优先；受到攻击后冲击增益需要触发，不能当常驻。',6:'多次强化特殊技可叠增伤与暴击；未叠满时不按满层评价。',7:'超百暴可转增伤，必须配合锋御暴击 / 锐暴机制，低暴击时可换喵运当头。'
};
const notes={1021:'普攻与闪反快速叠攻击；绕背输出优先用于角色自身条件，不依赖钢铁肉垫这一专武。',1041:'快速支援或闪反提供战斗攻击，火刀输出容易覆盖；需每十二秒刷新，未触发时不计被动。',1101:'能量回复帮助强化特殊技循环；冲击层数依赖储能，耗能后只短暂保留。',1151:'攻击副属性帮助加油阈值，强化特殊技叠全队攻击；冰伤部分对露西无效。',1301:'后台追加强化特殊技能利用固定攻击与技能增伤，避免硫磺石普攻层数掉层。',1341:'生命副属性和生命被动适配生命转增伤；照自身不提供盾，攻击被动需另一护盾来源。',1361:'初始冲击提高基础击破，充能强化特殊技只是补充；避免把其被动套在所有追加攻击上。',1421:'攻击副属性服务贯穿转化；能量被动要求护盾，未满足时仅计算副属性。',1481:'冲击副属性与强化特殊技契合；初始暴击仍要驱动盘补足以满足转化。',1541:'能量消耗能提供攻击层数，关注十秒覆盖；通用音擎无法完全替代专武掌控收益。',1561:'风系乱流可回能，异常目标增伤适配风循环；回能转掌控还需六号盘配合。',1571:'冲击与强化特殊技失衡收益契合；初始暴击转化仍须配盘补足。',1581:'常驻S的攻击与特殊技精通适合异常强度储存，穿透副属性的价值按敌人防御变化。',1621:'能量回复服务回能转冲击和风能循环；失衡爆发前留够能量，冲击层数不是全程常驻。'};
const helperSummary={"1011":"三段后落雷速击破","1031":"短时减防与以太增益","1071":"盾、攻击与抗打断","1101":"强化特殊技速切击破","1121":"格挡护盾与暴击","1131":"展旗传递攻击与冰增益","1141":"蓄力击破、冰抗削减","1151":"后台小猪与加油攻击","1161":"火冰减抗与失衡延长","1171":"后台火积蓄和余烬","1181":"电能满层感电","1211":"人偶穿透与感电覆盖","1221":"极性紊乱和电异常循环","1251":"羁服叠层提高失衡窗口","1271":"精通盾及反向快速支援","1281":"物理强击与动力增益","1301":"后台追加攻击与队伍攻击","1311":"快速支援、攻击与治疗","1331":"护羽后台异放","1341":"涌泉帷幕及攻击增益","1351":"猎步速切击破","1361":"后台追加击破和易伤","1391":"虎威后台击破及暴伤","1411":"异常积蓄与紊乱辅助","1421":"贯穿加成与反向支援","1451":"贯穿、破暗与涌泉","1461":"正兵轮转与钢能爆发","1481":"额外终结、击破与易伤","1491":"协律攻击与帷幕","1511":"异常击破、颤音和异放","1521":"毒素后台电伤与暴伤","1541":"霜刑异放与寒蚀循环","1561":"风化、乱流和气旋赋彩","1571":"后台炮塔与额外连携","1581":"三异常增益与虚曜回收","1621":"风化净化、对应暴伤 / 锐暴与击破"};
const teamReason=ids=>D.characters[ids[0]].name+'负责'+P[ids[0]][0]+'；'+ids.slice(1).map(id=>D.characters[id].name+'：'+(helperSummary[id]||P[id][1].split(/[，；。]/)[0])).join('；')+'。';
const profiles={};
for(const [id,a]of Object.entries(D.characters)){
 const row=P[id];if(!row||row.length!==7)throw Error('Missing reviewed guide '+id);
 const [role,mechanism,rotation,practical,training,teams,reason]=row;
 for(const team of teams)if(team.length!==3||new Set(team).size!==3||!team.map(String).includes(id)||team.some(x=>!D.characters[x]))throw Error('Invalid guide team '+id);
 const type=Object.keys(a.weapon_type)[0],weaponId=genericOverrides[id]||genericByType[type],weapon=D.weapons[weaponId];
 if(!weapon||weapon.rarity<3||Object.keys(weapon.weapon_type)[0]!==type||weapon.code_name.endsWith('_'+id))throw Error('Invalid non-signature S/A alternative '+id);
 const note=(notes[id]||genericNotes[type])+(weaponId==='13009'?' 触电唇彩来自付费成长计划；无此装备可比较双生泣星 / 雨林饕客，不默认已有。':weaponId==='14003'?' 左轮转子来自付费成长计划；无此装备可用人为刀俎并重新配盘。':'');
 profiles[id]={role,mechanism,rotation:rotation.split(' → '),practical,training:training.split('、'),teams:teams.map(x=>({ids:x.map(String),reason:teamReason(x)})),generic:{weaponId,note},source:`https://zzz.nanoka.cc/character/${id}`,evidence:'3.2 技能原文与机制推导；未逐队实机计时'};
}
const data={version:D.version,reviewedAt:'2026-10-12',profiles,sources:[{title:'正式服技能与音擎快照',url:'https://zzz.nanoka.cc/'},{title:'官方资料库',url:'https://wiki.hoyolab.com/pc/zzz/home'},{title:'璐洛洛 3.2 洛克茜实战攻略（作者实机参考）',url:'https://www.gbyhn.com.tw/blog/post/%E3%80%90%E7%B5%95%E5%8D%80%E9%9B%B6%E3%80%91%E6%B4%9B%E5%85%8B%E8%8C%9C%E2%9A%B0%EF%B8%8F%E5%9F%B9%E9%A4%8A%E5%85%A8%E6%94%BB%E7%95%A5%E2%96%B8%E9%A6%96%E4%BD%8D%E9%A2%A8%E5%B1%AC%E6%80%A7%E6%B3%9B'},{title:'小初 3.1 蕾米埃尔机制与音擎参考',url:'https://www.miyoushe.com/bh3/article/77307809'},{title:'调频保底规则（游戏规则整理）',url:'https://wiki.biligame.com/zzz/%E8%B0%83%E9%A2%91'}]};
fs.writeFileSync('src/data/character-guides.js','// Reviewed mechanism recommendations. Generator: tools/compile-guides.cjs\n(function(r,d){if(typeof module==="object"&&module.exports)module.exports=d;else r.CharacterGuides=d;})(globalThis,'+JSON.stringify(data)+');\n');
console.log('Compiled',Object.keys(profiles).length,'individual guides.');
