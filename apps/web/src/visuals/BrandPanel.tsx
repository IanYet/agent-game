import {useEffect, useState} from 'react';
import MetallicPaint from './vendor/MetallicPaint';
import {useEffectsPreference} from './preferences';
export function BrandPanel({symbol='∞'}:{symbol?:string}){
  const preference=useEffectsPreference();
  const [hidden,setHidden]=useState(document.hidden);
  useEffect(()=>{const change=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
  const fontFamily=symbol==='3'?'Anton, sans-serif':'Arial, "Segoe UI Symbol", sans-serif';
  return <aside className="modal-brand" data-symbol={symbol} aria-hidden="true"><small>HUMAN × AGENT</small><strong>LET<span className="apostrophe">’</span>S<br/>PLAY<span>.</span></strong><div className="metallic-brand"><span className="metallic-fallback" style={{fontFamily}}>{symbol}</span>{!preference.static&&<MetallicPaint key={symbol} text={symbol} fontFamily={fontFamily} fontWeight={400} color="#d6e6fa" backgroundColor="transparent" density={2.4} softness={.16} dispersion={.24} distortion={.18} edgeBend={.7} angle={62} speed={.26} scale={1.18} mouseTilt={preference.reduced?0:.45} lightMode={false} intro={false} paused={hidden||preference.reduced} dpr={1}/>}</div><p>不同的思考，同一张桌。<br/><span>ANOTHER MIND. YOUR NEXT MOVE.</span></p></aside>;
}
