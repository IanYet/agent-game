import {BoxGeometry,BufferGeometry,ExtrudeGeometry,Group,LatheGeometry,Mesh,MeshMatcapMaterial,Shape,SphereGeometry,TorusGeometry,Vector2} from 'three';
import {CHESS_COLORS} from '../../visuals/table-palette';

type Part={geometry:BufferGeometry;position:[number,number,number];rotation?:[number,number,number]};
// Shared geometry, separate rigid bodies: king, queen, rook, bishop, knight and pawn.
export class ChessTableModels{
  private geometries:BufferGeometry[]=[];
  private materials=[
    new MeshMatcapMaterial({color:CHESS_COLORS[0]}),
    new MeshMatcapMaterial({color:CHESS_COLORS[1]}),
  ];
  private parts:Part[][]=[];
  constructor(){
    const lathe=(profile:number[][])=>this.keep(new LatheGeometry(profile.map(([r,y])=>new Vector2(r,y)),40));
    const sphere=(r:number)=>this.keep(new SphereGeometry(r,24,16));
    const box=(x:number,y:number,z:number)=>this.keep(new BoxGeometry(x,y,z));
    const torus=(r:number,t:number)=>this.keep(new TorusGeometry(r,t,8,36));
    const base=lathe([[0,-.94],[.44,-.94],[.53,-.88],[.53,-.78],[.46,-.73],[.43,-.69],[.42,-.6],[.32,-.54],[.25,-.4],[.2,-.16],[.18,.05],[.22,.16],[.35,.22],[.35,.3],[.28,.35],[0,.35]]);
    const ring=torus(.3,.055);
    const common:Part[]=[{geometry:base,position:[0,0,0]},{geometry:ring,position:[0,.31,0],rotation:[Math.PI/2,0,0]}];
    const king=[...common,{geometry:sphere(.23),position:[0,.49,0] as [number,number,number]},{geometry:box(.13,.5,.13),position:[0,.88,0] as [number,number,number]},{geometry:box(.4,.12,.13),position:[0,.95,0] as [number,number,number]}];
    const crown=lathe([[0,.35],[.23,.35],[.3,.44],[.29,.58],[.38,.81],[.28,.76],[.2,.54],[0,.54]]);
    const queen:Part[]=[...common,{geometry:crown,position:[0,0,0]}];
    const jewel=sphere(.065);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;queen.push({geometry:jewel,position:[Math.cos(a)*.335,.79,Math.sin(a)*.335]});}
    queen.push({geometry:sphere(.105),position:[0,.87,0]});
    const battlement=box(.17,.22,.17),rook:Part[]=[...common,{geometry:lathe([[0,.3],[.3,.3],[.39,.38],[.39,.66],[.3,.7],[0,.7]]),position:[0,0,0]}];
    for(let i=0;i<4;i++){const a=i*Math.PI/2;rook.push({geometry:battlement,position:[Math.cos(a)*.3,.77,Math.sin(a)*.3],rotation:[0,-a,0]});}
    const mitre=new Shape();mitre.moveTo(-.25,.37);mitre.bezierCurveTo(-.48,.58,-.16,.82,0,1.01);mitre.bezierCurveTo(.06,.93,.13,.85,.19,.77);mitre.lineTo(-.035,.6);mitre.lineTo(.025,.52);mitre.lineTo(.25,.7);mitre.bezierCurveTo(.35,.56,.37,.44,.23,.37);mitre.closePath();
    const bishop:Part[]=[...common,{geometry:this.extrude(mitre,.25),position:[0,0,0]},{geometry:sphere(.067),position:[0,1.01,0]}];
    const horse=new Shape();horse.moveTo(-.31,.3);horse.lineTo(-.3,.58);horse.bezierCurveTo(-.45,.81,-.28,1.04,-.15,1.12);horse.lineTo(-.12,.94);horse.lineTo(.03,1.04);horse.lineTo(.14,.86);horse.lineTo(.44,.7);horse.lineTo(.42,.5);horse.lineTo(.28,.47);horse.lineTo(.05,.6);horse.bezierCurveTo(-.05,.51,.18,.43,.24,.3);horse.closePath();
    const knight:Part[]=[...common,{geometry:this.extrude(horse,.29),position:[0,-.13,0]}];
    const eye=sphere(.035);knight.push({geometry:eye,position:[.12,.68,.19]},{geometry:eye,position:[.12,.68,-.19]});
    const pawn:Part[]=[{geometry:lathe([[0,-.79],[.42,-.79],[.48,-.73],[.48,-.63],[.38,-.57],[.29,-.5],[.2,-.3],[.16,-.05],[.28,.03],[.28,.12],[0,.12]]),position:[0,0,0]},{geometry:sphere(.29),position:[0,.37,0]}];
    this.parts=[king,queen,rook,bishop,knight,pawn];
  }
  private keep<T extends BufferGeometry>(g:T):T{this.geometries.push(g);return g;}
  private extrude(shape:Shape,depth:number){const g=new ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:3,curveSegments:12});g.translate(0,0,-depth/2);return this.keep(g);}
  create(index:number,scale:number){
    const type=index%6,mesh=new Group(),material=this.materials[Math.floor(index/6)%2];mesh.scale.setScalar(scale);
    for(const part of this.parts[type]){const m=new Mesh(part.geometry,material);m.position.set(...part.position);if(part.rotation)m.rotation.set(...part.rotation);mesh.add(m);}
    return mesh;
  }
  dispose(){this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}
