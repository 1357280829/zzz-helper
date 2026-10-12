'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../src/model.js');
const correct = require('../tools/primary-zhao-effects.cjs');
const key = 'zhao.additional_cohesion_damage';
function fixture(targetId = '1191', thirdId) {
  const state = M.initialState();
  const zhao = M.build(state, '1341', 'preset');
  zhao.weapon = null; zhao.discs = [];
  const target = M.build(state, targetId, 'preset');
  const members = [target, zhao];
  if (thirdId) members.push(M.build(state, thirdId, 'preset'));
  return {state, zhao, target, members, collect: () => M.collect(target, members, state.comparison)};
}
test('Zhao damage has its own additional-ability source and exact corresponding formal text', () => {
  const f = fixture(), result = f.collect();
  const additional = result.rows.find(row => row.key === key);
  assert.equal(additional.source, '额外能力：凝聚力');
  assert.deepEqual(additional.values, {damage: 36});
  assert.equal(additional.description, M.resolveText(M.coreData(f.zhao.a, 6).desc[1], f.zhao));
  assert.match(additional.description, /处于任意\[以太帷幕\]中时/);
  const core = result.rows.find(row => row.ownerId === '1341' && /核心/.test(row.source));
  assert.deepEqual(core.values, {'生命值提升': 5, flatAttack: 1000});
  assert.equal(core.description, M.resolveText(M.coreData(f.zhao.a, 6).desc[0], f.zhao));
});
test('Zhao additional ability needs another attack, anomaly or support agent in the same team', () => {
  for (const id of ['1191', '1181', '1151']) assert.ok(fixture(id).collect().rows.find(row => row.key === key), id);
  // Target and third member are both stun agents; Zhao cannot satisfy her own condition.
  const disabled = fixture('1141', '1101').collect();
  assert.equal(disabled.rows.find(row => row.key === key), undefined);
  assert.ok(disabled.rows.find(row => row.ownerId === '1341' && row.values.flatAttack === 1000));
  // A qualifying third member enables the buff even when the target is a stun agent.
  assert.ok(fixture('1141', '1151').collect().rows.find(row => row.key === key));
  const excluded = fixture('1141');
  assert.ok(!M.additional(excluded.zhao, excluded.members));
  assert.equal(excluded.collect().totals.damage, 0);
});
test('Zhao HP damage conversion retains floor thresholds, minimum, cap and all core levels', () => {
  const f = fixture();
  for (const [hp, value] of [[10000,10],[15000,10],[15399.99,10],[15400,11],[25400,36],[25799.99,36],[25800,37],[26999.99,39],[27000,40],[50000,40]]) {
    f.zhao.panel.hp = hp;
    assert.equal(f.collect().rows.find(row => row.key === key).values.damage, value, String(hp));
  }
  f.zhao.panel.hp = 25461.33;
  for (let core = 0; core <= 6; core++) {
    f.zhao.core = core;
    const result = f.collect();
    assert.equal(result.rows.find(row => row.key === key).values.damage, 36);
    assert.ok(!result.warnings.some(warning => warning.includes('凝聚力')));
  }
  assert.deepEqual(M.collect(f.zhao, [f.zhao, f.target], f.state.comparison).rows.filter(row => row.ownerId === '1341'), []);
});
test('Effect regeneration repairs imported Zhao grouping and is idempotent without changing other characters', () => {
  const facts = structuredClone(M.F), unrelated = structuredClone(facts.characters['1151']);
  const rules = facts.characters['1341'];
  const damage = rules.find(rule => rule.key === key).effects[0];
  facts.characters['1341'] = rules.filter(rule => rule.key !== key);
  facts.characters['1341'][0].effects.push(damage);
  correct(M.D, facts);
  const once = structuredClone(facts);
  correct(M.D, facts);
  assert.deepEqual(facts, once);
  assert.deepEqual(facts.characters['1151'], unrelated);
  assert.ok(!facts.characters['1341'].find(rule => /核心/.test(rule.source)).effects.some(effect => effect.stat === 'dmgBonus'));
});
test('Roxy and Remielle use distinct cached face portraits with Roxy source recorded', () => {
  const fs = require('node:fs'), path = require('node:path');
  const roxy = fs.readFileSync(path.join(__dirname, '../src/data/images/head-1621.webp'));
  const remielle = fs.readFileSync(path.join(__dirname, '../src/data/images/head-1581.webp'));
  assert.ok(!roxy.equals(remielle));
  assert.equal(M.D.portraitSources['1621'], 'IconRoleSelect68');
});
