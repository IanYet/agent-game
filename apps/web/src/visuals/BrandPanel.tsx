import {useEffect, useState} from 'react';
import MetallicPaint from './vendor/MetallicPaint';
import {useEffectsPreference} from './preferences';
import {gameSymbolFont,gameSymbolImage} from './game-symbol';
export function BrandPanel({symbol='infinity'}:{symbol?:string}){
  const preference=useEffectsPreference();
  const [hidden,setHidden]=useState(document.hidden);
  const [artwork,setArtwork]=useState<{symbol:string;src:string}|null>(null);
  useEffect(()=>{const change=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
  useEffect(()=>{
    let alive=true;
    const ready=symbol==='2'||symbol==='3'?document.fonts.load(gameSymbolFont(symbol),symbol):Promise.resolve();
    void ready.catch(()=>{}).then(()=>{if(alive)setArtwork({symbol,src:gameSymbolImage(symbol)});});
    return()=>{alive=false;};
  },[symbol]);
  const src=artwork?.symbol===symbol?artwork.src:undefined;
  return <aside className="modal-brand" aria-hidden="true"><small>HUMAN × AGENT</small><strong>LET<span className="apostrophe">’</span>S<br/>PLAY<span>.</span></strong><div className="metallic-brand">{src&&<img className="metallic-fallback" src={src} alt=""/>}{src&&!preference.static&&<MetallicPaint key={symbol} imageSrc={src} color="#d6e6fa" backgroundColor="transparent" density={2.4} softness={.16} dispersion={.24} distortion={.18} edgeBend={.7} angle={62} speed={.26} scale={1.18} mouseTilt={preference.reduced?0:.45} lightMode={false} intro={false} paused={hidden||preference.reduced} dpr={1}/>}</div><p>不同的思考，同一张桌。<br/><span>ANOTHER MIND. YOUR NEXT MOVE.</span></p></aside>;
}
