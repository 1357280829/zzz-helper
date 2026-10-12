/* Shared by the desktop renderer and Node tests. Percentages are stored as 18, not .18. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BuffEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const Catalog = typeof module === 'object' && module.exports ? require('./catalog.js') : globalThis.AgentCatalog;
  const ELEMENTS = ['火','冰','电','以太','物理','风','辉光'];
  const METRICS = [
    { key: 'damage', label: '通用增伤', unit: '%', tip: '与适用的属性增伤、技能增伤相加。仅填写对当前攻击生效的效果。' },
    { key: 'critDamage', label: '暴击伤害', unit: '%', tip: '输入增加的百分点：爆伤由 150% 到 160% 时填 10。' },
    { key: 'flatAttack', label: '攻击力 · 固定', unit: '', tip: '战斗中获得的固定攻击力，例如露西的加油效果。' },
    { key: 'attackPercent', label: '攻击力 · 百分比', unit: '%', tip: '战斗内攻击力加成，以受益角色的入场面板攻击力为基准。装备常驻主副词条应计入入场面板。' },
    { key: 'elementDamage', label: '属性增伤', unit: '%', tip: '只填写对当前所选伤害属性生效的增伤；与通用增伤同区相加。' },
    { key: 'critRate', label: '暴击率', unit: '%', tip: '增加的百分点；生效暴击率最多按 100% 计算。' },
    { key: 'proficiency', label: '异常精通', unit: '', advanced: true, tip: '仅常规异常伤害模式生效。不是影响积蓄速度的异常掌控。' },
    { key: 'vulnerability', label: '易伤', unit: '%', advanced: true, tip: '目标受到伤害增加，与通用增伤分区。' },
    { key: 'resShred', label: '减抗 / 无视抗性', unit: '%', advanced: true, tip: '对当前属性生效的抗性降低和抗性无视。' },
    { key: 'defShred', label: '减防 / 无视防御', unit: '%', advanced: true, tip: '普通伤害和常规异常模式生效，合计最多按 100% 计算。' },
    { key: 'penRate', label: '穿透率', unit: '%', advanced: true, tip: '在减防后作用，最终穿透率最多按 100% 计算。' },
    { key: 'penFlat', label: '穿透值', unit: '', advanced: true, tip: '减防与穿透率结算后的固定防御扣除。' },
    { key: 'stunBonus', label: '失衡易伤倍率增加', unit: '%', advanced: true, tip: '失衡易伤倍率由 150% 到 185% 时填 35；仅失衡中生效。' }
  ];
  const PARTS = ['核心技', '强化普攻', '强化特殊技', '终结技', '连携技', '影画', '影像', '音擎', '驱动盘'];
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const zero = () => Object.fromEntries(METRICS.map(m => [m.key, 0]));
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function makeCharacter(name = '新角色') {
    return { id: uid(), name, element: '火', note: '', included: true, catalogId: '', owned: false, configType: 'preset', savedConfigs: {}, info: null,
      parts: PARTS.map(name => ({ id: uid(), name, detail: '', condition: '', enabled: true, values: zero() })) };
  }
  const baseline = () => ({ name: '受益角色（示例面板）', element: '火', mode: 'average',
    initialAttack: 2500, attackPercent: 0, flatAttack: 0, damage: 0, elementDamage: 30,
    critRate: 50, critDamage: 150, proficiency: 300,
    vulnerability: 0, resistance: 0, resShred: 0, defense: 953, defShred: 0,
    penRate: 0, penFlat: 0, levelFactor: 794, stunned: false, stunMultiplier: 150 });
  function initialState() {
    const c = makeCharacter('露西');
    c.note = '按你提供的图表录入，数值仅作示例。请按技能等级、影画、音擎精炼及实际触发条件核对。';
    c.parts[2].values.flatAttack = 600;
    c.parts[2].condition = '加油效果生效；600 为示例上限';
    c.parts[5].values.critDamage = 10;
    c.parts[5].condition = '按图中影画栏录入，请核对适用对象';
    c.parts[7].values.attackPercent = 16;
    c.parts[7].detail = '专武（图表示例）';
    c.parts[7].condition = '按图中 16% 录入，需满足叠层条件';
    c.parts[8].values.damage = 18;
    c.parts[8].detail = '4 月光 + 2 摇摆';
    c.parts[8].condition = '仅计入对队友生效的 18% 增伤';
    return { version: 3, characters: [c], activeId: c.id, scope: 'single', advanced: false, baseline: baseline(),
      teams: [], activeTeamId: null, targetId: null, profiles: {}, compareTeamIds: [], referenceTeamId: null, sidebarCollapsed: false };
  }
  function ensureCatalog(state) {
    for (const agent of Catalog.characters) {
      let c=state.characters.find(c=>c.catalogId===agent.id);
      if(!c)c=state.characters.find(c=>!c.catalogId && [agent.name,{'雅':'星见雅','柳':'月城柳','悠真':'浅羽悠真','猫又':'猫宫又奈'}[agent.name]].includes(c.name));
      if(c){c.catalogId=agent.id;continue;}
      c=makeCharacter(agent.name);c.catalogId=agent.id;c.element=agent.element;state.characters.push(c);
    }
    return state;
  }
  function getConfiguration(state,c,type=c.configType) {
    if(type===c.configType)return {parts:c.parts,baseline:state.targetId===c.id?state.baseline:state.profiles[c.id]||{...baseline(),name:c.name,element:c.element},info:c.info};
    return c.savedConfigs[type] || {parts:c.parts.map(p=>({...p,values:zero()})),baseline:{...baseline(),name:c.name,element:c.element},info:null};
  }
  function changeConfiguration(state,c,type) {
    if(!['existing','preset'].includes(type)||type===c.configType)return;
    const previous=structuredClone(getConfiguration(state,c));
    c.savedConfigs={...c.savedConfigs,[c.configType]:previous};
    // First preset starts from the actual build; first actual build has no assumed buffs.
    const next=structuredClone(c.savedConfigs[type] || (type==='preset'?previous:getConfiguration(state,c,type)));
    c.configType=type;c.parts=next.parts;c.info=next.info;state.profiles={...state.profiles,[c.id]:next.baseline};
    if(state.targetId===c.id)state.baseline={...next.baseline,name:c.name,element:c.element};
  }
  function applyAccountSnapshot(state,snapshot) {
    if(!snapshot||!Array.isArray(snapshot.agents)||!snapshot.agents.length)throw new Error('账号未返回角色列表，现有记录未改变。');
    const normalized=snapshot.agents.map(a=>{
      if(!a||!/^\d{4,8}$/.test(String(a.id))||typeof a.name!=='string'||!ELEMENTS.includes(a.element))throw new Error('账号角色数据格式不正确。');
      return a;
    });
    ensureCatalog(state);
    const owned=new Set(normalized.map(a=>String(a.id)));
    state.characters.forEach(c=>{if(c.catalogId)c.owned=owned.has(c.catalogId);});
    for(const a of normalized){
      let c=state.characters.find(c=>c.catalogId===String(a.id));
      if(!c){c=makeCharacter(a.name);c.catalogId=String(a.id);c.element=a.element;state.characters.push(c);}
      c.owned=true;
      const existing=structuredClone(getConfiguration(state,c,'existing'));
      existing.baseline={...existing.baseline,...a.panel,name:c.name,element:a.element};existing.info=structuredClone(a.info||null);
      if(c.configType==='existing'){
        c.info=existing.info;state.profiles={...state.profiles,[c.id]:existing.baseline};
        if(state.targetId===c.id)state.baseline={...existing.baseline};
      }else c.savedConfigs={...c.savedConfigs,existing};
    }
    return normalized.length;
  }
  function aggregate(characters) {
    const totals = zero();
    for (const c of characters) for (const p of c.parts) if (p.enabled)
      for (const m of METRICS) totals[m.key] += num(p.values[m.key]);
    return totals;
  }
  function snapshot(b, t) {
    const attack = b.initialAttack * (1 + (b.attackPercent + t.attackPercent) / 100) + b.flatAttack + t.flatAttack;
    const damage = 1 + (b.damage + b.elementDamage + t.damage + t.elementDamage) / 100;
    const rate = clamp(b.critRate + t.critRate, 0, 100);
    const cd = b.critDamage + t.critDamage;
    const crit = b.mode === 'anomaly' || b.mode === 'noncrit' ? 1 :
      b.mode === 'critical' ? 1 + cd / 100 : 1 + rate / 100 * cd / 100;
    const mastery = b.mode === 'anomaly' ? (b.proficiency + t.proficiency) / 100 : 1;
    const effectiveDefense = Math.max(0, b.defense * (1 - clamp(b.defShred + t.defShred, 0, 100) / 100) *
      (1 - clamp(b.penRate + t.penRate, 0, 100) / 100) - b.penFlat - t.penFlat);
    const defense = b.levelFactor / (b.levelFactor + effectiveDefense);
    const resistance = 1 - b.resistance / 100 + (b.resShred + t.resShred) / 100;
    const vulnerability = 1 + (b.vulnerability + t.vulnerability) / 100;
    const stun = b.stunned ? (b.stunMultiplier + t.stunBonus) / 100 : 1;
    const factors = { attack, damage, crit, mastery, defense, resistance, vulnerability, stun };
    return { ...factors, critRate: rate, critDamage: cd, effectiveDefense,
      value: Object.values(factors).reduce((a, n) => a * n, 1) };
  }
  function calculate(b, t) {
    const before = snapshot(b, zero()), after = snapshot(b, { ...zero(), ...t });
    if (!(before.value > 0) || !Number.isFinite(before.value) || !Number.isFinite(after.value))
      return { valid: false, error: '基准伤害必须大于 0，请检查攻击力、抗性、等级系数及异常精通。' };
    const ratios = Object.fromEntries(['attack', 'damage', 'crit', 'mastery', 'defense', 'resistance', 'vulnerability', 'stun']
      .map(k => [k, after[k] / before[k]]));
    const multiplier = after.value / before.value;
    return { valid: true, before, after, ratios, multiplier, increase: (multiplier - 1) * 100,
      overflow: Math.max(0, b.critRate + (t.critRate || 0) - 100) };
  }
  function teamContributions(state, team, targetId = state.targetId) {
    if (!team) return { valid: false, error: '请先创建并选择一支三人队伍。', characters: [], totals: zero() };
    if (!targetId) return { valid: false, error: '请先选择受益角色。', characters: [], totals: zero() };
    if (!Array.isArray(team.members) || team.members.length !== 3 || new Set(team.members).size !== 3)
      return { valid: false, error: '每支队伍必须包含三个不同的角色。', characters: [], totals: zero() };
    if (!team.members.includes(targetId))
      return { valid: false, error: '这支队伍没有包含所选受益角色。', characters: [], totals: zero() };
    if (team.members.some(id => !state.characters.some(c => c.id === id)))
      return { valid: false, error: '队伍成员已不存在，请重新配置。', characters: [], totals: zero() };
    const characters = team.members.filter(id => id !== targetId).map(id => {
      const original = state.characters.find(c => c.id === id);
      const config = getConfiguration(state, original, team.configTypes?.[id] || original.configType);
      const c = { ...original, parts: config.parts };
      const disabled = team.disabledParts?.[id] || [];
      return { ...c, parts: c.parts.map(p => ({ ...p, enabled: p.enabled && !disabled.includes(p.id) })) };
    });
    return { valid: true, characters, totals: aggregate(characters) };
  }
  function compareTeams(state, ids = state.compareTeamIds, referenceId = state.referenceTeamId) {
    const rows = ids.map(id => state.teams.find(t => t.id === id)).filter(Boolean).map(team => {
      const contribution = teamContributions(state, team);
      const result = contribution.valid ? calculate(state.baseline, contribution.totals) : { valid: false, error: contribution.error };
      return { team, totals: contribution.totals, result };
    });
    const reference = rows.find(r => r.team.id === referenceId && r.result.valid);
    for (const row of rows) if (row.result.valid && reference) {
      row.relativePercent = (row.result.multiplier / reference.result.multiplier - 1) * 100;
      row.deltaPoints = row.result.increase - reference.result.increase;
    }
    return rows.sort((a,b) => Number(b.result.valid) - Number(a.result.valid) ||
      (b.result.multiplier || 0) - (a.result.multiplier || 0));
  }
  function validateState(input) {
    if (!input || ![1,2,3].includes(input.version) || !Array.isArray(input.characters) || !input.characters.length || input.characters.length > 250)
      throw new Error('文件格式不正确，需要本客户端导出的版本 1–3 JSON，包含 1–250 个角色。');
    const text = (v, max = 500) => typeof v === 'string' && v.length <= max ? v : '';
    const number = (v, min = 0, max = 10000000) => {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('数值超出范围或格式错误。');
      return v;
    };
    const seen = new Set();
    const characters = input.characters.map(c => {
      if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 150 || seen.has(c.id) || !Array.isArray(c.parts) || !c.parts.length || c.parts.length > 30)
        throw new Error('角色或部件数据不完整。');
      seen.add(c.id);
      const partIds = new Set();
      const parts = c.parts.map(p => {
        if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 150 || partIds.has(p.id)) throw new Error('部件标识重复、过长或缺失。');
        partIds.add(p.id);
        const values = Object.fromEntries(METRICS.map(m => [m.key, number(p.values?.[m.key] ?? 0)]));
        return { id: text(p.id, 150), name: text(p.name, 40) || '部件', detail: text(p.detail, 80),
          condition: text(p.condition), enabled: p.enabled !== false, values };
      });
      const savedConfigs={};
      for(const type of ['existing','preset'])if(c.savedConfigs?.[type]){
        const cfg=c.savedConfigs[type];
        // Reuse the same character/part validation without accepting nested configurations.
        const validated=validateState({version:2,characters:[{...c,parts:cfg.parts,savedConfigs:{},info:null}],baseline:cfg.baseline});
        savedConfigs[type]={parts:validated.characters[0].parts,baseline:validated.baseline,info:readInfo(cfg.info)};
      }
      return { id: text(c.id, 150), name: text(c.name, 40) || '未命名角色', element: ELEMENTS.includes(c.element) ? c.element : '火',
        included: c.included !== false, note: text(c.note, 2000), parts, catalogId:text(c.catalogId,30),owned:c.owned===true,
        configType:c.configType==='existing'?'existing':'preset',savedConfigs,info:readInfo(c.info) };
    });
    function readInfo(v){
      if(!v)return null;
      return {level:number(v.level??0,0,100),rank:number(v.rank??0,0,6),syncedAt:text(v.syncedAt,50),
        equipment:text(v.equipment,3000),skills:text(v.skills,3000),attributes:text(v.attributes,3000),panelComplete:v.panelComplete===true};
    }
    function readBaseline(value) {
      const b = baseline();
      for (const key of Object.keys(b)) {
        if (typeof b[key] === 'number') b[key] = number(value?.[key] ?? b[key], key === 'resistance' ? -100 : 0, key === 'resistance' ? 99.99 : 10000000);
      }
      if (b.initialAttack <= 0 || b.levelFactor <= 0 || b.proficiency <= 0 || b.stunMultiplier <= 0)
        throw new Error('攻击力、等级系数、异常精通和失衡倍率必须大于 0。');
      b.name = text(value?.name, 80) || b.name;
      b.element = ELEMENTS.includes(value?.element) ? value.element : '火';
      b.mode = ['average','critical','noncrit','anomaly'].includes(value?.mode) ? value.mode : 'average';
      b.stunned = value?.stunned === true;
      return b;
    }
    const b = readBaseline(input.baseline), teamIds = new Set();
    const rawTeams = input.version === 1 ? [] : input.teams ?? [];
    if (!Array.isArray(rawTeams) || rawTeams.length > 100) throw new Error('最多保存 100 支队伍。');
    const teams = rawTeams.map(t => {
      if (!t || typeof t.id !== 'string' || !t.id || t.id.length > 150 || teamIds.has(t.id)) throw new Error('队伍标识重复或缺失。');
      teamIds.add(t.id);
      if (!Array.isArray(t.members) || t.members.length !== 3 || new Set(t.members).size !== 3 || t.members.some(id => !seen.has(id)))
        throw new Error('每支队伍必须包含三个不同且存在的角色。');
      const identities=t.members.map(id=>{const c=characters.find(c=>c.id===id);return c.catalogId||c.id;});
      if(new Set(identities).size!==3)throw new Error('同一游戏角色不能重复加入一支队伍。');
      const configTypes=Object.fromEntries(Object.entries(t.configTypes||{}).map(([id,type])=>{
        if(!t.members.includes(id)||!['existing','preset'].includes(type))throw new Error('队伍配置类型无效。');return [id,type];
      }));
      const disabledParts = Object.fromEntries(Object.entries(t.disabledParts || {}).map(([id,list]) => {
        const c = characters.find(c => c.id === id);
        const allParts=c?[...c.parts,...Object.values(c.savedConfigs).flatMap(cfg=>cfg.parts)]:[];
        if (!t.members.includes(id) || !Array.isArray(list) || list.some(pid => !allParts.some(p => p.id === pid)))
          throw new Error('队伍的部件配置无效。');
        return [id, [...new Set(list)]];
      }));
      return { id: t.id, name: text(t.name,40) || '未命名队伍', members: [...t.members], disabledParts, configTypes };
    });
    const profiles = Object.fromEntries(Object.entries(input.version >= 2 ? input.profiles || {} : {}).map(([id,value]) => {
      if (!seen.has(id)) throw new Error('面板对应角色已不存在。');
      return [id,readBaseline(value)];
    }));
    const targetId = seen.has(input.targetId) ? input.targetId : null;
    if (targetId) {
      b.name = characters.find(c => c.id === targetId).name;
      profiles[targetId] = { ...b };
    }
    const compareTeamIds = Array.isArray(input.compareTeamIds) ? [...new Set(input.compareTeamIds.filter(id => teamIds.has(id)))] : [];
    return { version: 3, characters, activeId: seen.has(input.activeId) ? input.activeId : characters[0].id,
      baseline: b, scope: input.scope === 'team' && teams.length ? 'team' : 'single', advanced: input.advanced === true,
      teams, profiles, targetId, activeTeamId: teamIds.has(input.activeTeamId) ? input.activeTeamId : teams[0]?.id || null,
      compareTeamIds, referenceTeamId: compareTeamIds.includes(input.referenceTeamId) ? input.referenceTeamId : compareTeamIds[0] || null,
      sidebarCollapsed: input.sidebarCollapsed === true };
  }
  return { METRICS, PARTS, ELEMENTS, uid, zero, baseline, makeCharacter, initialState, aggregate, snapshot, calculate, teamContributions, compareTeams, validateState,ensureCatalog,getConfiguration,changeConfiguration,applyAccountSnapshot };
});
