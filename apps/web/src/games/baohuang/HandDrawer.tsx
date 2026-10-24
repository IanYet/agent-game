import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {rankLabel} from '@agent-game/core';
import {Modal} from '../../Modal';
import {PlayerCard} from '../../visuals/PlayerCard';
import {useEffectsPreference} from '../../visuals/preferences';
import {classify} from './engine';
import {BaoPlayingCard} from './PlayingCard';
import type {BaoCard} from './types';

const categories=[{id:'all',label:'全部',accept:(_:BaoCard)=>true},{id:'high',label:'王与2',accept:(c:BaoCard)=>c.rank>=15},{id:'middle',label:'A–10',accept:(c:BaoCard)=>c.rank>=10&&c.rank<=14},{id:'low',label:'9–6',accept:(c:BaoCard)=>c.rank<=9}];
export function BaoHandDrawer({name,seat,hand,own,editable,open,origin,selected,onSelect,onClear,onHint,onClose,onExited}:{
  name:string;seat:number;hand:BaoCard[];own:boolean;editable:boolean;open:boolean;origin:DOMRect|null;selected:string[];
  onSelect:(id:string)=>void;onClear:()=>void;onHint?:()=>void;onClose:()=>void;onExited:()=>void;
}){
  const effects=useEffectsPreference(),[visible,setVisible]=useState(false),[ready,setReady]=useState(false),[category,setCategory]=useState('all');
  const exited=useRef(onExited);exited.current=onExited;
  useLayoutEffect(()=>{
    const panel=document.querySelector<HTMLElement>('.bao-hand-modal');if(!panel||!origin)return;
    const rect=panel.getBoundingClientRect();panel.style.transformOrigin=`${Math.max(0,Math.min(rect.width,origin.x+origin.width/2-rect.x))}px ${Math.max(0,Math.min(rect.height,origin.y+origin.height/2-rect.y))}px`;
  },[origin]);
  useEffect(()=>{
    let first=0,second=0,timer=0;setReady(false);
    if(open){
      if(effects.reduced){setVisible(true);setReady(true);}
      else first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{setVisible(true);timer=window.setTimeout(()=>setReady(true),220);});});
    }else {setVisible(false);timer=window.setTimeout(()=>exited.current(),effects.reduced?0:190);}
    return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);clearTimeout(timer);};
  },[open,effects.reduced]);
  const chosen=hand.filter(c=>selected.includes(c.id)),combination=classify(chosen),filter=categories.find(c=>c.id===category)!;
  return <Modal branded={false} className={`bao-hand-modal ${visible?'is-visible':''} ${!open?'is-closing':''} ${effects.reduced?'bao-motion-off':''}`} title={`${name}的手牌`} subtitle={`第${seat+1}席 · ${hand.length}张 · ${own?'点选后回到主卡出牌':'仅浏览当前允许查看的手牌'}`} onClose={onClose}
    footer={<div className="bao-drawer-footer"><div aria-live="polite"><strong>{own?(chosen.length?`已选 ${chosen.length} 张`:'尚未选牌'):`共 ${hand.length} 张`}</strong><small>{own?(combination?.label??(chosen.length?'套牌须为同点数，可挂大小王':'选择会保留到返回牌桌；出牌成功后自动清除')):'按点数从大到小排列'}</small></div><button className="button primary" disabled={!ready||!open} onClick={onClose}>{own?'完成选牌':'返回牌桌'}</button></div>}>
    <PlayerCard state="waiting" primary className="bao-hand-sheet" data-cursor-lens="off">
      <div className="bao-drawer-heading"><span className="bao-drawer-owner">{own?'H':String(seat+1).padStart(2,'0')}</span><div><span className="identity-caption">{own?'YOUR HAND. YOUR NEXT MOVE.':'A CLOSER LOOK.'}</span><strong>{name}<small>{own?'私有手牌':'观战手牌'}</small></strong></div><b>{hand.length}<small>张</small></b></div>
      <div className="bao-hand-filters" role="group" aria-label="手牌分类">{categories.map(c=><button key={c.id} type="button" disabled={!ready||!open} aria-label={`${c.label} · ${hand.filter(c.accept).length}张`} aria-pressed={category===c.id} onClick={()=>setCategory(c.id)}>{c.label}<b>{hand.filter(c.accept).length}</b></button>)}</div>
      <div className="bao-drawer-grid" aria-label={`${name}的完整手牌`}>{hand.filter(filter.accept).map(c=><BaoPlayingCard key={c.id} card={c} selected={own&&selected.includes(c.id)} onClick={own?()=>onSelect(c.id):undefined} disabled={!editable||!ready||!open}/>)}</div>
      {!hand.filter(filter.accept).length&&<p className="bao-drawer-empty">此分类没有手牌。</p>}
      {own&&<div className="bao-drawer-selection"><p>{editable?'点击卡牌选中，再次点击取消。可跨分类选择。':'现在可以浏览手牌；进入行牌阶段后可选牌。'}</p><div><button className="text-button" disabled={!editable||!ready||!open||!onHint} onClick={onHint}>合法提示</button><button className="text-button" disabled={!chosen.length||!ready||!open} onClick={onClear}>清空选择</button></div>{chosen.length>0&&<span>已选：{Array.from(new Set(chosen.map(c=>c.rank))).sort((a,b)=>b-a).map(rank=>`${rankLabel(rank)}×${chosen.filter(c=>c.rank===rank).length}`).join(' · ')}</span>}</div>}
    </PlayerCard>
  </Modal>;
}
