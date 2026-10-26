import {createElement,type ComponentPropsWithRef,type CSSProperties} from 'react';
import {HolographicMaterial} from './HolographicMaterial';
import type {HolographicPattern} from './holographic-engraving';
import type {SvgIconName} from './svg-icons';
import './holographic-card.css';

export type {HolographicPattern,HolographicEngraving} from './holographic-engraving';
type CardTag='div'|'button';
type CardOptions={
  glowColor?:`#${string}`;
  highlightColor?:string;
  trimColor?:string;
  rainbow?:boolean;
  pattern?:HolographicPattern;
  patternSymbol?:SvgIconName;
  width?:CSSProperties['width'];
  aspectRatio?:CSSProperties['aspectRatio'];
  radius?:number;
  restingLight?:readonly [number,number];
  tilt?:boolean;
  selected?:boolean;
};
export type HolographicCardProps<T extends CardTag='div'>=CardOptions&{as?:T}&Omit<ComponentPropsWithRef<T>,keyof CardOptions|'as'>;

// Content and game semantics stay in the caller. This component owns only the
// dark card, its frame, moving reflection and shared lens paint surface.
export function HolographicCard<T extends CardTag='div'>({
  as,children,className='',style,glowColor='#c3cbd6',highlightColor=glowColor,trimColor='#737d8c66',
  rainbow=false,pattern='contours',patternSymbol='sparkle',width=112,aspectRatio=64/91,radius=12,restingLight=[.09,.09],tilt=true,selected=false,...props
}:HolographicCardProps<T>){
  const cardStyle:CSSProperties&Record<`--holographic-${string}`,string|number>={
    width,aspectRatio,'--holographic-radius':`${Math.max(2,radius)}px`,
    '--holographic-highlight':highlightColor,'--holographic-trim':trimColor,...style,
  };
  return createElement(as??'div',{
    ...(as==='button'?{type:'button'}:{}),...props,
    className:`holographic-card ${className}`,style:cardStyle,
    'data-holographic-selected':selected||undefined,
  },<div className="holographic-card-face" data-lens-card-frame data-lens-plane>
    <HolographicMaterial glowColor={glowColor} rainbow={rainbow} pattern={pattern} patternSymbol={patternSymbol} restingLight={restingLight} tilt={tilt}/>
    {children}
  </div>);
}
