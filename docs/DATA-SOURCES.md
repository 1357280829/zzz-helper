# 数据来源与快照

核对日期：2026-10-12。正式服 **3.2**，不使用资料站 latest 标记的测试服内容。

## 原始游戏资料

[Nanoka 数据库](https://zzz.nanoka.cc/) 的[版本清单](https://static.nanoka.cc/manifest.json)中 `zzz.live` 指向正式版。使用对应中文 character、weapon、equipment JSON 及公开图标，缓存于 `src/data/`。

60 名角色包含成长、分级核心、技能公式与倍率、六段影画及潜能；100 个音擎包含成长和全部改装被动；30 套盘包含两件与四件效果。详情原文直接取正式服快照，账号技能优先显示接口原文。角色使用 `IconRoleCircleNN` 真正头像，60 张头像和装备图片可离线查看。

刷新工具：`tools/fetch-game-data.cjs`。原始 JSON 缓存按正式版本隔离，打包排除该缓存。更新原文时仍须审查新增机制与数值映射。

标配专武、套装、主词条和潜能开放情况通过 `tools/compile-standard-builds.cjs` 从正式快照编译为 `src/data/standard-builds.js`。60 名角色全部匹配专武；11 名开放潜能影像、49 名未开放。详细来源和副词条分配口径见 [STANDARD-BUILDS.md](STANDARD-BUILDS.md)。

## 效果事实与公式

数值交叉参考维护者发布的 [ZztIsolation/zzz_calculator 数据目录](https://github.com/ZztIsolation/zzz_calculator/tree/main/data)：combat_buffs、agents、agent_skills、w_engines、drive_disc_sets、stat_rules。

`tools/compile-effects.cjs` 提取公式参数、约束和招式标识生成 `src/data/effects.js`，没有引入对方应用代码；展示描述来自正式服快照。队伍模型只采用两名队友对目标的效果，目标自身触发效果不加入提升。

泛用音擎「残响」-Ⅱ型和Ⅲ型的五档改装数值由 `tools/primary-generic-effects.cjs` 直接解析正式快照，并记录对应原始武器 JSON 地址。Ⅱ型提升异常掌控和精通，Ⅲ型提供战斗攻击百分比；同名效果取高、不叠加，持续时间不当作全程覆盖率。

照的生命值增伤由 `tools/primary-zhao-effects.cjs` 对照正式快照，独立归为“额外能力：凝聚力”，与核心被动的生命值/固定攻击分开。配队校验排除照自身，只在同队其他角色包含强攻、异常或支援时生效；帷幕按现有增益生效窗口口径计算。展示原文来自对应的额外能力，不使用核心被动原文。生成工具包含该修正，重新生成效果数据不会恢复旧归类。

洛克茜的上游 `IconRoleCircle68` 图片与蕾米埃尔重复，头像改用同角色的 [IconRoleSelect68](https://static.nanoka.cc/assets/zzz/IconRoleSelect68.webp)，保持原始资源，不生成替代角色图；抓取工具保留该选择。

驱动盘词条与成长交叉核对正式 3.2 的 [RandPropertyLibraryTemplateTb](https://github.com/malu-no996/ZenlessData/blob/1277ebca4b8a7a6c3bcbaac6d5708dc9f4a55f23/FileCfg/RandPropertyLibraryTemplateTb.json) 和 [EquipmentLevelTemplateTb](https://github.com/malu-no996/ZenlessData/blob/1277ebca4b8a7a6c3bcbaac6d5708dc9f4a55f23/FileCfg/EquipmentLevelTemplateTb.json)。预设界面仅配置 S 级盘；账号原始装备品级仍保留。

伤害公式与等级系数参考 [BanresDev/zzzcalc](https://github.com/BanresDev/zzzcalc/blob/main/src/lib/Calculations.ts)。资料收录完整不表示所有特殊机制已经能计算；边界见 [formulas.md](formulas.md)。

## 账号

米游社快照保存全部 properties、weapon、equip、skills、ranks、skill_awaken 等角色字段。认证和设备指纹仅在官方登录分区使用，不进入角色 JSON。

2026-10-12 真实同步验证：21 名持有角色、252 项面板属性、54 张已装备驱动盘，全部详情成功。此文不包含 UID、昵称或认证值。
