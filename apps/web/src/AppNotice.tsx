import {useId} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight,CircleAlert,X} from 'lucide-react';
import './app-notice.css';

export function AppNotice({message,hidden,onClose,onConnect}:{message:string;hidden:boolean;onClose:()=>void;onConnect?:()=>void}){
  const titleId=useId();
  return createPortal(<aside className="app-notice" role="alert" aria-labelledby={titleId} hidden={hidden} data-cursor-lens="off">
    <header><CircleAlert size={17} aria-hidden="true"/><h2 id={titleId}>牌桌提示</h2><button type="button" className="icon-button" onClick={onClose} aria-label="关闭提示"><X size={15}/></button></header>
    <p>{message}</p>
    {onConnect&&<footer><button type="button" className="button outline" onClick={onConnect}>连接与恢复<ArrowUpRight size={14} aria-hidden="true"/></button></footer>}
  </aside>,document.body);
}
