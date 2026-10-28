import {actionObject,actionVariant,gameActionTool,identifier,integer,oneOfValues} from '../action-schema';
import {BUILDING_KEYS,GOODS,ROLES} from './data';

export const ACTION_HELP=`game_act({revision,action})，只提交自己的当前决策。
role：{type:"choose_role",role:"settler"|"mayor"|"builder"|"craftsman"|"trader"|"captain"|"prospector_1"|"prospector_2",privilege?:boolean}。从 roles 中 owner:null 的牌选择，领取牌上金币；privilege:false 自愿放弃特权。
settler：{type:"hacienda"} 先抽庄园额外暗地并保留，不结束正常选地；每次最多一次。然后 {type:"settle",tile:明地id|"quarry",useHospice?:boolean} 或 {type:"pass"}。满十二块后不能再拿地。
mayor_recruit：{type:"recruit",accept:true|false} 确认是否接受船上新人员。市长的额外人员由供应给付，与 accept 分开；全部确认后才按市长顺序轮发。
mayor：{type:"assign",island:{"自己地块id":0或1,...},buildings:{"自己建筑key":人数,...}}，表达全板的新布置，不是增量。省略的地块和建筑为零；必须安置 min(colonists,全板人员容量) 名，剩余才闲置。不能填写不属于自己的地块或建筑。
builder：{type:"build",building:建筑key,quarryDiscount?:整数,useUniversity?:boolean} 或 pass。每次只建一座。quarryDiscount 省略时使用最大可用采石折扣；指定时不能超过已启用采石场数和建筑列数。大学必须在建造之前已启用。
craftsman：{type:"produce",useFactory?:boolean} 领取所有可生产且有库存的商品，或 pass 全部放弃。不能提交数量或只取部分商品。
craftsman_bonus：{type:"bonus",good:本次自己生产过的商品名|null}，等所有人生产完才到这步；null 放弃奖励。
trader：{type:"trade",good:商品名,useOffice?:boolean,useSmallMarket?:boolean,useLargeMarket?:boolean,privilege?:boolean} 或 pass，每次一桶。省略能力开关时自动使用已启用的能力；显式 true 但能力未启用会拒绝。
captain：{type:"ship",good:商品名,ship:货船容量4…8|"wharf",useHarbor?:boolean,privilege?:boolean}。ship 数字直接使用 ships.capacity；数量由规则自动装最多，不接受 amount。同类货已占船就不能另占空船。只有无普通船可装时才可 pass，私人码头可以不用。
storage：{type:"store",goods:{corn:保留桶数,indigo:保留桶数,sugar:保留桶数,tobacco:保留桶数,coffee:保留桶数}}。可只写保留的种类，其余默认零；不是归还数量。最多仓库允许的种类加一个单桶，允许主动少留。
商品名固定为 corn 玉米、indigo 靛蓝、sugar 蔗糖、tobacco 烟草、coffee 咖啡；建筑 key 见完整基础建筑表。每次成功后结束任务，下一次决策会另行唤醒。当前消息已有最新局面，通常可以直接行动；状态过期或需要完整历史才调用 game_get_state。`;
const flag={type:'boolean'};
const quantities=actionObject(Object.fromEntries(GOODS.map(g=>[g,integer(0,11)])),[...GOODS]);
export const actionTool=gameActionTool('直接提交角色选择、拓荒、人员分配、建造、生产、贸易、强制船运或仓储；逐项检查资源、能力、容量与当前行动机会。',{
  oneOf:[
    actionVariant('choose_role',{role:oneOfValues(ROLES),privilege:flag},['privilege']),actionVariant('hacienda'),
    actionVariant('settle',{tile:identifier,useHospice:flag},['useHospice']),actionVariant('recruit',{accept:flag}),
    actionVariant('assign',{island:{type:'object',additionalProperties:integer(0,1),maxProperties:12},buildings:{type:'object',additionalProperties:integer(0,3),maxProperties:12}}),
    actionVariant('build',{building:oneOfValues(BUILDING_KEYS),quarryDiscount:integer(0,4),useUniversity:flag},['quarryDiscount','useUniversity']),
    actionVariant('produce',{useFactory:flag},['useFactory']),actionVariant('bonus',{good:{anyOf:[oneOfValues(GOODS),{type:'null'}]}}),
    actionVariant('trade',{good:oneOfValues(GOODS),useOffice:flag,useSmallMarket:flag,useLargeMarket:flag,privilege:flag},['useOffice','useSmallMarket','useLargeMarket','privilege']),
    actionVariant('ship',{good:oneOfValues(GOODS),ship:{anyOf:[integer(4,8),{const:'wharf'}]},useHarbor:flag,privilege:flag},['useHarbor','privilege']),
    actionVariant('store',{goods:quantities}),actionVariant('pass'),
  ],
});
