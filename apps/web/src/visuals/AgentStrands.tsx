import {useEffect,useRef} from 'react';
import {attachStrands,type StrandsState} from './strands-renderer';
import {useEffectsPreference} from './preferences';

export function AgentStrands({active,connecting,muted,seat,showNumber=true}:{active:boolean;connecting:boolean;muted:boolean;seat:number;showNumber?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),control=useRef<ReturnType<typeof attachStrands>>(undefined);
  const {reduced}=useEffectsPreference();
  const state:StrandsState={active,connecting,muted,reduced};
  useEffect(()=>{control.current=attachStrands(canvas.current!,state);return()=>{control.current?.dispose();control.current=undefined;};},[]);
  useEffect(()=>{control.current?.update(state);},[active,connecting,muted,reduced]);
  return <span className="agent-strands" data-agent-activity={active?'thinking':connecting?'connecting':'rest'} aria-hidden="true"><canvas ref={canvas}/>{showNumber&&<span className="player-agent-number">{String(seat+1).padStart(2,'0')}</span>}</span>;
}
