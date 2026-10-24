# 璀璨宝石基础版

本模块采用 Marc André 设计、Space Cowboys 发行的 Splendor 基础版，按 2024 周年版规则书实现，支持 2–4 人。不包含 Duel 或扩展。

- [发行商游戏页](https://www.spacecowboys-games.com/game/splendor/)及[英文规则书](https://cdn.svc.asmodee.net/production-spacecowboys/uploads/2025/10/SCSPL01EN_SPLENDOR_RULES_LIGHT.pdf)：人数、资源、四种主要行动、黄金任意替代、预留、10 枚上限、贵族与等轮结束。相同声望时，已购发展牌较少者获胜；仍相同共享胜利。
- [Splendor-AI 的固定牌组](https://roeey777.github.io/Splendor-AI/_modules/splendor/splendor/splendor_utils.html)：Steven Spratley 等为 COMP90054 游戏环境整理的 90 张发展牌与 10 位贵族数值。
- [独立牌组 CSV](https://github.com/nerdvana-ro/splendor-tools/blob/main/cards.csv)与[牌组 JSON](https://github.com/kyle-ip/splendor/blob/main/src/data/card-pool.json)：90 张发展牌的等级、颜色、声望与逐色成本已与上述学术实现逐张核对一致。贵族以学术实现的完整十种要求为准；未采用 JSON 中有差异的贵族条目。
- [发行商验证的 Dized FAQ](https://rules.dized.com/game/vdDSzuu4RsC8F45PsW0TKw/faq)：不足三色时尽可能拿取、不能任意丢弃 token、预留不可丢弃与贵族来访。
- [Asmodee 代表的无行动裁定转引](https://boardgames.stackexchange.com/questions/57737/what-to-do-when-you-dont-have-any-move-available)：完全不能拿取、预留或购买时允许被迫跳过，并展示预留牌证明。引擎只在不存在其他合法主要行动时开放该行动。

`data.ts` 是固定数值表，不生成随机卡牌成本。每层独立洗牌，市场取牌后立即同层补牌。贵族随机抽取人数加一，其余离场。

网页为本项目自行绘制的宝石、商路图形与三维 token，未复制原版卡图或贵族插画。首局由名单第一位先手，替代实体规则中依年龄选先手；同桌下一局轮换先手、重新配置所有牌与 token，并按稳定玩家身份继承胜局和累计声望。
