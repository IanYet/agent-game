import type {SVGProps} from 'react';
import {svgIconBody,type SvgIconName} from './svg-icons';
import './svg-icon.css';

export function SvgIcon({name,className='',...props}:{name:SvgIconName}&Omit<SVGProps<SVGSVGElement>,'children'|'dangerouslySetInnerHTML'>){
  return <svg viewBox="-100 -100 200 200" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false" data-lens-svg {...props} className={`svg-icon ${className}`} dangerouslySetInnerHTML={{__html:svgIconBody(name)}}/>;
}
