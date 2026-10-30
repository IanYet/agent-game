import {GOOD_COLORS,GOOD_NAMES,type Good} from './data';
export function Barrel({good,className=''}:{good:Good;className?:string}){
  return <svg className={`pr-barrel ${className}`} viewBox="0 0 40 48" data-lens-svg role="img" aria-label={GOOD_NAMES[good]}><path d="M9 7Q20 1 31 7Q39 24 31 41Q20 47 9 41Q1 24 9 7Z" fill={GOOD_COLORS[good]} stroke="#121923" strokeWidth="1.5"/><ellipse cx="20" cy="8" rx="11" ry="4" fill="#ffffff20" stroke="#141b2566"/><path d="M6 16Q20 22 34 16M6 32Q20 38 34 32" fill="none" stroke="#1b2437" strokeWidth="4"/><path d="M14 12Q10 27 14 39M26 12Q30 27 26 39" fill="none" stroke="#ffffff25" strokeWidth="1"/></svg>;
}
export function ShipIcon(){return <svg viewBox="0 0 160 100" className="pr-ship-icon" data-lens-svg aria-hidden="true"><path d="M18 68H145L122 89H42Z" fill="#b7a284" stroke="#d4c3a4"/><path d="M78 8V65M83 14L130 57H83ZM71 22L32 59H71Z" fill="#ddd8c4" stroke="#ddd8c4" strokeWidth="2"/><path d="M12 96Q29 88 46 96T80 96T114 96T148 96" fill="none" stroke="#6b9fa8" strokeWidth="3"/></svg>;}
export function paintPuertoRicoSymbol(ctx:CanvasRenderingContext2D){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-87,44);ctx.lineTo(88,44);ctx.lineTo(60,72);ctx.lineTo(-57,72);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(0,-87);ctx.lineTo(0,31);ctx.stroke();ctx.beginPath();ctx.moveTo(10,-75);ctx.lineTo(83,30);ctx.lineTo(10,30);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-10,-58);ctx.lineTo(-71,30);ctx.lineTo(-10,30);ctx.closePath();ctx.fill();
  ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-85,89);ctx.bezierCurveTo(-58,73,-41,101,-15,88);ctx.bezierCurveTo(10,75,31,101,55,88);ctx.bezierCurveTo(68,81,79,81,90,88);ctx.stroke();ctx.restore();
}
