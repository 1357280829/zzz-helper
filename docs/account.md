# 国服账号同步

助手通过官方扫码接口确认登录，认证凭据保存在独立的 `persist:miyoushe-account` 会话。官方网页登录窗口使用同一会话、沙箱和上下文隔离，没有本地 preload。不会读取系统浏览器或游戏进程的认证资料。

“同步数据”先读取当前登录账号绑定的官服或渠道服角色，再逐个读取全部持有角色详情。保存属性（基础、追加、最终）、音擎、驱动盘主副词条、技能、影画和觉醒的完整返回字段。现有配置只读；更新时保留预设。部分详情失败会列出缺失提示，缺失属性不以演示值补齐，完整计算暂停。

官方接口要求验证时，通过官方窗口完成。请求沿用该会话官方页面生成的 DEVICEFP / _MHYUUID 设备标识，避免验证后仍被不同设备请求拒绝。认证与设备值不进入角色 JSON 或导出备份；退出登录可清除该会话。

接口和字段参考 [genshin.py 的绝区零组件](https://github.com/seriaati/genshin.py/blob/master/genshin/client/components/chronicle/zzz.py)、[角色模型](https://github.com/seriaati/genshin.py/blob/master/genshin/models/zzz/character.py)、[请求签名](https://github.com/seriaati/genshin.py/blob/master/genshin/utility/ds.py)，扫码参考 [UIGF 接口文档](https://uigf.org/zh/mihoyo-api-collection/hoyolab/login/qrcode_hoyolab.html)。适配器独立实现，不承诺内部接口长期不变。

2026-10-12 真实验证：重启后读取绑定账号并同步 21 名持有角色，全部详情成功，返回 252 项属性和 54 张已装备驱动盘。未记录 UID、昵称或认证值。

自动测试使用隔离会话和固定响应，覆盖登录凭据完整性、设备指纹、绑定校验、属性解析、部分失败、预设保留与桌面同步。`npm run test:network` 另测官方接口连通性，使用虚拟账号和隔离目录。
