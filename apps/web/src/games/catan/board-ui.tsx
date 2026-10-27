import {useId,type KeyboardEvent} from 'react';
import type {Board,Building,Resource} from './types';
import {RESOURCE_NAMES} from './types';
import {RESOURCE_COLORS,SEAT_COLORS} from './artwork';

export function ResourceIcon({resource,className=''}:{resource:Resource|'desert';className?:string}){
  return <svg className={`catan-resource-icon ${className}`} width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-lens-svg>
    {resource==='wood'?<><path d="M16 3 6 17h5l-7 8h24l-7-8h5L16 3Z"/><path d="M16 25v5"/></>:resource==='brick'?<><path d="m4 12 10-6 14 5v14l-10 5-14-5V12Z"/><path d="m4 12 14 6 10-7M18 18v12M11 15l10-6"/></>:resource==='wool'?<><path d="M8 13c-6-6 3-14 8-8 4-5 12 1 8 6 7 4 2 13-4 10-5 6-12 1-12-3-6 0-7-7 0-8Z"/><path d="M11 23v6m10-8v8m-1-15 9-3 1 8-7 1"/></>:resource==='wheat'?<><path d="M16 31V3M16 11C7 11 6 5 6 5s9-1 10 6Zm0 7C7 18 6 12 6 12s9-1 10 6Zm0 7C7 25 6 19 6 19s9-1 10 6Zm0-14C25 11 26 5 26 5s-9-1-10 6Zm0 7c9 0 10-6 10-6s-9-1-10 6Zm0 7c9 0 10-6 10-6s-9-1-10 6Z"/></>:resource==='ore'?<><path d="m3 26 10-22 5 11 4-7 8 18H3Z"/><path d="m8 15 5 4 4-7m1 3 4 7 4-5"/></>:<><path d="M3 25c6-12 12-12 17-3m-8 3c7-13 12-13 18-1M4 30h25"/><circle cx="22" cy="6" r="3"/></>}
  </svg>;
}
export function BuildingIcon({kind}:{kind:Building['kind']|'road'}){
  return <svg x="-20" y="-20" width="40" height="40" viewBox="-20 -20 40 40" className="catan-building-icon" fill="currentColor" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" data-lens-svg>{kind==='road'?<path d="M-18-4H18V4H-18Z"/>:kind==='city'?<path d="M-17 13V-5L-9-13-1-5V0L7-8l10 8v13H-17Z"/>:<path d="M-13 12V-4L0-15 13-4v16H-13Z"/>}</svg>;
}
export type BoardFrame={board:Board;roads:Record<string,number>;buildings:Record<string,Building>;robber:string;dice:[number,number]|null};
export function IslandBoard({frame,selection='',selectKind='vertex',available=[],onSelect,coordinates=false}:{frame:BoardFrame;selection?:string;selectKind?:'vertex'|'edge'|'hex';available?:string[];onSelect?:(id:string)=>void;coordinates?:boolean}){
  const id=useId().replace(/:/g,''),{board,roads,buildings,robber}=frame;
  const point=(vertex:string)=>{const v=board.vertices.find(v=>v.id===vertex)!;return {x:v.x*80,y:v.y*80};};
  const activate=(event:KeyboardEvent,id:string)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect?.(id);}};
  return <svg className="catan-island" viewBox="-440 -402 880 804" role="group" aria-label="卡坦岛地图，19块地形与海岸港口" data-cursor-lens="off">
    <defs>{Object.entries(RESOURCE_COLORS).map(([key,color])=><radialGradient key={key} id={`${id}-${key}`} cx="40%" cy="25%" r="90%"><stop stopColor={color} stopOpacity=".42"/><stop offset="1" stopColor={color} stopOpacity=".09"/></radialGradient>)}<filter id={`${id}-glow`}><feGaussianBlur stdDeviation="3"/></filter></defs>
    <path d="M-364-315 364-315 431 0 364 315-364 315-431 0Z" className="catan-sea"/>
    {board.hexes.map(hex=>{
      const x=Math.sqrt(3)*(hex.q+hex.r/2)*80,y=hex.r*120,enabled=selectKind==='hex'&&!!onSelect&&available.includes(hex.id),selected=selection===hex.id;
      const points=hex.vertices.map(v=>{const p=point(v);return `${p.x},${p.y}`;}).join(' '),color=RESOURCE_COLORS[hex.resource],red=hex.number===6||hex.number===8;
      return <g key={hex.id} className={`catan-hex ${selected?'selected':''} ${enabled?'available':''}`} role={enabled?'button':'img'} tabIndex={enabled?0:undefined} aria-label={`${hex.id} ${hex.resource==='desert'?'沙漠':RESOURCE_NAMES[hex.resource]} ${hex.number??''}${robber===hex.id?'，强盗在此':''}${enabled?'，可移动强盗':''}`} onClick={enabled?()=>onSelect!(hex.id):undefined} onKeyDown={enabled?e=>activate(e,hex.id):undefined}>
        <title>{hex.id} · {hex.resource==='desert'?'沙漠':RESOURCE_NAMES[hex.resource]} · {hex.number??'不生产'}</title>
        <polygon points={points} fill={`url(#${id}-${hex.resource})`}/>
        <g transform={`translate(${x-16} ${y-46})`} color={color}><ResourceIcon resource={hex.resource}/></g>
        {hex.number&&<g transform={`translate(${x} ${y+13})`} className={red?'catan-token frequent':'catan-token'}><circle r="23"/><text textAnchor="middle" y="3">{hex.number}</text><text textAnchor="middle" y="15" className="catan-pips">{'·'.repeat(6-Math.abs(7-hex.number))}</text></g>}
        {coordinates&&<text className="catan-coordinate catan-hex-id" x={x} y={y-57} textAnchor="middle">{hex.id}</text>}
        {robber===hex.id&&<g transform={`translate(${x+30} ${y+4})`} className="catan-robber"><circle cy="-11" r="8"/><path d="M-5-2Q-15 7-12 24Q0 31 12 24Q15 7 5-2Z"/></g>}
      </g>;
    })}
    {board.ports.map(port=>{
      const a=point(port.vertices[0]),b=point(port.vertices[1]),mx=(a.x+b.x)/2,my=(a.y+b.y)/2,len=Math.hypot(mx,my),x=mx+mx/len*45,y=my+my/len*45;
      return <g className="catan-port" key={port.edge} aria-label={`${port.resource==='any'?'通用3:1':RESOURCE_NAMES[port.resource]+'2:1'}港口，顶点 ${port.vertices.join('、')}`}><title>{port.vertices.join(' / ')} · {port.resource==='any'?'通港 3:1':RESOURCE_NAMES[port.resource]+' 2:1'}</title><path d={`M${a.x} ${a.y} ${x} ${y} ${b.x} ${b.y}`}/><rect x={x-25} y={y-15} width="50" height="30" rx="8"/>{port.resource==='any'?<text x={x} y={y+5} textAnchor="middle">3:1</text>:<><g transform={`translate(${x-19} ${y-9})`} color={RESOURCE_COLORS[port.resource]}><ResourceIcon resource={port.resource}/></g><text x={x+11} y={y+5} textAnchor="middle">2:1</text></>}</g>;
    })}
    {board.edges.map(edge=>{
      const a=point(edge.vertices[0]),b=point(edge.vertices[1]),owner=roads[edge.id],enabled=selectKind==='edge'&&!!onSelect&&available.includes(edge.id),selected=selection===edge.id;
      return <g key={edge.id} className={`catan-edge ${enabled?'available':''} ${selected?'selected':''}`} role={enabled?'button':undefined} tabIndex={enabled?0:undefined} aria-label={`${edge.id} ${owner===undefined?'空道路':`玩家${owner+1}的道路`}`} onClick={enabled?()=>onSelect!(edge.id):undefined} onKeyDown={enabled?e=>activate(e,edge.id):undefined}>
        <title>{edge.id} · {edge.vertices.join(' — ')}</title>
        {(owner!==undefined||enabled||selected)&&<line x1={a.x*.85+b.x*.15} y1={a.y*.85+b.y*.15} x2={b.x*.85+a.x*.15} y2={b.y*.85+a.y*.15} className={owner!==undefined?'catan-road-piece':'catan-road-guide'} style={owner===undefined?undefined:{stroke:SEAT_COLORS[owner]}}/>}
        {enabled&&<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="catan-hit-edge"/>}
        {coordinates&&<text className="catan-coordinate catan-edge-id" x={(a.x+b.x)/2} y={(a.y+b.y)/2-7} textAnchor="middle">{edge.id}</text>}
      </g>;
    })}
    {board.vertices.map(v=>{
      const x=v.x*80,y=v.y*80,b=buildings[v.id],enabled=selectKind==='vertex'&&!!onSelect&&available.includes(v.id),selected=selection===v.id;
      return <g key={v.id} className={`catan-vertex ${enabled?'available':''} ${selected?'selected':''}`} transform={`translate(${x} ${y})`} role={enabled?'button':undefined} tabIndex={enabled?0:undefined} aria-label={`${v.id} ${b?`玩家${b.seat+1}的${b.kind==='city'?'城市':'定居点'}`:'空顶点'}`} onClick={enabled?()=>onSelect!(v.id):undefined} onKeyDown={enabled?e=>activate(e,v.id):undefined}>
        <title>{v.id} · 相邻 {v.hexes.join(' / ')}</title>{(enabled||selected)&&<circle r="13" className="catan-node-guide"/>}
        {b&&<g color={SEAT_COLORS[b.seat]}><BuildingIcon kind={b.kind}/></g>}
        {enabled&&<circle r="19" className="catan-hit-node"/>}{coordinates&&<text className="catan-coordinate" x="0" y="-23" textAnchor="middle">{v.id}</text>}
      </g>;
    })}
  </svg>;
}
