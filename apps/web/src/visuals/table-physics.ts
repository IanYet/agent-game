import {Body, Box, GSSolver, SAPBroadphase, Vec3, World} from 'cannon-es';
import {
  ACESFilmicToneMapping, DirectionalLight, Fog, Group, HemisphereLight, OrthographicCamera,
  PMREMGenerator, Quaternion, Scene, WebGLRenderer,
} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {TableModels,type TableTheme} from './table-models';
import {FrameProfiler} from './frame-profiler';

type Piece={body:Body;mesh:Group;radius:number};
type PointerStroke={fromX:number;fromY:number;toX:number;toY:number;seconds:number};
const HEIGHT=11,DEPTH=3.2,STEP=1/60;
const ATTRACTOR_FROM_TOP=.2,ATTRACTOR_Y=HEIGHT*(.5-ATTRACTOR_FROM_TOP);

export class TablePhysics{
  private renderer:WebGLRenderer;
  private scene=new Scene();
  private camera=new OrthographicCamera(-10,10,HEIGHT/2,-HEIGHT/2,.1,60);
  private world=new World({gravity:new Vec3(0,0,0),allowSleep:true});
  private models:TableModels;
  private pieces:Piece[]=[];
  private walls:Body[]=[];
  private pointer={x:0,y:0,time:0};
  private pointerPath:PointerStroke[]=[];
  private pointerImpulse=new Vec3();
  private pointerContact=new Vec3();
  private pointerActive=false;
  private pointerHits=0;
  private width=20;
  private accumulator=0;
  private orientation=new Quaternion();
  private profiler:FrameProfiler|undefined;
  private environment;

  constructor(private canvas:HTMLCanvasElement,theme:TableTheme){
    // Retain the displayed GPU buffer for the lens's small, cropped sample.
    this.renderer=new WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
    const context=this.renderer.getContext();
    if(import.meta.env.DEV&&'beginQuery' in context)this.profiler=new FrameProfiler(canvas,context);
    try{
      this.world.doProfiling=import.meta.env.DEV;
      this.renderer.setClearColor('#090b11',1);this.renderer.toneMapping=ACESFilmicToneMapping;this.renderer.toneMappingExposure=.9;
      this.camera.position.z=18;this.scene.fog=new Fog('#090b11',10,23);
      this.environment=this.lightEnvironment();this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.6;
      this.scene.add(new HemisphereLight('#d8e5ff','#262032',1.6));
      const key=new DirectionalLight('#ffdec5',2.8);key.position.set(-4,6,8);this.scene.add(key);
      const rim=new DirectionalLight('#9ab8ff',1.8);rim.position.set(5,-3,5);this.scene.add(rim);
      const solver=new GSSolver();solver.iterations=8;solver.tolerance=.001;this.world.solver=solver;
      this.world.broadphase=new SAPBroadphase(this.world);
      this.world.defaultContactMaterial.friction=.12;this.world.defaultContactMaterial.restitution=.35;
      this.world.defaultContactMaterial.contactEquationStiffness=1e6;
      this.models=new TableModels(theme);
      const count=matchMedia('(max-width: 700px)').matches?12:20;
      for(let i=0;i<count;i++){
        const scale=1.45+(i*7%11)/20,{mesh,colliders}=this.models.create(i,scale);
        const phase=i*2.399963;
        const body=new Body({mass:1,linearDamping:.45,angularDamping:.55,sleepSpeedLimit:.025,sleepTimeLimit:1.5});
        colliders.forEach(({shape,offset})=>body.addShape(shape,offset));
        body.quaternion.setFromEuler(theme==='holdem'?1.15+Math.sin(i)*.5:Math.sin(i)*.5,Math.cos(i*2)*.6,phase);
        body.velocity.set(Math.sin(phase)*.03,Math.cos(phase)*.03,0);
        body.angularVelocity.set(Math.sin(i)*.06,Math.cos(i)*.07,.04);
        this.pieces.push({body,mesh,radius:scale*(theme==='holdem'?.77:1)});
        this.world.addBody(body);this.scene.add(mesh);
      }
      this.resize(true);
    }catch(error){this.dispose();throw error;}
  }

  private lightEnvironment(){
    const room=new RoomEnvironment(),pmrem=new PMREMGenerator(this.renderer);
    try{return pmrem.fromScene(room,.04);}finally{room.dispose();pmrem.dispose();}
  }

  restore(){
    this.profiler?.resetGpu();
    this.environment.dispose();this.environment=this.lightEnvironment();this.scene.environment=this.environment.texture;
    this.resize();
  }

  resize(initial=false){
    const rect=this.canvas.getBoundingClientRect(),previousWidth=this.width;
    this.width=HEIGHT*rect.width/Math.max(1,rect.height);
    this.camera.left=-this.width/2;this.camera.right=this.width/2;this.camera.updateProjectionMatrix();
    const ratio=Math.min(devicePixelRatio||1,1.25,Math.sqrt(1.25e6/Math.max(1,rect.width*rect.height)));
    this.renderer.setPixelRatio(ratio);this.renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
    this.walls.forEach(wall=>this.world.removeBody(wall));this.walls=[];
    const wall=(size:Vec3,position:Vec3)=>{
      const body=new Body({shape:new Box(size),position});this.world.addBody(body);this.walls.push(body);
    };
    wall(new Vec3(1,HEIGHT,DEPTH+2),new Vec3(-this.width/2-1,0,0));
    wall(new Vec3(1,HEIGHT,DEPTH+2),new Vec3(this.width/2+1,0,0));
    wall(new Vec3(this.width,1,DEPTH+2),new Vec3(0,-HEIGHT/2-1,0));
    wall(new Vec3(this.width,1,DEPTH+2),new Vec3(0,HEIGHT/2+1,0));
    wall(new Vec3(this.width,HEIGHT,1),new Vec3(0,0,-DEPTH-1));
    wall(new Vec3(this.width,HEIGHT,1),new Vec3(0,0,DEPTH+1));
    const columns=Math.max(2,Math.ceil(Math.sqrt(this.pieces.length*this.width/HEIGHT)));
    const rows=Math.ceil(this.pieces.length/columns);
    this.pieces.forEach(({body,radius},i)=>{
      if(initial){
        const x=((i%columns+.5)/columns-.5)*this.width+Math.sin(i*2.4)*.25;
        const y=((Math.floor(i/columns)+.5)/rows-.5)*HEIGHT+Math.cos(i*2.4)*.25;
        body.position.set(x,y,Math.sin(i*2.4)*1.3);
      }else body.position.x*=this.width/previousWidth;
      const edgeX=Math.max(.1,this.width/2-radius),edgeY=Math.max(.1,HEIGHT/2-radius);
      body.position.x=Math.max(-edgeX,Math.min(edgeX,body.position.x));
      body.position.y=Math.max(-edgeY,Math.min(edgeY,body.position.y));
      body.previousPosition.copy(body.position);body.previousQuaternion.copy(body.quaternion);
      body.aabbNeedsUpdate=true;body.wakeUp();
    });
    this.clearPointer(true);this.render();
  }

  movePointer(samples:readonly Pick<PointerEvent,'clientX'|'clientY'|'timeStamp'>[]){
    const rect=this.canvas.getBoundingClientRect();
    for(const sample of samples){
      if(this.pointerActive&&sample.timeStamp<this.pointer.time)continue;
      const x=((sample.clientX-rect.left)/rect.width-.5)*this.width,y=(.5-(sample.clientY-rect.top)/rect.height)*HEIGHT;
      const fromX=this.pointerActive?this.pointer.x:x,fromY=this.pointerActive?this.pointer.y:y;
      if(!this.pointerActive||Math.hypot(x-fromX,y-fromY)>.001){
        const seconds=Math.min(.05,Math.max(.001,(sample.timeStamp-this.pointer.time)/1000));
        // Keep complete sweeps even when input arrives faster than physics.
        // Only the oldest neighbouring segments are merged if the queue fills.
        if(this.pointerPath.length===64){
          const oldest=this.pointerPath.shift()!;this.pointerPath[0].fromX=oldest.fromX;this.pointerPath[0].fromY=oldest.fromY;this.pointerPath[0].seconds+=oldest.seconds;
        }
        this.pointerPath.push({fromX,fromY,toX:x,toY:y,seconds});
      }
      this.pointer={x,y,time:sample.timeStamp};this.pointerActive=true;
    }
    this.pieces.forEach(({body})=>body.wakeUp());
    if(import.meta.env.DEV)this.canvas.dataset.pointerActive=String(this.pointerActive);
  }

  clearPointer(discardPath=false){
    this.pointerActive=false;if(discardPath)this.pointerPath.length=0;
    if(import.meta.env.DEV)this.canvas.dataset.pointerActive='false';
  }
  get moving(){return this.pieces.some(({body})=>body.sleepState!==Body.SLEEPING);}

  private pushPointer(){
    if(!this.pointerActive&&!this.pointerPath.length)return;
    const depths:number[]=[];
    for(let i=0;i<this.pieces.length;i++){
      const {body,radius}=this.pieces[i],reach=radius+.5;
      let strength=0,pushX=0,pushY=0,normalX=0,normalY=0;
      for(const stroke of this.pointerPath){
        const dx=stroke.toX-stroke.fromX,dy=stroke.toY-stroke.fromY,lengthSq=dx*dx+dy*dy;
        const t=lengthSq?Math.max(0,Math.min(1,((body.position.x-stroke.fromX)*dx+(body.position.y-stroke.fromY)*dy)/lengthSq)):0;
        const x=body.position.x-stroke.fromX-dx*t,y=body.position.y-stroke.fromY-dy*t,distanceSq=x*x+y*y;
        if(distanceSq>=reach*reach)continue;
        const length=Math.sqrt(lengthSq),distance=Math.sqrt(distanceSq);
        const falloff=1-distanceSq/(reach*reach),impulse=falloff*Math.min(3.2,.25+length/stroke.seconds*.22);
        if(impulse<=strength)continue;
        const directionX=length?dx/length:Math.cos(i*2.4),directionY=length?dy/length:Math.sin(i*2.4);
        normalX=distance>.001?x/distance:directionX;normalY=distance>.001?y/distance:directionY;
        pushX=normalX*.75+directionX*.6;pushY=normalY*.75+directionY*.6;strength=impulse;
      }
      if(strength){
        const length=Math.hypot(pushX,pushY);
        const impulse=Math.max(0,strength-(body.velocity.x*pushX+body.velocity.y*pushY)/length);
        if(impulse>.001){
          this.pointerImpulse.set(pushX/length*impulse,pushY/length*impulse,0);
          this.pointerContact.set(-normalX*radius*.65,-normalY*radius*.65,radius*.25);
          body.applyImpulse(this.pointerImpulse,this.pointerContact);
          if(import.meta.env.DEV){this.pointerHits++;depths.push(body.position.z);}
        }
      }
      // A stationary cursor still occupies space in every visible depth layer.
      const dx=body.position.x-this.pointer.x,dy=body.position.y-this.pointer.y,distance=Math.hypot(dx,dy);
      if(this.pointerActive&&distance<reach){
        const x=distance>.001?dx/distance:Math.cos(i*2.4),y=distance>.001?dy/distance:Math.sin(i*2.4);
        const force=(reach-distance)*1.4;body.force.x+=x*force;body.force.y+=y*force;body.wakeUp();
      }
    }
    this.pointerPath.length=0;
    if(import.meta.env.DEV){
      this.canvas.dataset.pointerHits=String(this.pointerHits);
      if(depths.length)this.canvas.dataset.pointerHitDepths=depths.map(z=>z.toFixed(2)).join(',');
    }
  }

  step(elapsed:number){
    const started=performance.now();
    this.profiler?.record('frameInterval',elapsed*1000);
    let forceMs=0,pointerMs=0;
    const physics={broadphase:0,narrowphase:0,makeContactConstraints:0,solve:0,integrate:0};
    this.accumulator+=Math.min(elapsed,.05);
    while(this.accumulator>=STEP){
      const forceStarted=performance.now();
      // Return toward the upper part of the viewport, above the player controls.
      // The vertical pull grows with displacement and fades near the attractor.
      for(const {body} of this.pieces)body.force.set(-body.position.x*.012,(ATTRACTOR_Y-body.position.y)*.055,-body.position.z*.025);
      for(let i=0;i<this.pieces.length;i++)for(let j=i+1;j<this.pieces.length;j++){
        const a=this.pieces[i].body,b=this.pieces[j].body;
        const dx=b.position.x-a.position.x,dy=b.position.y-a.position.y,dz=b.position.z-a.position.z;
        const distanceSq=dx*dx+dy*dy+dz*dz,gravity=.28/((distanceSq+3)*Math.sqrt(distanceSq+.1));
        const x=dx*gravity,y=dy*gravity,z=dz*gravity;
        a.force.x+=x;a.force.y+=y;a.force.z+=z;b.force.x-=x;b.force.y-=y;b.force.z-=z;
      }
      const pointerStarted=performance.now();forceMs+=pointerStarted-forceStarted;
      this.pushPointer();pointerMs+=performance.now()-pointerStarted;
      const limitsStarted=performance.now();
      for(const {body} of this.pieces){
        const speed=body.velocity.length();if(speed>4)body.velocity.scale(4/speed,body.velocity);
        const spin=body.angularVelocity.length();if(spin>1.5)body.angularVelocity.scale(1.5/spin,body.angularVelocity);
      }
      forceMs+=performance.now()-limitsStarted;
      this.world.step(STEP);this.accumulator-=STEP;
      if(this.profiler)for(const stage of Object.keys(physics) as Array<keyof typeof physics>)physics[stage]+=this.world.profile[stage];
    }
    if(import.meta.env.DEV)this.canvas.dataset.physicsMs=(performance.now()-started).toFixed(2);
    this.profiler?.record('forces',forceMs);this.profiler?.record('pointer',pointerMs);this.profiler?.record('physicsTotal',performance.now()-started);
    if(this.profiler)for(const [stage,ms] of Object.entries(physics))this.profiler.record('physics.'+stage,ms);
    this.render(this.accumulator/STEP);
    this.profiler?.record('frameCpu',performance.now()-started);this.profiler?.publish();
  }

  private render(alpha=1){
    const started=performance.now();
    for(const {body,mesh} of this.pieces){
      mesh.position.lerpVectors(body.previousPosition,body.position,alpha);
      mesh.quaternion.copy(body.previousQuaternion).slerp(this.orientation.copy(body.quaternion),alpha);
    }
    this.profiler?.record('transformSync',performance.now()-started);
    this.profiler?.beginGpu();
    const submitStarted=performance.now();
    this.renderer.render(this.scene,this.camera);
    this.profiler?.endGpu();this.profiler?.record('renderSubmit',performance.now()-submitStarted);
    if(import.meta.env.DEV){
      this.canvas.dataset.renderMs=(performance.now()-started).toFixed(2);
      this.canvas.dataset.colliders=String(this.pieces.reduce((sum,p)=>sum+p.body.shapes.length,0));
      this.canvas.dataset.spread=(this.pieces.reduce((sum,p)=>sum+Math.hypot(p.body.position.x,p.body.position.y),0)/this.pieces.length).toFixed(2);
      this.canvas.dataset.attractorY=String(ATTRACTOR_FROM_TOP);
      this.canvas.dataset.centerY=(.5-this.pieces.reduce((sum,p)=>sum+p.body.position.y,0)/this.pieces.length/HEIGHT).toFixed(3);
    }
    const notifyStarted=performance.now();window.dispatchEvent(new Event('tongzhuo:visual-frame'));
    this.profiler?.record('lensNotify',performance.now()-notifyStarted);
  }

  get source(){return this.renderer.domElement;}

  dispose(){
    this.clearPointer(true);this.world.bodies.slice().forEach(body=>this.world.removeBody(body));
    this.models?.dispose();this.environment?.dispose();this.scene.clear();this.profiler?.dispose();this.renderer.dispose();this.renderer.forceContextLoss();
    this.pieces=[];this.walls=[];
  }
}
