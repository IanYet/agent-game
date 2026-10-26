import {useId} from 'react';

export function GoldCoin({engraved=false,outline=false,className='',label='金币'}:{engraved?:boolean;outline?:boolean;className?:string;label?:string}){
  const id=useId();
  return <svg viewBox="0 0 100 100" className={`gold-coin ${className}`} data-holographic-ink={engraved||undefined} data-lens-svg role="img" aria-label={label}>
    <defs>
      <linearGradient id={`${id}-rim`} x2="1" y2="1"><stop stopColor="#ffe7a1"/><stop offset=".45" stopColor="#c9902e"/><stop offset="1" stopColor="#704319"/></linearGradient>
      <linearGradient id={`${id}-face`} x2=".7" y2="1"><stop stopColor="#e7c06d"/><stop offset="1" stopColor="#c9902e"/></linearGradient>
      <linearGradient id={`${id}-cut`} x1="1" y1="1" x2="0" y2="0"><stop stopColor="#292622"/><stop offset=".45" stopColor="#36322a"/><stop offset="1" stopColor="#453f34"/></linearGradient>
    </defs>
    {engraved&&(outline?<g fill="none" strokeWidth="1.5"><circle cx="50" cy="51" r="44" stroke="#05070c"/><circle cx="50" cy="50" r="44" stroke="#a8a08b" opacity=".55"/></g>:<g><circle cx="48.5" cy="48.5" r="44" fill="#727d8f" opacity=".3"/><circle cx="50" cy="50" r="44" fill={`url(#${id}-cut)`} stroke="#0f131a80" strokeWidth="1"/></g>)}
    <g data-holographic-color>
      <circle cx="50" cy="50" r="44" fill={`url(#${id}-rim)`} stroke="#96631b" strokeWidth=".7"/>
      <circle cx="50" cy="50" r="37" fill="none" stroke="#ffe7a1" strokeWidth="1.3"/>
      <circle cx="50" cy="50" r="33" fill={`url(#${id}-face)`} stroke="#96631b" strokeWidth="1.2"/>
      <path d="M27 39A26 26 0 0 1 61 27" fill="none" stroke="#ffe7a1" strokeWidth="1.3" strokeLinecap="round" opacity=".55"/>
    </g>
  </svg>;
}
