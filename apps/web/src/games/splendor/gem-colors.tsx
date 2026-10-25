import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Scene,type WebGLRenderer} from 'three';
import {createTableCamera,createTableRenderer,resizeTableRenderer,TABLE_VIEW_HEIGHT} from '../../visuals/table-renderer';
import {CRYSTAL_BODY_COLORS,SplendorTableModels} from './table-models';
import {COLORS,GEM_NAMES,type Color} from './types';
import './gem-colors.css';

type Palette=Record<Color,string>;
type Layout='separate'|'overlap';
type Label={color:Color;x:number;y:number};
const STORAGE_KEY='tongzhuo:splendor:gem-color-draft';

function normalizeHex(value:string){
  const hex=value.trim().replace(/^#/,'');
  if(/^[\da-f]{6}$/i.test(hex))return '#'+hex.toLowerCase();
  if(/^[\da-f]{3}$/i.test(hex))return '#'+[...hex].map(char=>char+char).join('').toLowerCase();
  return null;
}

function readPalette():Palette{
  const palette={...CRYSTAL_BODY_COLORS};
  try{
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');
    for(const color of COLORS)if(typeof stored?.[color]==='string')palette[color]=normalizeHex(stored[color])??palette[color];
  }catch{/* Use the table's current colors when no usable draft is available. */}
  return palette;
}

class GemPreview {
  private renderer:WebGLRenderer;
  private camera=createTableCamera();
  private scene=new Scene();
  private models=new SplendorTableModels();
  private gems=COLORS.map((_,index)=>this.models.create(index,1));
  private layout:Layout='separate';
  private paused=false;
  private dragging=false;
  private lost=false;
  private frame=0;
  private last=0;
  private pitch=.26;
  private yaw=-.35;

  constructor(private canvas:HTMLCanvasElement,private labels:(labels:Label[])=>void,private error:(message:string)=>void){
    this.renderer=createTableRenderer(canvas);
    this.scene.add(...this.gems);
    canvas.addEventListener('webglcontextlost',this.lose);
    canvas.addEventListener('webglcontextrestored',this.restore);
    document.addEventListener('visibilitychange',this.wake);
    this.resize();
    this.wake();
  }

  setColors(colors:Palette){for(const color of COLORS)this.models.setColor(color,colors[color]);this.render();}
  setLayout(layout:Layout){this.layout=layout;this.resize();}
  setPaused(paused:boolean){this.paused=paused;this.wake();}
  setDragging(dragging:boolean){this.dragging=dragging;this.wake();}
  rotate(x:number,y:number){this.yaw+=x*.008;this.pitch+=y*.008;this.render();}
  resetAngle(){this.pitch=.26;this.yaw=-.35;this.render();}

  resize=()=>{
    if(this.lost)return;
    const rect=this.canvas.getBoundingClientRect();
    const width=resizeTableRenderer(this.renderer,this.camera,rect.width,rect.height,this.models.pixelBudget);
    const columns=width>=19?5:width>=9?3:2,rows=Math.ceil(COLORS.length/columns);
    const cellWidth=width/columns,cellHeight=TABLE_VIEW_HEIGHT/rows;
    const scale=this.layout==='overlap'?Math.min(1.8,width/6.5):Math.min(1.8,cellWidth*.37,cellHeight*.34);
    const labels:Label[]=[];
    this.gems.forEach((gem,index)=>{
      gem.scale.setScalar(scale);
      if(this.layout==='overlap'){
        gem.position.set((index-2)*scale*.62,((index%2)-.5)*scale*.55,(index-2)*.45);
      }else{
        const row=Math.floor(index/columns),inRow=Math.min(columns,COLORS.length-row*columns);
        const x=(index%columns-(inRow-1)/2)*cellWidth,y=((rows-1)/2-row)*cellHeight;
        gem.position.set(x,y,0);
        labels.push({color:COLORS[index],x:(.5+x/width)*100,y:(.5-(y-scale*1.16)/TABLE_VIEW_HEIGHT)*100});
      }
    });
    this.labels(labels);this.render();
  };

  private render(){
    if(this.lost)return;
    this.gems.forEach((gem,index)=>gem.rotation.set(this.pitch,this.yaw,(index-2)*.12));
    this.renderer.render(this.scene,this.camera);
  }

  private tick=(now:number)=>{
    this.frame=0;
    if(this.paused||this.dragging||this.lost||document.hidden)return;
    const elapsed=now-this.last;
    if(!this.last||elapsed>=1000/60-.25){
      this.yaw+=Math.min(elapsed/1000,.05)*.18;
      this.last=now;this.render();
    }
    this.frame=requestAnimationFrame(this.tick);
  };
  private wake=()=>{
    cancelAnimationFrame(this.frame);this.frame=0;this.last=0;
    if(!this.paused&&!this.dragging&&!this.lost&&!document.hidden)this.frame=requestAnimationFrame(this.tick);
  };
  private lose=(event:Event)=>{event.preventDefault();this.lost=true;this.wake();this.error('图形连接暂时中断，正在等待恢复。');};
  private restore=()=>{this.lost=false;this.resize();this.wake();this.error('');};

  dispose(){
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('webglcontextlost',this.lose);
    this.canvas.removeEventListener('webglcontextrestored',this.restore);
    document.removeEventListener('visibilitychange',this.wake);
    this.models.dispose();this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();
  }
}

function ColorControl({color,value,onChange}:{color:Color;value:string;onChange:(value:string)=>void}){
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  const invalid=normalizeHex(draft)===null;
  return <div className="color-control">
    <div className="color-heading"><label htmlFor={`picker-${color}`}>{GEM_NAMES[color]}</label>
      <button className="text-button" onClick={()=>{setDraft(CRYSTAL_BODY_COLORS[color]);onChange(CRYSTAL_BODY_COLORS[color]);}} aria-label={`恢复${GEM_NAMES[color]}默认颜色`}>还原</button></div>
    <div className="color-inputs">
      <input id={`picker-${color}`} type="color" value={value} onChange={event=>{setDraft(event.target.value);onChange(event.target.value);}}/>
      <input className="hex-input" aria-label={`${GEM_NAMES[color]} HEX 色值`} aria-invalid={invalid} aria-describedby={invalid?`error-${color}`:undefined}
        type="text" value={draft} maxLength={7} autoComplete="off" spellCheck={false}
        onChange={event=>{const text=event.target.value;setDraft(text);if(/^#?[\da-f]{6}$/i.test(text))onChange(normalizeHex(text)!);}}
        onBlur={()=>{const next=normalizeHex(draft);if(next){setDraft(next);onChange(next);}}}/>
    </div>
    {invalid&&<small className="field-error" id={`error-${color}`}>请输入 3 位或 6 位 HEX 色值。</small>}
  </div>;
}

function App(){
  const [colors,setColors]=useState<Palette>(readPalette);
  const [layout,setLayout]=useState<Layout>('separate');
  const [paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [labels,setLabels]=useState<Label[]>([]);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('颜色草稿自动保存在此浏览器。');
  const [showValues,setShowValues]=useState(false);
  const [resetVersion,setResetVersion]=useState(0);
  const canvas=useRef<HTMLCanvasElement>(null),preview=useRef<GemPreview|null>(null);
  const pointer=useRef<{id:number;x:number;y:number}|null>(null);
  const exported=JSON.stringify(colors,null,2);

  useEffect(()=>{
    const target=canvas.current!;
    let scene:GemPreview;
    try{scene=new GemPreview(target,setLabels,setError);preview.current=scene;}
    catch{setError('宝石预览无法启动，请启用浏览器的图形加速后刷新。');return;}
    const observer=new ResizeObserver(scene.resize);observer.observe(target);
    return()=>{observer.disconnect();scene.dispose();preview.current=null;};
  },[]);
  useEffect(()=>{
    preview.current?.setColors(colors);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(colors));}
    catch{setStatus('浏览器无法保存草稿，请复制色值留存。');}
  },[colors]);
  useEffect(()=>preview.current?.setLayout(layout),[layout]);
  useEffect(()=>preview.current?.setPaused(paused),[paused]);

  const releasePointer=()=>{pointer.current=null;preview.current?.setDragging(false);};
  const copy=async()=>{
    try{await navigator.clipboard.writeText(exported);setStatus('色值已复制，发给我即可应用到牌桌。');}
    catch{setShowValues(true);setStatus('请选中下方色值，按 Ctrl/Cmd + C 复制。');}
  };
  return <main className="color-studio">
    <section className="preview-panel" aria-label="宝石材质预览">
      <header className="studio-heading"><div><p className="eyebrow">璀璨宝石 · 材质预览</p><h1>宝石调色</h1></div><span className="shared-settings">牌桌原始渲染</span></header>
      <div className="preview-toolbar">
        <div className="view-toggle" role="group" aria-label="查看方式">
          <button aria-pressed={layout==='separate'} onClick={()=>setLayout('separate')}>逐颗查看</button>
          <button aria-pressed={layout==='overlap'} onClick={()=>setLayout('overlap')}>叠放查看</button>
        </div>
        <div className="motion-tools"><button onClick={()=>setPaused(!paused)}>{paused?'继续旋转':'暂停旋转'}</button><button onClick={()=>preview.current?.resetAngle()}>重置角度</button></div>
      </div>
      <div className="preview-stage">
        <canvas ref={canvas} tabIndex={0} aria-label="宝石预览，拖动或用方向键旋转"
          onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};preview.current?.setDragging(true);}}
          onPointerMove={event=>{const start=pointer.current;if(!start||start.id!==event.pointerId)return;preview.current?.rotate(event.clientX-start.x,event.clientY-start.y);pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};}}
          onPointerUp={event=>{if(pointer.current?.id===event.pointerId){event.currentTarget.releasePointerCapture(event.pointerId);releasePointer();}}}
          onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}
          onKeyDown={event=>{const delta:Record<string,[number,number]>={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};if(delta[event.key]){event.preventDefault();preview.current?.rotate(...delta[event.key]);}}}/>
        <div className="gem-labels" aria-hidden="true">{labels.map(label=><div key={label.color} style={{left:`${label.x}%`,top:`${label.y}%`}}><span>{GEM_NAMES[label.color]}</span><code>{colors[label.color]}</code></div>)}</div>
        {error&&<p className="preview-error" role="alert">{error}</p>}
      </div>
      <footer className="preview-caption"><span>拖动宝石，观察不同切面</span><span>相同材质、灯光、透明度与抗锯齿</span></footer>
    </section>
    <aside className="palette-panel" aria-label="宝石颜色设置">
      <div className="palette-heading"><h2>调整本色</h2><p>点击色块选色，也可以直接输入 HEX。</p></div>
      <div className="palette-controls">{COLORS.map(color=><ColorControl key={`${color}-${resetVersion}`} color={color} value={colors[color]} onChange={value=>{setColors(previous=>({...previous,[color]:value}));setStatus('颜色草稿自动保存在此浏览器。');}}/>)}</div>
      <div className="palette-actions"><button className="primary-button" onClick={copy}>复制全部色值</button><button onClick={()=>{setColors({...CRYSTAL_BODY_COLORS});setResetVersion(previous=>previous+1);setStatus('已恢复牌桌当前默认颜色。');}}>恢复全部默认</button></div>
      <p className="palette-status" role="status">{status}</p>
      <details open={showValues} onToggle={event=>setShowValues(event.currentTarget.open)}><summary>查看全部色值</summary><textarea aria-label="全部宝石色值" readOnly value={exported} onFocus={event=>event.currentTarget.select()}/></details>
      <p className="palette-note">调好后将色值发给我，即可应用到牌桌。</p>
    </aside>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
