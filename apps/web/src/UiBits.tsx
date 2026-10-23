import type {ReactNode} from 'react';
import {User,Sparkles} from 'lucide-react';
export function Logo({small=false}:{small?:boolean}){return <div className={`logo ${small?'small':''}`}><span/><span/><span/><span/></div>;}
export function Dot({on=true}:{on?:boolean}){return <i className={`status-dot ${on?'on':''}`}/>;}
export function Avatar({kind,seat,size=''}:{kind:string;seat:number;size?:string}){const Icon=kind==='human'?User:Sparkles;return <div className={`avatar avatar-${seat} ${size}`}><Icon size={size==='large'?27:21} strokeWidth={1.8}/></div>;}
export function StatusTag({children,tone=''}:{children:ReactNode;tone?:string}){return <span className={`tag ${tone}`}>{children}</span>;}
