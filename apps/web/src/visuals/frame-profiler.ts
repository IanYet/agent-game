type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
type Samples={values:Float64Array;count:number;cursor:number};

// Development-only instrumentation. Bounded samples, asynchronous GPU queries,
// and one DOM publication per second keep profiling out of the frame workload.
export class FrameProfiler{
  private samples=new Map<string,Samples>();
  private extension:TimerExtension|null=null;
  private pending:WebGLQuery[]=[];
  private current:WebGLQuery|null=null;
  private published=0;

  constructor(private target:HTMLCanvasElement,private gl:WebGL2RenderingContext){this.resetGpu();}

  record(stage:string,ms:number){
    if(!Number.isFinite(ms))return;
    let samples=this.samples.get(stage);
    if(!samples){samples={values:new Float64Array(360),count:0,cursor:0};this.samples.set(stage,samples);}
    samples.values[samples.cursor]=ms;samples.cursor=(samples.cursor+1)%360;samples.count=Math.min(360,samples.count+1);
  }

  beginGpu(){
    const gl=this.gl,ext=this.extension;if(!ext||gl.isContextLost())return;
    const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    while(this.pending.length){
      const query=this.pending[0];
      if(!disjoint&&!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))break;
      if(!disjoint)this.record('gpu',Number(gl.getQueryParameter(query,gl.QUERY_RESULT))/1e6);
      gl.deleteQuery(query);this.pending.shift();
    }
    if(this.pending.length>=6||this.current)return;
    this.current=gl.createQuery();if(this.current)gl.beginQuery(ext.TIME_ELAPSED_EXT,this.current);
  }

  endGpu(){
    if(!this.current||!this.extension)return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push(this.current);this.current=null;
  }

  publish(){
    const now=performance.now();if(now-this.published<1000)return;this.published=now;
    const timings:Record<string,{samples:number;avg:number;p95:number;max:number}>={};
    const round=(n:number)=>Math.round(n*1000)/1000;
    for(const [stage,samples] of this.samples){
      const values=Array.from(samples.values.subarray(0,samples.count)).sort((a,b)=>a-b);
      timings[stage]={samples:values.length,avg:round(values.reduce((sum,n)=>sum+n,0)/values.length),p95:round(values[Math.ceil(values.length*.95)-1]),max:round(values.at(-1)!)};
    }
    this.target.dataset.profile=JSON.stringify({unit:'ms',window:'last 360 samples',gpuTimer:this.extension?'available':'unavailable',width:this.target.width,height:this.target.height,timings});
  }

  resetGpu(){
    this.dispose();this.extension=this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension|null;
  }

  dispose(){
    if(!this.gl.isContextLost()){
      if(this.current&&this.extension)this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      for(const query of [...this.pending,...(this.current?[this.current]:[])])this.gl.deleteQuery(query);
    }
    this.pending=[];this.current=null;
  }
}
