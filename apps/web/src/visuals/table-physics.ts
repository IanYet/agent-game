import {Body, Box, GSSolver, SAPBroadphase, Sphere, Vec3, World} from 'cannon-es';
import {
  ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight, OrthographicCamera,
  PMREMGenerator, Scene, WebGLRenderer,
} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {TableModels,type TableTheme} from './table-models';

type Piece={body:Body;mesh:Group;phase:number;anchor:Vec3};
const HEIGHT=11,DEPTH=2.2,STEP=1/60;

export class TablePhysics{
  private renderer:WebGLRenderer;
  private scene=new Scene();
  private camera=new OrthographicCamera(-10,10,HEIGHT/2,-HEIGHT/2,.1,60);
  private world=new World({gravity:new Vec3(0,0,0),allowSleep:false});
  private models:TableModels;
  private pieces:Piece[]=[];
  private walls:Body[]=[];
  private pointer=new Body({type:Body.KINEMATIC,shape:new Sphere(.95),position:new Vec3(0,0,100),collisionFilterMask:0});
  private pointerTarget=new Vec3();
  private pointerActive=false;
  private width=20;
  private accumulator=0;
  private time=0;
  private environment;

  constructor(private canvas:HTMLCanvasElement,theme:TableTheme){
    this.renderer=new WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    try{
    this.renderer.setClearColor(0,0);this.renderer.toneMapping=ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.camera.position.z=18;
    this.environment=this.lightEnvironment();this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;
    this.scene.add(new HemisphereLight('#d8e5ff','#262032',2.2));
    const key=new DirectionalLight('#ffdec5',3.5);key.position.set(-4,6,8);this.scene.add(key);
    const rim=new DirectionalLight('#9ab8ff',2.5);rim.position.set(5,-3,5);this.scene.add(rim);
    const solver=new GSSolver();solver.iterations=12;solver.tolerance=.001;this.world.solver=solver;
    this.world.broadphase=new SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction=.12;this.world.defaultContactMaterial.restitution=.68;
    this.world.defaultContactMaterial.contactEquationStiffness=1e6;
    this.world.addBody(this.pointer);
    this.models=new TableModels(theme);
    const count=matchMedia('(max-width: 700px)').matches?16:28;
    for(let i=0;i<count;i++){
      const scale=.72+(i*7%11)/25,{mesh,colliders}=this.models.create(i,scale);
      const phase=i*2.399963,anchor=new Vec3();
      const body=new Body({mass:1,linearDamping:.2,angularDamping:.35});
      colliders.forEach(({shape,offset})=>body.addShape(shape,offset));
      body.quaternion.setFromEuler(theme==='holdem'?1.15+Math.sin(i)*.5:Math.sin(i)*.5,Math.cos(i*2)*.6,phase);
      body.velocity.set(Math.sin(phase)*.3,Math.cos(phase)*.3,0);
      body.angularVelocity.set(Math.sin(i)*.16,Math.cos(i)*.19,.12);
      this.pieces.push({body,mesh,phase,anchor});this.world.addBody(body);this.scene.add(mesh);
    }
    this.resize(true);
    }catch(error){this.dispose();throw error;}
  }

  private lightEnvironment(){
    const room=new RoomEnvironment(),pmrem=new PMREMGenerator(this.renderer);
    try{return pmrem.fromScene(room,.04);}finally{room.dispose();pmrem.dispose();}
  }

  restore(){
    this.environment.dispose();this.environment=this.lightEnvironment();this.scene.environment=this.environment.texture;
    this.resize();
  }

  resize(initial=false){
    const rect=this.canvas.getBoundingClientRect();
    this.width=HEIGHT*rect.width/Math.max(1,rect.height);
    this.camera.left=-this.width/2;this.camera.right=this.width/2;this.camera.updateProjectionMatrix();
    const ratio=Math.min(devicePixelRatio||1,1.5,Math.sqrt(2e6/Math.max(1,rect.width*rect.height)));
    this.renderer.setPixelRatio(ratio);this.renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
    this.canvas.width=this.renderer.domElement.width;this.canvas.height=this.renderer.domElement.height;
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
    this.pieces.forEach((piece,i)=>{
      const x=((i%columns+.5)/columns-.5)*this.width+Math.sin(piece.phase)*.35;
      const y=((Math.floor(i/columns)+.5)/rows-.5)*HEIGHT+Math.cos(piece.phase)*.3;
      piece.anchor.set(x,y,Math.sin(piece.phase)*.8);
      if(initial)piece.body.position.copy(piece.anchor);
      else{
        piece.body.position.x=Math.max(-this.width/2+.7,Math.min(this.width/2-.7,piece.body.position.x));
        piece.body.position.y=Math.max(-HEIGHT/2+.7,Math.min(HEIGHT/2-.7,piece.body.position.y));
        piece.body.aabbNeedsUpdate=true;
      }
    });
    this.clearPointer();this.render();
  }

  movePointer(x:number,y:number){
    const rect=this.canvas.getBoundingClientRect();
    this.pointerTarget.set(((x-rect.left)/rect.width-.5)*this.width,(.5-(y-rect.top)/rect.height)*HEIGHT,.6);
    if(!this.pointerActive){this.pointer.position.copy(this.pointerTarget);this.pointer.velocity.setZero();this.pointer.aabbNeedsUpdate=true;}
    this.pointerActive=true;this.pointer.collisionFilterMask=-1;
  }

  clearPointer(){this.pointerActive=false;this.pointer.collisionFilterMask=0;this.pointer.velocity.setZero();}

  step(elapsed:number){
    this.accumulator+=Math.min(elapsed,.08);
    while(this.accumulator>=STEP){
      this.time+=STEP;
      if(this.pointerActive){
        this.pointerTarget.vsub(this.pointer.position,this.pointer.velocity);this.pointer.velocity.scale(1/STEP,this.pointer.velocity);
        const speed=this.pointer.velocity.length();if(speed>18)this.pointer.velocity.scale(18/speed,this.pointer.velocity);
      }
      for(const {body,anchor,phase} of this.pieces){
        // Slow drift supplies motion; contact separation and pointer impulses
        // are resolved by the rigid-body solver.
        body.force.set(
          (anchor.x+Math.sin(this.time*.32+phase)*1.35-body.position.x)*.16,
          (anchor.y+Math.cos(this.time*.27+phase)*.95-body.position.y)*.16,
          (anchor.z+Math.sin(this.time*.24+phase)*.45-body.position.z)*.28,
        );
        body.torque.set(Math.sin(this.time*.3+phase)*.007,Math.cos(phase)*.009,.006);
        const speed=body.velocity.length();if(speed>3)body.velocity.scale(3/speed,body.velocity);
        const spin=body.angularVelocity.length();if(spin>2)body.angularVelocity.scale(2/spin,body.angularVelocity);
      }
      this.world.step(STEP);this.accumulator-=STEP;
    }
    this.render();
  }

  render(){
    for(const {body,mesh} of this.pieces){mesh.position.copy(body.position);mesh.quaternion.copy(body.quaternion);}
    this.renderer.render(this.scene,this.camera);
    // Composite the complete background here, including its vignette. The lens
    // can then sample exactly the same frame without reconstructing CSS layers.
    const context=this.canvas.getContext('2d')!;
    const {width,height}=this.canvas;
    context.globalAlpha=1;context.fillStyle='#090b11';context.fillRect(0,0,width,height);
    const glow=context.createRadialGradient(width*.6,height*.35,0,width*.6,height*.35,width*.7);
    glow.addColorStop(0,'#202735');glow.addColorStop(1,'#090b11');context.fillStyle=glow;context.fillRect(0,0,width,height);
    context.globalAlpha=.62;context.drawImage(this.renderer.domElement,0,0);context.globalAlpha=1;
    const veil=context.createLinearGradient(0,0,0,height);
    veil.addColorStop(0,'#090b1180');veil.addColorStop(.22,'#090b1100');veil.addColorStop(.65,'#090b1100');veil.addColorStop(1,'#090b1180');
    context.fillStyle=veil;context.fillRect(0,0,width,height);
    window.dispatchEvent(new Event('tongzhuo:visual-frame'));
  }

  get source(){return this.renderer.domElement;}

  dispose(){
    this.clearPointer();this.world.bodies.slice().forEach(body=>this.world.removeBody(body));
    this.models?.dispose();this.environment?.dispose();this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();
    this.pieces=[];this.walls=[];
  }
}
