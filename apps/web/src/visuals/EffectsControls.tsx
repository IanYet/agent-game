import {Select} from '../Select';
import {setCursorLensEnabled,setEffectsMode,useEffectsPreference,type EffectsMode} from './preferences';

export function EffectsControls(){
  const effects=useEffectsPreference();
  const lensOn=effects.lensEnabled&&!effects.reduced;
  return <div className="effects-preferences"><div className="effects-preference"><span>画面效果</span><Select buttonGroup lensAllowed label="画面效果" value={effects.mode} onChange={value=>setEffectsMode(value as EffectsMode)} options={[{value:'system',label:'跟随系统'},{value:'reduced',label:'减少动态'},{value:'static',label:'静态画面'}]}/></div><button type="button" role="switch" aria-checked={lensOn} aria-label="鼠标透镜" disabled={effects.reduced} title={effects.reduced?'当前画面效果或系统减少动态设置已关闭透镜':'单独开启或关闭所有页面的鼠标透镜'} className="cursor-lens-toggle" onClick={()=>setCursorLensEnabled(!effects.lensEnabled)}><span>鼠标透镜</span><i aria-hidden="true"><span/></i><small>{lensOn?'开':'关'}</small></button></div>;
}
