export function CuriosityToggle({enabled,onChange,compact=false}:{enabled:boolean;onChange:(enabled:boolean)=>void;compact?:boolean}){
  return <div className={`curiosity-setting ${compact?'compact':''}`}><button type="button" role="switch" aria-checked={enabled} aria-label="好奇模式" className="cursor-lens-toggle curiosity-toggle" title="开启后可点击 Agent 光球查看对话，并在结算后翻开所有余牌；观战时始终可查看。" onClick={()=>onChange(!enabled)}><span>好奇模式</span><i aria-hidden="true"><span/></i><small>{enabled?'开':'关'}</small></button>{!compact&&<p>开启后，点击 Agent 光球查看完整对话，结算后翻开所有玩家的余牌。观战时始终可查看手牌与对话。对话仅保存在当前浏览器。</p>}</div>;
}
