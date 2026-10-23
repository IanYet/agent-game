import {cardLabel,type Card} from '@agent-game/core';
interface GameEvent {seq:number;seat?:number;text:string;cards?:Card[]}
import type {StoredRun} from '../runtime/types';
export function CardReplay({run}:{run:StoredRun}){return <div className="replay-events">{run.state.events.map((event:GameEvent)=><div key={event.seq}><span>{event.seq.toString().padStart(2,'0')}</span><p>{event.seat!==undefined&&<b>{run.roster[event.seat].name} </b>}{event.text}{event.cards&&<small>{event.cards.map(cardLabel).join(' ')}</small>}</p></div>)}</div>;}
