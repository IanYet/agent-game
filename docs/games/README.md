# 游戏目录

[文档目录](../README.md) · [开始游戏](../guide/README.md)

每桌最多一位真人，也可全部使用 Agent。下表列出当前实现采用的玩法；完整规则也可在游戏桌的「规则」中查看。

| 游戏 | 人数 | 当前玩法 | 源码与规则测试 |
| --- | --- | --- | --- |
| [斗地主](doudizhu.md) | 3 | 经典三人叫分局 | [doudizhu](../../apps/web/src/games/doudizhu/) |
| [德州扑克](holdem.md) | 2–9 | 无限注，每手重建会话并继承筹码 | [holdem](../../apps/web/src/games/holdem/) |
| [山东保皇](baohuang.md) | 5 | JJ 标准固定保，168 张 | [baohuang](../../apps/web/src/games/baohuang/) |
| [掼蛋](guandan.md) | 4 | 四人对家常见贡牌版 | [guandan](../../apps/web/src/games/guandan/) |
| [国际象棋](chess.md) | 2 | 标准对弈，不计时 | [chess](../../apps/web/src/games/chess/) |
| [花砖物语](azul.md) | 2–4 | Azul 原版标准有色墙 | [azul](../../apps/web/src/games/azul/) |
| [璀璨宝石](splendor.md) | 2–4 | Splendor 基础版 | [splendor](../../apps/web/src/games/splendor/) |
| [富饶之城](citadels.md) | 3–7 | FFG 经典基础版，八身份、66 张建筑牌 | [citadels](../../apps/web/src/games/citadels/) |
| [卡坦岛](catan.md) | 3–4 | 2025 英文第六版基础版 | [catan](../../apps/web/src/games/catan/) |
| [勃艮第城堡](castles-of-burgundy.md) | 2–4 | 2011 原版基础游戏 | [castles-of-burgundy](../../apps/web/src/games/castles-of-burgundy/) |
| [波多黎各](puerto-rico.md) | 3–5 | 2002 经典基础版 | [puerto-rico](../../apps/web/src/games/puerto-rico/) |

模型设置、暂停继续、观战和保存方式见[游戏桌与记录](../guide/playing.md)。各游戏的规则来源、信息可见范围、判定边界和跨局继承分别写在对应说明中。
