// Correct the imported grouping using Zhao's cached formal passive descriptions.
'use strict';
module.exports = function correctZhaoEffects(data, facts) {
  const agent = data.characters['1341'];
  const rules = facts.characters['1341'];
  if (!agent || !rules) throw Error('Missing Zhao character/effect data');
  const plain = text => String(text || '').replace(/<[^>]*>/g, '');
  const passive = Object.values(agent.passive.level).find(row => row.level === 7);
  const text = plain(passive?.desc?.[1]);
  const number = pattern => {
    const match = text.match(pattern);
    if (!match) throw Error('Unrecognized Zhao additional ability: ' + pattern);
    return Number(match[1]);
  };
  if (!/队伍中存在.*\[强攻\].*\[异常\].*\[支援\].*时触发/.test(text) ||
      !/处于任意\[以太帷幕\]中时/.test(text)) throw Error('Unrecognized Zhao activation conditions');
  const base = number(/全队造成的伤害提升([\d.]+)%/);
  const threshold = number(/初始最大生命值高于([\d.]+)点/);
  const step = number(/每超过([\d.]+)点初始最大生命值/);
  const increment = number(/增伤效果额外提升([\d.]+)%/);
  const cap = number(/最大总共提升至([\d.]+)%/);
  if (step <= 0 || increment <= 0 || cap < base) throw Error('Invalid Zhao additional ability values');
  // This HP conversion is unchanged at every core level, unlike the core ATK bonus.
  for (const row of Object.values(agent.passive.level)) {
    if (plain(row.desc[1]) !== text) throw Error('Zhao additional ability now requires core-level scaling');
  }
  const effectId = 'effect_zhao_hp_to_dmg', key = 'zhao.additional_cohesion_damage';
  const core = rules.find(rule => /核心/.test(rule.source) && rule.effects.some(effect => effect.stat === 'atkFlat'));
  if (!core) throw Error('Missing Zhao core team bonus');
  for (const rule of rules) rule.effects = rule.effects.filter(effect => effect.id !== effectId);
  facts.characters['1341'] = rules.filter(rule => rule.key !== key);
  const name = passive.name[1];
  facts.characters['1341'].splice(facts.characters['1341'].indexOf(core) + 1, 0, {
    key, source: name,
    effects: [{id: effectId, type: 'formula', target: {kind: 'default'}, stat: 'dmgBonus', mode: 'flat',
      source: {label: '照的初始最大生命值'},
      formula: {expression: `clamp(floor((x - ${threshold}) / ${step}) * ${increment} + ${base}, ${base}, ${cap})`, valueUnit: 'storedPercent'},
      sourceLabel: '照的初始最大生命值'}],
    modifiers: []
  });
  facts.primaryCharacterSources = {...facts.primaryCharacterSources,
    '1341': 'https://static.nanoka.cc/zzz/' + data.version + '/zh/character/1341.json'};
  return facts;
};
