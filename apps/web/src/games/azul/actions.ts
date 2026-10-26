import {actionObject,gameActionTool,integer,oneOfValues} from '../action-schema';
import {COLORS} from './engine';

export const ACTION_HELP='action 用法：{source:1,color:"blue",row:3}。source=0 是中央；source=1…factories.length 对应 factories[source-1] 工厂。color 为 blue/yellow/red/black/white，必须取走该来源全部同色砖。row=0 全放地板，row=1–5 为图案行，对应 pattern[row-1]，溢出自动落地。wall/pattern 数组下标从 0 开始；墙行 r 的第 c 格颜色为 [blue,yellow,red,black,white][(c-r+5)%5]。';
export const actionTool=gameActionTool('自行指定来源、颜色和目的行，取走全部同色砖。引擎校验来源库存、图案行颜色、容量和墙面限制。',
  actionObject({source:integer(0,9),color:oneOfValues(COLORS),row:integer(0,5)}));
