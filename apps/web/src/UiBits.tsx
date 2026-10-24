import type {ButtonHTMLAttributes, ReactNode} from 'react';
import Magnet from './visuals/vendor/Magnet';
import {useEffectsPreference} from './visuals/preferences';
export function Logo({small=false}:{small?:boolean}){return <svg className={`logo ${small?'small':''}`} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><ellipse cx="17" cy="15" rx="14" ry="9" transform="rotate(-38 17 15)"/><ellipse cx="23" cy="25" rx="14" ry="9" transform="rotate(38 23 25)"/></svg>;}
export function Dot({on=true}:{on?:boolean}){return <i className={`status-dot ${on?'on':''}`}/>;}
export function Avatar({kind,seat,size=''}:{kind:string;seat:number;size?:string}){return <span className={`participant-mark ${size}`} aria-hidden="true">{kind==='human'?'H':String(seat+1).padStart(2,'0')}</span>;}
export function StatusTag({children,tone=''}:{children:ReactNode;tone?:string}){return <span className={`tag ${tone}`}>{children}</span>;}
export function PrimaryButton({children,...props}:ButtonHTMLAttributes<HTMLButtonElement>){const {reduced}=useEffectsPreference();return <Magnet padding={24} maxOffset={8} spring={{stiffness:170,damping:20}} disabled={props.disabled||reduced} wrapperClassName="primary-magnet"><button {...props} className={`button primary ${props.className??''}`}>{children}</button></Magnet>;}
