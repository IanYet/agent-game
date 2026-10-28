import type {CSSProperties} from 'react';
import {ANIMAL_NAMES,BUILDING_NAMES,COLOR_NAMES,TILES,tileEffect,tileName} from './data';
import type {Tile,TileKind} from './types';

export const PALETTE:Record<TileKind,string>={castle:'#346f60',mine:'#737c8f',ship:'#458ca8',animal:'#92a75a',building:'#b38b6c',knowledge:'#c6ad50'};
export const HEX='50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5';
export function Glyph({tile}:{tile:Tile}){
  const base={fill:'none',stroke:'currentColor',strokeWidth:2.7,strokeLinejoin:'round' as const,strokeLinecap:'round' as const};
  if(tile.kind==='knowledge')return <g><path {...base} d="M26 37q12-5 24 2 12-7 24-2v28q-12-5-24 2-12-7-24-2zM50 39v28"/><text x="50" y="58" textAnchor="middle" stroke="none" fill="currentColor" fontSize="23" fontWeight="700">{tile.knowledge}</text></g>;
  if(tile.kind==='animal')return <g><path {...base} d={tile.animal==='chicken'?'M33 64q-12-19 5-22l-2-10 10 6q13-15 20 0l6 3-8 6q5 16-16 19M44 66v7m11-8v8M31 48l-7-7':tile.animal==='cow'?'M30 48l-6-13 17 5q9-5 18 0l17-5-6 13v13q-20 20-40 0zM36 55h0m28 0h0M42 65h16':tile.animal==='pig'?'M29 45q-8-11-7-16l16 10q27-10 34 13 10 13-7 20l-3 6m-25-5-3 6M29 52q-9 10-12-1M65 53h12v13H65zM66 44h0':'M29 43q-9-13 3-17 3-12 14-6 12-9 17 4 15 0 11 14 11 13-2 20l-6 13-10 2-11-4q-22 1-23-13-7-7 7-13zM48 44l18-2-2 19-14 3zM31 68v9m26-5v6'}/><text x="50" y="91" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="600">{tile.count} {ANIMAL_NAMES[tile.animal!]}</text></g>;
  let path='';
  if(tile.kind==='castle')path='M25 72h50V40H62V28H50v12H38V28H25zM25 40h13M50 40h12M44 72V57h12v15';
  else if(tile.kind==='ship')path='M22 64h56l-9 13H33zM50 24v40M46 29L28 56h18zM55 34l18 22H55M23 83q9-5 18 0 9-5 18 0 9-5 18 0';
  else if(tile.kind==='mine')path='M20 75l18-42 13 19 12-31 18 54zM40 75l10-16 12 16M30 28l38 34M48 22q18 0 24 17';
  else path={warehouse:'M22 74V43l28-18 28 18v31zM32 74V51h36v23M32 58h36M32 66h36',carpenter:'M28 74l36-43M27 37l16-15 23 18-13 14zM22 65l12 11',church:'M26 74V45l24-20 24 20v29zM50 18v-9m-6 5h12M44 74V59h12v15M44 45h12',market:'M23 48h54l-8-21H31zM27 49v26h46V49M36 75V58h15v17M23 48q7 9 14 0 7 9 13 0 7 9 14 0 7 9 13 0','boarding-house':'M25 74V46h50v28M30 59h40v9H30zM31 59V49h13v10M23 38l27-16 27 16',bank:'M21 40l29-18 29 18zM25 75h50M31 45v25m19-25v25m19-25v25','city-hall':'M24 75V43h52v32M20 43l30-22 30 22M50 21V11h15v9H50M37 75V55h26v20',watchtower:'M34 75V36h-7V23h12v8h10v-8h12v8h10v-8h8v13H66v39zM45 75V56h11v19'}[tile.building!]??'';
  return <g><path {...base} d={path}/>{tile.kind==='building'&&<text x="50" y="91" textAnchor="middle" fill="currentColor" fontSize="11">{BUILDING_NAMES[tile.building!]}</text>}</g>;
}
export function HexTile({id}:{id:string}){const tile=TILES[id];return <span className="burgundy-tile" style={{'--burgundy-color':PALETTE[tile.kind]} as CSSProperties} title={`${tileName(id)} · ${tileEffect(id)}`}><svg viewBox="0 0 100 100" role="img" aria-label={tileName(id)}><polygon className="burgundy-tile-face" points={HEX}/><polygon className="burgundy-tile-rim" points="50,8 87,29 87,71 50,92 13,71 13,29"/><Glyph tile={tile}/>{tile.back==='black'&&<circle cx="78" cy="27" r="4" fill="#20232e" stroke="#ead9b7" strokeWidth="1"/>}</svg></span>;}
export function ColorKey({color}:{color:TileKind}){return <span className="burgundy-color-key" style={{'--burgundy-color':PALETTE[color]} as CSSProperties}>{COLOR_NAMES[color]}</span>;}
