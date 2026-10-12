# 标准预设的数据来源与统计口径

标准预设是可编辑的统一比较起点：角色 60 级、核心 F、基础技能 12 级、影画和音擎采用 00、01、11、21、31、41、51、61、65 九档（默认 21），音擎 60 级、六张 S 级 15 级驱动盘。潜能影像仅为正式服已经开放的角色设置 P6，其余角色为 P0 并标注未开放。

## 正式服资料

使用项目已缓存的正式服 3.2 数据，来自 [Nanoka 游戏资料](https://zzz.nanoka.cc/)；版本由 [正式版本清单](https://static.nanoka.cc/manifest.json) 的 `zzz.live` 决定。未使用测试服角色、音擎或潜能资料。

- 每个角色的四件套、二件套来自 `fairy_recommend.slot4`、`slot2`。这里的 4、2 表示套装件数。
- 4、5、6 号位主词条分别来自 `fairy_recommend.alt_build[0..2].part_sub_list`，只接受该物理槽位允许的主词条，默认选列表第一项。所有其他推荐主词条也保存在 `mainAlternatives` 中，方便按暴击率等实际面板调整。
- `fairy_recommend.part4/part5/part6` 并非可靠的物理槽位顺序，不能直接照抄。例如艾莲的 `part6` 是暴击伤害，而 6 号位不允许暴击伤害主词条。
- 前三个槽位固定为生命值、攻击力、防御力。六个套装位置固定为前四件四件套、后两件二件套；换到其他槽位不会改变套装效果。
- 每个构筑保存角色和音擎的原始 JSON 来源地址，可以追溯到 [露西角色资料](https://static.nanoka.cc/zzz/3.2/zh/character/1151.json)、[好斗的阿炮](https://static.nanoka.cc/zzz/3.2/zh/weapon/13115.json) 等正式记录。

## 专属音擎

59 名角色可以通过音擎的 `code_name = Weapon_[A/S]_<角色ID>` 唯一对应专属音擎，包括 13 名 A 级角色的 A 级专属，没有将泛用 S 级音擎冒充 A 级角色专属。

佩洛伊斯的音擎 [日冕遗蜕](https://static.nanoka.cc/zzz/3.2/zh/weapon/14155.json) 使用通用资源名 `Weapon_S_Common_04`。其 `desc2` 明确指向佩洛伊斯，其被动也包含佩洛伊斯专属分支，因此作为单独的明确对应处理。所有匹配结果都检查唯一性和职业一致性；缺失或歧义会使编译失败，不静默猜测。

## 潜能是否开放

判定同时检查角色 `potential` ID 列表，以及这些 ID 对应的 `potential_detail` 实际正整数等级记录。基础技能的 `potential: [0]` 不代表已经开放潜能。

正式 3.2 缓存中有完整 P1–P6 的 11 名角色：猫又、「11号」、珂蕾妲、莱卡恩、柏妮思、格莉丝、艾莲、悠真、丽娜、简、零号·安比。其余 49 名角色的潜能列表和详情均为空。预设默认 P6 只适用于上述 11 名角色。

## 40 有效词条和 54 总词条

一条初始副词条计 1 次；每次强化命中该副词条再加 1 次。S 级盘最多 15 级，每 3 级获得或强化一次副词条，共 5 次。以四条初始副词条为标准时，每张满级盘共有 9 次，六张共有 54 次；每条副词条最多 6 次，同一盘四条属性互不相同，并且不与主词条重复。

标准预设的 40 指六张盘合计的**优先属性次数**，同时保留另外 14 次非优先属性，不能把满级盘伪造为缺少副词条或总共只有 40 次。副词条的数值和等级倍数交叉核对正式数据的 [RandPropertyLibraryTemplateTb](https://github.com/malu-no996/ZenlessData/blob/1277ebca4b8a7a6c3bcbaac6d5708dc9f4a55f23/FileCfg/RandPropertyLibraryTemplateTb.json)、[RandPropertyLevelTemplateTb](https://github.com/malu-no996/ZenlessData/blob/1277ebca4b8a7a6c3bcbaac6d5708dc9f4a55f23/FileCfg/RandPropertyLevelTemplateTb.json) 和 [EquipmentLevelTemplateTb](https://github.com/malu-no996/ZenlessData/blob/1277ebca4b8a7a6c3bcbaac6d5708dc9f4a55f23/FileCfg/EquipmentLevelTemplateTb.json)。

优先属性以角色的正式 `part_sub_list`、职业和明确的生命/防御/攻击缩放为依据：通常输出使用双暴与攻击、属性异常使用精通与攻击、生命缩放角色使用生命与双暴、防御缩放角色使用防御与暴击。对应的固定攻击、生命或防御作为较低优先级的实际缩放补充。雅保留双暴构筑，南宫羽保留精通构筑；露西、耀嘉音、橘福福、潘引壶、千夏优先支持攻击依赖的增益。

这里的“有效”是标准预设采用的角色优先属性口径，不是官方评分，也不等同于已经模拟全部循环后的最优 DPS。暴击上限、技能增益上限、具体队伍和敌人会改变边际收益；预设仍然允许调整。

标配生成时检查入场面板与明确的自身暴击储备之和（含音擎精炼）的上限；克拉蕾超百暴用于锐暴，允许超过 100%，不把全部队友暴击预先当常驻，将可转移的溢出暴击次数分配给同张盘的其他优先属性，保留每张盘 9 次及全套 40 次优先词条。此校正只应用于生成标配，不改动用户编辑或账号装备。

## 重新编译

先更新正式快照，再运行：

```powershell
npm run data:guides
```

输出为 `src/data/standard-builds.js`，同时支持 `window.StandardBuilds` 和 CommonJS。编译器核对 60 名角色对应的正式套装、合法槽位主属性、唯一专属音擎及潜能等级，不读取账号资料。

## 00 音擎与金数

00 使用逐角色审核的泛用 S/A，排除本角色专武。允许常驻 S 或适合跨角色使用的 A 级音擎，附触发限制；不宣称适用于所有敌人、队伍与精炼的唯一最优。付费成长计划音擎不计 S 金，也不视为免费或已持有。

S 本体 1 金，每影画再加 1，S 音擎每星 1 金；A 不计 S 金。限定金排除常驻六角色及六音擎，全部 S 金保留它们，两个口径同时显示。限定 S 角色 65 为 7+5=12 金，实际编辑值实时重算。
