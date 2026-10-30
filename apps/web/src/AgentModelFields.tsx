import type {ModelInfo, AgentSettings, HarnessInfo, PlayerKind} from '@agent-game/protocol';
import {Select} from './Select';
const labels:Record<string,string>={none:'无',off:'关闭',disabled:'关闭',enabled:'开启',minimal:'极低',low:'低',medium:'中',high:'高',xhigh:'更高',max:'最高',ultra:'极高'};
export const kindName:Record<string,string>={human:'真人','codex-acp':'Codex · ACP',codex:'Codex · App Server',dsh:'dsh · DeepSeek Harness',workbuddy:'WorkBuddy'};
export function effortLabel(effort?:string){return effort?labels[effort]??effort:'模型默认';}
export function AgentHarnessField({harnesses,kind,label,onChange}:{harnesses?:HarnessInfo[];kind:PlayerKind;label:string;onChange:(kind:PlayerKind)=>void}){
  const choices=harnesses?.length?harnesses:([{id:kind,name:kindName[kind],available:false,detail:'连接本机后检测程序'}] as HarnessInfo[]);
  return <div className="field"><span>本机程序 / Harness</span><Select label={`${label} Harness`} value={kind} options={choices.map(h=>({value:h.id,label:h.name+(!h.available?' · 未就绪':''),detail:h.detail,disabled:!h.available}))} onChange={v=>onChange(v as PlayerKind)} disabled={!harnesses?.length}/></div>;
}
export function AgentModelFields({models,settings,label,onChange}:{models:ModelInfo[];settings:AgentSettings;label:string;onChange:(value:AgentSettings)=>void}){
  const selected=settings.model?models.find(m=>m.id===settings.model):models.find(m=>m.isDefault)??models[0],efforts=selected?.supportedReasoningEfforts??[];
  return <div className="agent-model-fields"><div className="field"><span>模型</span><Select label={`${label} 模型`} value={settings.model??''} disabled={!models.length} invalid={!!settings.model&&!selected} options={[{value:'',label:selected&&!settings.model?`默认 · ${selected.name}`:'使用程序默认模型'},...models.map(m=>({value:m.id,label:m.name,detail:m.id}))]} onChange={v=>{const next=v?models.find(m=>m.id===v):models.find(m=>m.isDefault)??models[0];onChange({model:v||undefined,reasoningEffort:next?.supportedReasoningEfforts?.some(e=>e.effort===settings.reasoningEffort)?settings.reasoningEffort:undefined});}}/></div><div className="field"><span>思考强度</span><Select label={`${label} 思考强度`} value={settings.reasoningEffort??''} disabled={!efforts.length} options={[{value:'',label:`模型默认${selected?.defaultReasoningEffort?' · '+effortLabel(selected.defaultReasoningEffort):''}`},...efforts.map(e=>({value:e.effort,label:`${effortLabel(e.effort)} · ${e.effort}`,detail:e.description}))]} onChange={v=>onChange({...settings,reasoningEffort:v||undefined})}/>{!efforts.length&&<small>{models.length?'此模型不支持调节思考强度':'连接后读取该程序的独立模型目录'}</small>}</div></div>;
}
