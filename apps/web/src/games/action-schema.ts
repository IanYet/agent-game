import type {JsonSchema,ToolDefinition} from '@agent-game/protocol';

export const integer=(minimum:number,maximum:number)=>({type:'integer',minimum,maximum});
export const identifier={type:'string',minLength:1,maxLength:200};
export const cardIds=(maxItems:number,minItems=1)=>({type:'array',items:identifier,minItems,maxItems,uniqueItems:true});
export const oneOfValues=(values:readonly string[])=>({type:'string',enum:[...values]});
export function actionObject(properties:Record<string,unknown>,optional:string[]=[]):JsonSchema {
  return {type:'object',properties,required:Object.keys(properties).filter(key=>!optional.includes(key)),additionalProperties:false};
}
export const actionVariant=(type:string,properties:Record<string,unknown>={},optional:string[]=[])=>actionObject({type:{const:type},...properties},optional);
export function gameActionTool(description:string,action:Record<string,unknown>):ToolDefinition {
  return {name:'game_act',description,requiresDecision:true,inputSchema:actionObject({revision:integer(1,Number.MAX_SAFE_INTEGER),action})};
}
export const actionInstructions='根据规则和当前可见局面自行构造 action，调用 game_act({revision,action})。revision 使用最新观察中的值；座位 seat/target 从 0 开始，牌的 id 使用自己可见的实体牌 ID。成功执行一次后结束本次任务，等待下一条决策；失败不会改变局面，可按具体原因修正后重试。状态过期时用 game_get_state 重新读取。';
