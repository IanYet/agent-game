import {VERT,FRAG} from './vendor/strands-shaders';

export type StrandsState={active:boolean;connecting:boolean;muted:boolean;reduced:boolean};
type Entry={canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;state:StrandsState;visible:boolean;dirty:boolean;activity:number;brightness:number;clock:number;frames:number};
const palette=new Float32Array(['d95b56','ba5046','ffa24c','ffe0b3','93f1ff','3569fa','193d9b','193d9b'].flatMap(hex=>{const n=parseInt(hex,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}));
let shared:StrandsRenderer|undefined;

// One GPU context serves every player, including nine-player tables. Each DOM
// canvas retains its own frame, which the mouse lens can sample without a readback.
class StrandsRenderer{
  private source=document.createElement('canvas');
  private gl=this.source.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false});
  private program:WebGLProgram|null=null;
  private buffer:WebGLBuffer|null=null;
  private uniforms:Record<string,WebGLUniformLocation|null>={};
  private entries=new Map<HTMLCanvasElement,Entry>();
  private raf=0;
  private last=0;
  private lost=false;
  private intersection=new IntersectionObserver(changes=>{for(const change of changes){const entry=this.entries.get(change.target as HTMLCanvasElement);if(entry){entry.visible=change.isIntersecting;entry.dirty=true;}}this.wake();});
  private resize=new ResizeObserver(changes=>{for(const change of changes){const entry=this.entries.get(change.target as HTMLCanvasElement);if(entry)entry.dirty=true;}this.wake();});
  private inert=new MutationObserver(()=>this.wake());

  constructor(){
    this.setup();
    this.source.addEventListener('webglcontextlost',this.onLost);
    this.source.addEventListener('webglcontextrestored',this.onRestored);
    document.addEventListener('visibilitychange',this.wake);
    this.inert.observe(document.body,{subtree:true,attributes:true,attributeFilter:['inert']});
  }
  private setup(){
    const gl=this.gl;if(!gl)return;
    const shaders:[number,string][]=[[gl.VERTEX_SHADER,VERT],[gl.FRAGMENT_SHADER,FRAG]],program=gl.createProgram()!;
    for(const [kind,source] of shaders){
      const shader=gl.createShader(kind)!;gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);gl.deleteProgram(program);return;}
      gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    gl.bindAttribLocation(program,0,'position');gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);return;}
    this.program=program;this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.useProgram(program);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);
    const names=['uResolution','uMotion','uLevel','uColors','uCount','uAmplitude','uWaviness','uThickness','uGlow','uTaper','uSpread','uHueShift','uIntensity','uSaturation','uScale','uGlass','uRadius','uRefraction','uDispersion','uRim','uLean','uIntro','uPulse','uLight','uOpacity'];
    this.uniforms=Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,name)]));
  }
  private onLost=(event:Event)=>{event.preventDefault();this.lost=true;for(const entry of this.entries.values())entry.dirty=true;this.wake();};
  private onRestored=()=>{this.lost=false;this.setup();for(const entry of this.entries.values())entry.dirty=true;this.wake();};
  private wake=()=>{if(!this.raf&&!document.hidden){this.last=0;this.raf=requestAnimationFrame(this.tick);}};
  private schedule(){if(!this.raf&&!document.hidden)this.raf=requestAnimationFrame(this.tick);}
  private tick=(now:number)=>{
    this.raf=0;if(document.hidden)return;
    if(this.last&&now-this.last<33){this.schedule();return;}
    const dt=this.last?Math.min((now-this.last)/1000,.08):1/30;this.last=now;
    let running=false,painted=false;
    for(const entry of this.entries.values()){
      if(!entry.visible||entry.canvas.closest('[inert]'))continue;
      const {state}=entry,busy=!state.muted&&(state.active||state.connecting);
      const previousActivity=entry.activity,previousBrightness=entry.brightness;
      const target=state.muted?0:state.active?(state.reduced?.8:.77+.13*Math.sin(entry.clock*2.1)+.08*Math.sin(entry.clock*4.7)):state.connecting?.28:0;
      const brightness=state.muted?.12:busy?1.1:.58;
      const ease=(a:number,b:number,rate:number)=>state.reduced||Math.abs(a-b)<.001?b:a+(b-a)*(1-Math.exp(-dt*rate));
      entry.activity=ease(entry.activity,target,target>entry.activity?5:3);
      entry.brightness=ease(entry.brightness,brightness,5);
      const moving=!state.reduced&&(busy||Math.abs(entry.activity-target)>.001||Math.abs(entry.brightness-brightness)>.001);
      if(moving)entry.clock+=dt*(.65+entry.activity*2.2);
      if(entry.dirty||moving||previousActivity!==entry.activity||previousBrightness!==entry.brightness){this.draw(entry);entry.dirty=false;painted=true;}
      running=running||moving;
    }
    if(painted)window.dispatchEvent(new Event('tongzhuo:visual-frame'));
    if(running)this.schedule();
  };
  private draw(entry:Entry){
    const {canvas,ctx,activity,brightness,clock}=entry,dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(canvas.clientWidth*dpr)),height=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.clearRect(0,0,width,height);
    const gl=this.gl;
    if(gl&&this.program&&!this.lost){
      if(this.source.width!==width||this.source.height!==height){this.source.width=width;this.source.height=height;}
      const u=this.uniforms,sway=.75+.65*activity;gl.viewport(0,0,width,height);gl.useProgram(this.program);
      gl.uniform2f(u.uResolution,width,height);
      gl.uniform3f(u.uMotion,(.45*Math.sin(.85*clock)+.18*Math.sin(1.37*clock+1.3))*sway,1+(.13*Math.sin(1.1*clock)+.07*Math.sin(1.8*clock+.4))*sway,.12*Math.sin(.53*clock+2)*sway);
      gl.uniform1f(u.uLevel,activity);gl.uniform3fv(u.uColors,palette);gl.uniform1i(u.uCount,3);
      const values:Record<string,number>={uAmplitude:1,uWaviness:1,uThickness:1.08,uGlow:1.1,uTaper:1,uSpread:1,uHueShift:0,uIntensity:brightness,uSaturation:1,uScale:1,uGlass:1,uRadius:.45,uRefraction:1,uDispersion:1,uRim:brightness,uIntro:1,uPulse:0,uLight:0,uOpacity:1};
      for(const [name,value] of Object.entries(values))gl.uniform1f(u[name],value);
      gl.uniform2f(u.uLean,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);ctx.drawImage(this.source,0,0);
      canvas.dataset.strandsRenderer='webgl';
    }else{
      // Keep the same resting line / expanded waves and readable state without WebGL.
      const radius=Math.min(width,height)*.45;ctx.save();ctx.translate(width/2,height/2);
      ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.strokeStyle=`rgba(210,222,244,${.18*brightness})`;ctx.lineWidth=dpr;ctx.stroke();ctx.clip();
      const light=ctx.createLinearGradient(-radius,0,radius,0);light.addColorStop(0,'#f1c5a5');light.addColorStop(.5,'#e9ecf2');light.addColorStop(1,'#7cacf6');ctx.strokeStyle=light;ctx.globalAlpha=Math.min(1,brightness);ctx.lineWidth=1.5*dpr;
      for(let line=0;line<3;line++){ctx.beginPath();for(let i=0;i<=40;i++){const x=(i/20-1)*radius,y=Math.sin(i/9+clock+line*.7)*radius*.38*activity+radius*.12;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.restore();canvas.dataset.strandsRenderer='canvas';
    }
    if(import.meta.env.DEV){canvas.dataset.strandsFrame=String(++entry.frames);canvas.dataset.strandsEnergy=activity.toFixed(3);}
  }
  attach(canvas:HTMLCanvasElement,state:StrandsState){
    const entry:Entry={canvas,ctx:canvas.getContext('2d')!,state,visible:false,dirty:true,activity:0,brightness:state.muted?.12:.58,clock:0,frames:0};
    this.entries.set(canvas,entry);this.intersection.observe(canvas);this.resize.observe(canvas);this.wake();
    return {update:(next:StrandsState)=>{entry.state=next;entry.dirty=true;this.wake();},dispose:()=>{
      this.intersection.unobserve(canvas);this.resize.unobserve(canvas);this.entries.delete(canvas);
      if(!this.entries.size){this.dispose();if(shared===this)shared=undefined;}
    }};
  }
  private dispose(){
    cancelAnimationFrame(this.raf);this.intersection.disconnect();this.resize.disconnect();this.inert.disconnect();document.removeEventListener('visibilitychange',this.wake);
    this.source.removeEventListener('webglcontextlost',this.onLost);this.source.removeEventListener('webglcontextrestored',this.onRestored);
    if(this.program)this.gl?.deleteProgram(this.program);if(this.buffer)this.gl?.deleteBuffer(this.buffer);this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export function attachStrands(canvas:HTMLCanvasElement,state:StrandsState){shared??=new StrandsRenderer();return shared.attach(canvas,state);}
