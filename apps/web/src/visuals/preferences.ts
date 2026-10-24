import {useSyncExternalStore} from 'react';
export type EffectsMode='system'|'reduced'|'static';
const key='tongzhuo.effects.mode',query=matchMedia('(prefers-reduced-motion: reduce)');
let mode:EffectsMode='system';
try{const saved=localStorage.getItem(key);if(saved==='reduced'||saved==='static')mode=saved;}catch{/* Storage can be unavailable in a private browser. */}
const lensKey='tongzhuo.effects.lens';
let lensEnabled=true;
try{lensEnabled=localStorage.getItem(lensKey)!=='off';}catch{/* Keep the default when storage is unavailable. */}
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(listener=>listener());
const storageChanged=(event:StorageEvent)=>{
  if(event.key!==null&&event.key!==key&&event.key!==lensKey)return;
  try{
    if(event.storageArea!==localStorage)return;
    const saved=localStorage.getItem(key);
    mode=saved==='reduced'||saved==='static'?saved:'system';
    lensEnabled=localStorage.getItem(lensKey)!=='off';
    emit();
  }catch{/* Keep this page's choice when storage is unavailable. */}
};
const subscribe=(listener:()=>void)=>{
  listeners.add(listener);
  if(listeners.size===1){query.addEventListener('change',emit);window.addEventListener('storage',storageChanged);}
  return()=>{listeners.delete(listener);if(!listeners.size){query.removeEventListener('change',emit);window.removeEventListener('storage',storageChanged);}};
};
const snapshot=()=>`${mode}:${query.matches}:${lensEnabled}`;
export const effectsReduced=()=>mode!=='system'||query.matches;
export function setCursorLensEnabled(next:boolean){lensEnabled=next;try{localStorage.setItem(lensKey,next?'on':'off');}catch{/* Keep this session's choice. */}emit();}
export function setEffectsMode(next:EffectsMode){mode=next;try{localStorage.setItem(key,next);}catch{/* The current page still uses the selection. */}emit();}
export function useEffectsPreference(){useSyncExternalStore(subscribe,snapshot);return {mode,reduced:effectsReduced(),static:mode==='static',lensEnabled};}
