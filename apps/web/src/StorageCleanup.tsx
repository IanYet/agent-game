import {Trash2} from 'lucide-react';
import './storage-cleanup.css';

export function StorageCleanup({onClear}:{onClear:()=>void}){
  return <div className="storage-cleanup">
    <p>清除本站保存的存档、对话和偏好设置，当前对局继续运行。</p>
    <button type="button" className="button outline" onClick={onClear}><Trash2 size={14} aria-hidden="true"/>清理本地存储</button>
  </div>;
}
