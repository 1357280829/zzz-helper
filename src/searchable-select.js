/* Searchable selectors keep the native select as the application's source of truth. */
(function () {
  'use strict';
  if (window.SearchableSelects) return;

  const instances = new Map();
  let sequence = 0, active = null, pending = false, agentGrouping = 'element';
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().trim();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function accessibleLabel(select) {
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
    const labelled = select.getAttribute('aria-labelledby');
    if (labelled) return labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    const label = select.labels?.[0];
    if (label) return Array.from(label.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' ').trim() || '选择';
    const names = {
      'catalog-owned-filter': '持有状态', 'catalog-type-filter': '配置类型',
      'catalog-element-filter': '属性', 'catalog-profession-filter': '职业',
      'catalog-camp-filter': '阵营', 'catalog-group-filter': '排版分类',
      'comparison-target-type': '目标配置类型', 'comparison-mode': '伤害模型',
      'comparison-skill': '攻击类别', 'comparison-move': '具体招式'
    };
    return names[select.id] || '选择';
  }

  function kindOf(select) {
    if (select.dataset.selectKind) return select.dataset.selectKind;
    if (select.dataset.weapon === 'id') return 'weapon';
    if (select.dataset.discField === 'setId') return 'equipment';
    if (select.id === 'comparison-target' || select.dataset.teamField === 'id' ||
        select.dataset.character != null || select.dataset.roleId != null ||
        /(?:character|agent|role)-?(?:select|picker|target)/i.test(select.id)) return 'agent';
    return 'symbol';
  }

  function symbolFor(select, text) {
    if (/预设/.test(text)) return '✎';
    if (/现有|账号|持有/.test(text)) return '◉';
    if (/火/.test(text)) return '♨';
    if (/冰/.test(text)) return '❄';
    if (/电/.test(text)) return 'ϟ';
    if (/以太/.test(text)) return '✧';
    if (/物理/.test(text)) return '◆';
    if (/强攻|攻击/.test(text)) return '⚔';
    if (/击破|冲击/.test(text)) return '✹';
    if (/异常/.test(text)) return '✺';
    if (/支援/.test(text)) return '✚';
    if (/防护|防御/.test(text)) return '▣';
    if (/命破/.test(text)) return '⟐';
    if (/锋御/.test(text)) return '⬡';
    if (/暴击/.test(text)) return '✦';
    if (/生命/.test(text)) return '♥';
    if (/能量/.test(text)) return 'ϟ';
    if (/穿透/.test(text)) return '➶';
    if (select.dataset.build === 'rank') return '◈';
    if (select.dataset.weapon === 'refine') return '★';
    return '◇';
  }

  function optionIcon(select, option) {
    const explicit = option.dataset.icon;
    const kind = kindOf(select), value = option.value;
    if (explicit) return { key: explicit, url: explicit, symbol: symbolFor(select, option.textContent) };
    if (value && /^\d+$/.test(value) && ['agent', 'weapon', 'equipment'].includes(kind)) {
      const fileKind = kind === 'agent' ? 'head' : kind;
      return { key: `${kind}:${value}`, url: `data/images/${fileKind}-${value}.webp`,
        fallback: kind === 'agent' ? `data/images/agent-${value}.webp` : '',
        symbol: symbolFor(select, option.textContent) };
    }
    return { key: `symbol:${symbolFor(select, option.textContent)}`, symbol: symbolFor(select, option.textContent) };
  }

  function iconNode(icon) {
    const frame = element('span', 'ss-icon');
    frame.setAttribute('aria-hidden', 'true');
    if (!icon.url) { frame.textContent = icon.symbol; return frame; }
    const image = element('img');
    image.alt = '';
    image.src = icon.url;
    image.addEventListener('error', () => {
      if (icon.fallback && image.getAttribute('src') !== icon.fallback) image.src = icon.fallback;
      else { image.remove(); frame.textContent = icon.symbol; }
    });
    frame.append(image);
    return frame;
  }

  function optionRows(select) {
    return Array.from(select.options).map((option, index) => {
      const label = option.label || option.textContent.trim();
      const parts = label.split(/\s+·\s+/);
      const fallbackStatus = parts.length > 1 && /^(?:已持有|未持有|现有|预设|未同步|已同步|[SAB]级?)$/.test(parts.at(-1)) ? parts.pop() : '';
      const primary = option.dataset.label ?? parts.shift() ?? label;
      const meta = option.dataset.meta ?? parts.join(' · ');
      const status = option.dataset.status ?? fallbackStatus;
      const fullLabel = [primary, meta, status].filter(Boolean).join(' · ');
      return {
        value: option.value, label: fullLabel || label, primary, meta, status, index,
        categories: {element: option.dataset.element || meta.split(/\s*·\s*/)[0] || '',
          profession: option.dataset.profession || meta.split(/\s*·\s*/)[1] || '', camp: option.dataset.camp || ''},
        disabled: option.disabled || (option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled),
        group: option.parentElement.tagName === 'OPTGROUP' ? option.parentElement.label : '',
        search: normalize([label, primary, meta, status, option.value, option.dataset.search, option.dataset.camp, option.parentElement.label].join(' ')),
        icon: optionIcon(select, option)
      };
    });
  }

  function sync(instance) {
    const select = instance.select;
    const rows = optionRows(select);
    const signature = JSON.stringify(rows);
    const changed = signature !== instance.signature;
    instance.rows = rows;
    instance.signature = signature;
    const selected = rows[select.selectedIndex];
    const key = `${select.selectedIndex}:${selected?.label}:${selected?.icon.key}`;
    if (key !== instance.selectedKey) {
      instance.selectedKey = key;
      instance.text.textContent = selected?.label || '请选择';
      instance.icon.replaceChildren(iconNode(selected?.icon || {symbol:'◇'}));
      instance.trigger.title = selected?.label || '请选择';
    }
    const disabled = select.matches(':disabled');
    if (instance.trigger.disabled !== disabled) instance.trigger.disabled = disabled;
    const label = `${accessibleLabel(select)}：${selected?.label || '请选择'}`;
    if (instance.trigger.getAttribute('aria-label') !== label) instance.trigger.setAttribute('aria-label', label);
    if (active?.instance === instance) {
      if (disabled) close(false);
      else if (changed || active.selectedIndex !== select.selectedIndex) {
        active.selectedIndex = select.selectedIndex;
        renderOptions();
      }
    }
  }

  function install(select) {
    if (instances.has(select) || select.multiple || select.dataset.searchable === 'false') return;
    const wrapper = element('span', 'ss-control');
    const trigger = element('button', 'ss-trigger');
    const icon = element('span', 'ss-current-icon');
    const text = element('span', 'ss-current-label');
    const chevron = element('span', 'ss-chevron', '⌄');
    chevron.setAttribute('aria-hidden', 'true');
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.append(icon, text, chevron);
    wrapper.append(trigger);
    select.after(wrapper);
    const instance = {
      select, wrapper, trigger, icon, text, rows: [], signature: '', selectedKey: '', id: `ss-${++sequence}`,
      originalTabindex: select.getAttribute('tabindex'), originalAriaHidden: select.getAttribute('aria-hidden')
    };
    instances.set(select, instance);
    select.classList.add('ss-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    instance.onChange = () => sync(instance);
    select.addEventListener('change', instance.onChange);
    trigger.addEventListener('click', event => {
      event.preventDefault(); // A surrounding label must not focus the hidden native control.
      if (active?.instance === instance) close(true);
      else open(instance);
    });
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        open(instance);
        if (event.key === 'Home') focusOption(0);
        if (event.key === 'End') focusOption(active?.visible.length - 1);
      }
    });
    sync(instance);
  }

  function destroy(instance) {
    if (active?.instance === instance) close(false);
    instance.select.removeEventListener('change', instance.onChange);
    instance.select.classList.remove('ss-native');
    for (const [name, value] of [['tabindex', instance.originalTabindex], ['aria-hidden', instance.originalAriaHidden]]) {
      if (value == null) instance.select.removeAttribute(name);
      else instance.select.setAttribute(name, value);
    }
    instance.wrapper.remove();
    instances.delete(instance.select);
  }

  function refresh(root = document) {
    for (const instance of instances.values()) {
      if (!instance.select.isConnected || !instance.wrapper.isConnected || instance.select.multiple) destroy(instance);
    }
    if (root.matches?.('select')) install(root);
    root.querySelectorAll?.('select').forEach(install);
    for (const instance of instances.values()) sync(instance);
  }

  function scheduleRefresh() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; refresh(); });
  }

  function open(instance) {
    if (instance.select.matches(':disabled')) return;
    sync(instance);
    if (active?.instance === instance) return;
    close(false);
    const popup = element('div', 'ss-popup');
    const search = element('input', 'ss-search');
    const list = element('div', 'ss-options');
    const footer = element('div', 'ss-help', '↑ ↓ 选择 · Enter 确认 · Esc 关闭');
    search.type = 'search';
    search.autocomplete = 'off';
    search.placeholder = `搜索${accessibleLabel(instance.select) === '选择' ? '选项' : accessibleLabel(instance.select)}…`;
    search.setAttribute('aria-label', '搜索下拉选项');
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-expanded', 'true');
    list.id = instance.id + '-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', accessibleLabel(instance.select));
    search.setAttribute('aria-controls', list.id);
    popup.append(search, list, footer);
    let groupBar;
    if (kindOf(instance.select) === 'agent') {
      groupBar = element('div', 'ss-grouping');
      groupBar.setAttribute('role', 'group'); groupBar.setAttribute('aria-label', '角色分类');
      for (const [key, label] of [['element', '按属性'], ['profession', '按职业'], ['camp', '按阵营']]) {
        const button = element('button', '', label); button.type = 'button'; button.dataset.ssGroupby = key;
        groupBar.append(button);
      }
      popup.insertBefore(groupBar, list);
    }
    document.body.append(popup);
    instance.trigger.setAttribute('aria-expanded', 'true');
    instance.trigger.setAttribute('aria-controls', list.id);
    active = { instance, popup, search, list, groupBar, visible: [], focused: -1, selectedIndex: instance.select.selectedIndex };
    search.addEventListener('input', renderOptions);
    popup.addEventListener('keydown', handleKeys);
    popup.addEventListener('pointerdown', event => {
      const option = event.target.closest('[data-ss-index]');
      if (option) event.preventDefault(); // Keep keyboard focus in the searchable combobox.
    });
    popup.addEventListener('click', event => {
      const group = event.target.closest('[data-ss-groupby]');
      if (group) {agentGrouping = group.dataset.ssGroupby; renderOptions(); search.focus({preventScroll:true}); return;}
      const option = event.target.closest('[data-ss-index]');
      if (option) choose(Number(option.dataset.ssIndex));
    });
    renderOptions();
    positionPopup();
    search.focus({preventScroll:true});
  }

  function renderOptions() {
    if (!active) return;
    const tokens = normalize(active.search.value).split(/\s+/).filter(Boolean);
    const previous = active.visible[active.focused]?.index;
    active.visible = active.instance.rows.filter(row => tokens.every(token => row.search.includes(token)));
    if (active.groupBar) {
      const groups = new Map();
      for (const row of active.visible) {
        const name = row.categories[agentGrouping] || '其他角色';
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push({...row, group: name});
      }
      active.visible = [...groups.values()].flat();
      active.groupBar.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ssGroupby === agentGrouping)));
    }
    const rows = active.instance.rows;
    active.hasMeta = rows.some(row => row.meta);
    active.hasStatus = rows.some(row => row.status);
    const metaColumns = Math.max(1, ...rows.map(row => row.meta ? row.meta.split(/\s*·\s*/).length : 0));
    active.popup.classList.toggle('ss-with-meta', active.hasMeta);
    active.popup.classList.toggle('ss-with-status', active.hasStatus);
    active.popup.style.setProperty('--ss-meta-columns', String(metaColumns));
    active.popup.style.setProperty('--ss-meta-width', `${Math.min(3, metaColumns) * 76}px`);
    const fragment = document.createDocumentFragment();
    let previousGroup;
    for (const row of active.visible) {
      if (row.group && row.group !== previousGroup) fragment.append(element('div', 'ss-group', row.group));
      previousGroup = row.group;
      const option = element('div', 'ss-option');
      option.id = `${active.instance.id}-option-${row.index}`;
      option.dataset.ssIndex = row.index;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(row.index === active.instance.select.selectedIndex));
      option.setAttribute('aria-disabled', String(row.disabled));
      option.setAttribute('aria-label', row.label);
      option.title = row.label;
      const label = element('span', 'ss-option-label', row.primary);
      label.title = row.primary;
      option.append(iconNode(row.icon), label);
      if (active.hasMeta) {
        const meta = element('span', 'ss-option-meta');
        const parts = row.meta ? row.meta.split(/\s*·\s*/) : [];
        for (let i = 0; i < metaColumns; i++) {
          const part = element('span', 'ss-meta-part', parts[i] || '');
          part.title = parts[i] || '';
          meta.append(part);
        }
        option.append(meta);
      }
      if (active.hasStatus) {
        const status = element('span', 'ss-option-status', row.status);
        status.title = row.status;
        status.dataset.status = row.status;
        option.append(status);
      }
      option.append(element('span', 'ss-check', row.index === active.instance.select.selectedIndex ? '✓' : ''));
      fragment.append(option);
    }
    if (!active.visible.length) fragment.append(element('div', 'ss-empty', '没有匹配的选项'));
    active.list.replaceChildren(fragment);
    let index = active.visible.findIndex(row => row.index === previous && !row.disabled);
    if (index < 0) index = active.visible.findIndex(row => row.index === active.instance.select.selectedIndex && !row.disabled);
    if (index < 0) index = active.visible.findIndex(row => !row.disabled);
    positionPopup();
    focusOption(index);
  }

  function focusOption(index) {
    if (!active) return;
    active.focused = index;
    active.list.querySelectorAll('.ss-option').forEach(option => option.classList.toggle('ss-focused', Number(option.dataset.ssIndex) === active.visible[index]?.index));
    const row = active.visible[index];
    if (!row || row.disabled) { active.search.removeAttribute('aria-activedescendant'); return; }
    const id = `${active.instance.id}-option-${row.index}`;
    active.search.setAttribute('aria-activedescendant', id);
    const option = document.getElementById(id);
    // Scroll only the popup list; scrollIntoView could move the surrounding detail page.
    if (option) {
      const top = option.offsetTop - active.list.offsetTop;
      if (top < active.list.scrollTop) active.list.scrollTop = top;
      else if (top + option.offsetHeight > active.list.scrollTop + active.list.clientHeight)
        active.list.scrollTop = top + option.offsetHeight - active.list.clientHeight;
    }
  }

  function move(direction) {
    if (!active?.visible.length) return;
    let index = active.focused;
    for (let step = 0; step < active.visible.length; step++) {
      index = (index + direction + active.visible.length) % active.visible.length;
      if (!active.visible[index].disabled) { focusOption(index); return; }
    }
  }

  function handleKeys(event) {
    if (!active) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = active.visible[active.focused];
      if (row) choose(row.index);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (event.key === 'Tab') close(false);
  }

  function choose(index) {
    if (!active) return;
    const instance = active.instance, row = instance.rows[index];
    if (!row || row.disabled) return;
    const select = instance.select;
    const identity = {id:select.id, data:Object.entries(select.dataset)};
    const changed = select.selectedIndex !== index;
    close(false);
    select.selectedIndex = index;
    sync(instance);
    if (changed) select.dispatchEvent(new Event('change', {bubbles:true}));
    // A change may rebuild the entire detail panel, so return focus to its replacement.
    queueMicrotask(() => {
      refresh();
      let replacement = select.isConnected ? select : identity.id ? document.getElementById(identity.id) : null;
      if (!replacement && identity.data.length) replacement = Array.from(document.querySelectorAll('select')).find(s => identity.data.every(([key,value]) => s.dataset[key] === value));
      instances.get(replacement)?.trigger.focus({preventScroll:true});
    });
  }

  function close(returnFocus) {
    if (!active) return;
    const {instance, popup} = active;
    active = null;
    popup.remove();
    instance.trigger.setAttribute('aria-expanded', 'false');
    instance.trigger.removeAttribute('aria-controls');
    if (returnFocus && instance.trigger.isConnected) instance.trigger.focus({preventScroll:true});
  }

  function positionPopup() {
    if (!active) return;
    const {instance, popup, list} = active;
    if (!instance.select.isConnected || instance.trigger.getClientRects().length === 0) { close(false); return; }
    const rect = instance.trigger.getBoundingClientRect(), gap = 7, margin = 12;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    if (rect.bottom < 0 || rect.top > viewportHeight) { close(false); return; }
    const minimum = active.hasStatus ? 560 : active.hasMeta ? 480 : 320;
    const width = Math.min(Math.max(rect.width, minimum), viewportWidth - margin * 2);
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(margin, Math.min(rect.left, viewportWidth - width - margin))}px`;
    const below = viewportHeight - rect.bottom - gap - margin, above = rect.top - gap - margin;
    const upward = below < 230 && above > below;
    const available = Math.max(100, upward ? above : below);
    popup.style.maxHeight = `${Math.min(active.groupBar ? 490 : 440, available)}px`;
    list.style.maxHeight = `${Math.max(36, Math.min(330, available - (active.groupBar ? 137 : 93)))}px`;
    const height = popup.getBoundingClientRect().height;
    popup.style.top = `${Math.max(margin, upward ? rect.top - gap - height : Math.min(rect.bottom + gap, viewportHeight - height - margin))}px`;
  }

  function start() {
    refresh();
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {subtree:true,childList:true,characterData:true,attributes:true,
      attributeFilter:['disabled','selected','value','label','aria-label','aria-labelledby','data-icon','data-search','data-label','data-meta','data-status','data-element','data-profession','data-camp','multiple']});
    // Native property assignments (select.value / option.selected) do not emit DOM mutations.
    // A small poll also covers external scripts that update them without a change event.
    window.setInterval(() => {
      for (const instance of instances.values()) {
        if (instance.select.isConnected) sync(instance);
      }
    }, 300);
    document.addEventListener('pointerdown', event => {
      if (active && !active.popup.contains(event.target) && !active.instance.wrapper.contains(event.target)) close(false);
    });
    document.addEventListener('focusin', event => {
      if (active && !active.popup.contains(event.target) && !active.instance.wrapper.contains(event.target)) close(false);
    });
    document.addEventListener('keydown', event => {
      if (active && event.key === 'Escape') { event.preventDefault(); close(true); }
    });
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    window.visualViewport?.addEventListener('resize', positionPopup);
  }

  window.SearchableSelects = {refresh, close:() => close(true)};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
