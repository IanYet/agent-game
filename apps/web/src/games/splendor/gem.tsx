import {GEM_PALETTE, gemOutline} from './artwork';
import {GEM_NAMES, type Gem} from './types';
export function GemIcon({color,className=''}:{color:Gem;className?:string}){
  const outline=gemOutline(color),palette=GEM_PALETTE[color];
  const points=(vertices:Array<[number,number]>)=>vertices.map(([x,y])=>`${50+x*49},${50+y*49}`).join(' ');
  return <svg viewBox="0 0 100 100" className={`sp-gem ${className}`} role="img" aria-label={GEM_NAMES[color]}>
    <polygon points={points(outline)} fill={palette[0]} stroke={palette[1]} strokeWidth="1"/>
    {outline.map((a,i)=>{const b=outline[(i+1)%outline.length];return <polygon key={i} points={points([a,b,[b[0]*.47,b[1]*.47],[a[0]*.47,a[1]*.47]])} fill={palette[[1,0,2,3,2,0,1,1][i]]}/>;})}
    <polygon points={points(outline.map(([x,y])=>[x*.47,y*.47]))} fill={palette[0]}/>
    {color==='gold'&&<path d="M40 45h20M43 54h14" stroke={palette[1]} strokeWidth="4"/>}
  </svg>;
}
export function SplendorFallback(){return <>{Array.from({length:12},(_,i)=><span className="sp-fallback-token" data-gem={(['white','blue','green','red','black','gold'] as const)[i%6]} key={i}><GemIcon color={(['white','blue','green','red','black','gold'] as const)[i%6]}/></span>)}</>;}
