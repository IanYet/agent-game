import {useId} from 'react';
import {GEM_PALETTE,GEM_FACET_SCALE,gemFacetColor,gemOutline,mixGemColor} from './artwork';
import {GEM_NAMES, type Gem} from './types';
import {GoldCoin} from '../../visuals/GoldCoin';
export function GemIcon({color,className='',engraved=false}:{color:Gem;className?:string;engraved?:boolean}){
  const id=useId(),rootClass=`sp-gem ${engraved?'sp-gem-engraved ':''}${className}`;
  if(color==='gold')return <GoldCoin className={rootClass} engraved={engraved} label={GEM_NAMES[color]}/>;
  const outline=gemOutline(color),palette=GEM_PALETTE[color];
  const points=(vertices:Array<[number,number]>)=>vertices.map(([x,y])=>`${50+x*50},${50+y*50}`).join(' ');
  const silhouette=(fill='currentColor')=><polygon points={points(outline)} fill={fill}/>;
  const recess=engraved&&<g className="sp-gem-recess">
    <defs><linearGradient id={`${id}-cut`} x1="1" y1="1" x2="0" y2="0"><stop stopColor={mixGemColor('#131820',palette[0],.12)}/><stop offset=".45" stopColor={mixGemColor('#1a2029',palette[0],.16)}/><stop offset="1" stopColor={mixGemColor('#242b35',palette[0],.2)}/></linearGradient></defs>
    <g className="sp-gem-cut-edge" transform="translate(-1.5 -1.5)">{silhouette()}</g><g className="sp-gem-cut-hole">{silhouette(`url(#${id}-cut)`)}</g>
  </g>;
  return <svg viewBox="0 0 100 100" className={rootClass} data-holographic-ink={engraved||undefined} data-lens-svg role="img" aria-label={GEM_NAMES[color]}>
    <defs><linearGradient id={id} x2="1" y2="1"><stop stopColor={mixGemColor(palette[0],palette[1],.28)}/><stop offset="1" stopColor={palette[0]}/></linearGradient></defs>
    {recess}<g data-holographic-color>
    <polygon points={points(outline)} fill={palette[0]}/>
    {outline.map((a,i)=>{const b=outline[(i+1)%outline.length];return <polygon key={i} points={points([a,b,[b[0]*GEM_FACET_SCALE,b[1]*GEM_FACET_SCALE],[a[0]*GEM_FACET_SCALE,a[1]*GEM_FACET_SCALE]])} fill={gemFacetColor(color,i)}/>;})}
    <polygon points={points(outline.map(([x,y])=>[x*GEM_FACET_SCALE,y*GEM_FACET_SCALE]))} fill={`url(#${id})`}/>
    <polygon points={points(outline)} fill="none" stroke={mixGemColor(palette[1],palette[2],.4)} strokeWidth=".65" strokeLinejoin="round"/>
    </g>
  </svg>;
}
