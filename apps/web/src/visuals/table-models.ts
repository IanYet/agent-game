import {
  BufferGeometry, CanvasTexture, CircleGeometry, Color, ExtrudeGeometry,
  Float32BufferAttribute, Group, LatheGeometry, Mesh, MeshPhysicalMaterial,
  Shape, ShapeUtils, SRGBColorSpace, Vector2, Vector3,
} from 'three';
import {ConvexPolyhedron, Cylinder, Vec3, type Shape as CollisionShape} from 'cannon-es';
import {BaoTableModels} from '../games/baohuang/table-models';
import {ChessTableModels} from '../games/chess/table-models';
import {SplendorModels} from '../games/splendor/table-models';
import {AzulTableModels} from '../games/azul/table-models';
import {CitadelsModels} from '../games/citadels/table-models';
import {GuandanTableModels} from '../games/guandan/table-models';

export type TableTheme='holdem'|'doudizhu'|'baohuang'|'chess'|'azul'|'citadels'|'splendor'|'guandan';
type Collider={shape:CollisionShape;offset?:Vec3};
interface GameModelSet {create:(index:number,scale:number)=>{mesh:Group;colliders:Collider[]};dispose:()=>void}

// One outline supplies both the visible suit and its collision geometry.
function suitShape(index:number){
  const s=new Shape();
  if(index===0){
    s.moveTo(0,.95);s.bezierCurveTo(-.24,.58,-.85,.16,-.85,-.22);
    s.bezierCurveTo(-.85,-.72,-.28,-.73,-.11,-.34);
    s.bezierCurveTo(-.10,-.56,-.21,-.74,-.37,-.86);s.lineTo(.37,-.86);
    s.bezierCurveTo(.21,-.74,.10,-.56,.11,-.34);
    s.bezierCurveTo(.28,-.73,.85,-.72,.85,-.22);
    s.bezierCurveTo(.85,.16,.24,.58,0,.95);
  }else if(index===1){
    s.moveTo(0,-.82);s.bezierCurveTo(-.13,-.62,-.85,-.12,-.85,.36);
    s.bezierCurveTo(-.85,.95,-.22,1.04,0,.52);
    s.bezierCurveTo(.22,1.04,.85,.95,.85,.36);
    s.bezierCurveTo(.85,-.12,.13,-.62,0,-.82);
  }else if(index===2){
    s.moveTo(0,.94);s.lineTo(.71,0);s.lineTo(0,-.94);s.lineTo(-.71,0);
  }else{
    s.moveTo(0,.91);s.bezierCurveTo(.47,.91,.61,.36,.29,.12);
    s.bezierCurveTo(.73,.37,1.02,-.04,.79,-.42);
    s.bezierCurveTo(.62,-.69,.26,-.63,.11,-.36);
    s.bezierCurveTo(.10,-.57,.23,-.75,.38,-.87);s.lineTo(-.38,-.87);
    s.bezierCurveTo(-.23,-.75,-.10,-.57,-.11,-.36);
    s.bezierCurveTo(-.26,-.63,-.62,-.69,-.79,-.42);
    s.bezierCurveTo(-1.02,-.04,-.73,.37,-.29,.12);
    s.bezierCurveTo(-.61,.36,-.47,.91,0,.91);
  }
  s.closePath();return s;
}

function convexHull(points:Vector2[]){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(a:Vector2,b:Vector2,c:Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half=(vertices:Vector2[])=>{
    const result:Vector2[]=[];
    for(const p of vertices){while(result.length>1&&cross(result.at(-2)!,result.at(-1)!,p)<=1e-7)result.pop();result.push(p);}
    result.pop();return result;
  };
  return [...half(sorted),...half(sorted.slice().reverse())];
}

// Describe each lobe and stem with a few convex pieces, preserving the notches.
function collisionProfiles(shape:Shape,index:number){
  const outline=shape.getPoints(4);outline.pop();
  const polygon=(points:number[][])=>points.map(([x,y])=>new Vector2(x,y));
  const stem=polygon([[-.11,-.34],[-.38,-.87],[.38,-.87],[.11,-.34]]);
  if(index===0)return [
    convexHull([...outline.filter(p=>p.x<=0&&p.y>=-.61),new Vector2(0,-.34)]),
    convexHull([...outline.filter(p=>p.x>=0&&p.y>=-.61),new Vector2(0,-.34)]),stem,
  ];
  if(index===1)return [-1,1].map(side=>convexHull(outline.filter(p=>p.x*side>=0)));
  if(index===2)return [convexHull(outline)];
  const lobe=(x:number,y:number,rx:number,ry:number)=>Array.from({length:12},(_,i)=>{
    const angle=i*Math.PI/6;return new Vector2(x+Math.cos(angle)*rx,y+Math.sin(angle)*ry);
  });
  return [lobe(0,.49,.42,.43),lobe(-.49,-.15,.4,.43),lobe(.49,-.15,.4,.43),stem];
}

function prism(points:Vector2[],scale:number){
  const count=points.length,depth=.21*scale;
  const center=points.reduce((sum,p)=>sum.add(p),new Vector2()).multiplyScalar(1/count);
  const vertices=[-depth,depth].flatMap(z=>points.map(p=>new Vec3((p.x-center.x)*scale,(p.y-center.y)*scale,z)));
  const faces=[points.map((_,i)=>count-1-i),points.map((_,i)=>count+i)];
  for(let i=0;i<count;i++){const next=(i+1)%count;faces.push([i,next,next+count,i+count]);}
  return {shape:new ConvexPolyhedron({vertices,faces}),offset:new Vec3(center.x*scale,center.y*scale,0)};
}

const chipColors=['#b94b51','#497eac','#d6c9aa','#4f9188','#8d71ad','#cf9450'];
const suitColors=['#597697','#c45760','#cf865d','#b8c5d2'];

export class TableModels{
  private gameModels?:GameModelSet;
  private geometries:BufferGeometry[]=[];
  private materials:MeshPhysicalMaterial[]=[];
  private textures:CanvasTexture[]=[];
  private outlines=[0,1,2,3].map(suitShape);
  private pieces:Vector2[][][]=[];
  private suits:ExtrudeGeometry[]=[];
  private chips:LatheGeometry[]=[];
  private faces:MeshPhysicalMaterial[]=[];
  private suitMaterials:MeshPhysicalMaterial[]=[];
  private chipMaterial!:MeshPhysicalMaterial;
  private disc!:CircleGeometry;

  constructor(private theme:TableTheme){
    if(theme==='baohuang'){this.gameModels=new BaoTableModels();return;}
    if(theme==='chess'){this.gameModels=new ChessTableModels();return;}
    if(theme==='splendor'){this.gameModels=new SplendorModels();return;}
    if(theme==='azul'){this.gameModels=new AzulTableModels();return;}
    if(theme==='citadels'){this.gameModels=new CitadelsModels();return;}
    if(theme==='guandan'){this.gameModels=new GuandanTableModels();return;}
    if(theme!=='holdem'&&theme!=='doudizhu')throw new Error(`未注册的牌桌物件主题：${theme}`);
    this.disc=new CircleGeometry(.704,64);this.geometries.push(this.disc);
    this.chipMaterial=this.material({vertexColors:true,roughness:.32,metalness:.22,clearcoat:.6});
    if(theme==='holdem')chipColors.forEach((hex,index)=>{
      const profile=[[0,-.15],[.66,-.15],[.724,-.135],[.75,-.105],[.75,.105],[.724,.135],[.66,.15],[0,.15]];
      const geometry=new LatheGeometry(profile.map(([x,y])=>new Vector2(x,y)),64);
      const position=geometry.getAttribute('position'),colors:number[]=[],base=new Color(hex),stripe=new Color('#e3dac4');
      for(let i=0;i<position.count;i++){
        const angle=Math.atan2(position.getX(i),position.getZ(i))+Math.PI;
        const color=Math.hypot(position.getX(i),position.getZ(i))>.71&&(angle/(Math.PI*2)*12)%1<.28?stripe:base;
        colors.push(color.r,color.g,color.b);
      }
      geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
      this.chips.push(geometry);this.geometries.push(geometry);
      const face=this.chipTexture(hex,index);this.textures.push(face);
      this.faces.push(this.material({map:face,roughness:.42,metalness:.12,clearcoat:.45}));
    });
    else this.outlines.forEach((shape,index)=>{
      const geometry=new ExtrudeGeometry(shape,{depth:.28,bevelEnabled:true,bevelThickness:.065,bevelSize:.065,bevelSegments:3,steps:1,curveSegments:10});
      geometry.computeBoundingBox();const center=geometry.boundingBox!.getCenter(new Vector3());
      geometry.translate(-center.x,-center.y,-center.z);
      this.suits.push(geometry);this.geometries.push(geometry);
      this.pieces.push(collisionProfiles(shape,index).map(points=>{
        if(ShapeUtils.isClockWise(points))points.reverse();
        return points.map(p=>p.clone().sub(new Vector2(center.x,center.y)).multiplyScalar(1.045));
      }));
      this.suitMaterials.push(this.material({color:suitColors[index],roughness:.27,metalness:.28,clearcoat:.75,clearcoatRoughness:.2}));
    });
  }

  private material(options:ConstructorParameters<typeof MeshPhysicalMaterial>[0]){
    const m=new MeshPhysicalMaterial(options);this.materials.push(m);return m;
  }

  private chipTexture(color:string,index:number){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=color;ctx.fillRect(0,0,512,512);
    ctx.fillStyle='#111a2533';ctx.beginPath();ctx.arc(256,256,202,0,Math.PI*2);ctx.fill();
    for(const [radius,alpha] of [[230,.65],[217,.25],[199,.5],[182,.16]] as const){
      ctx.strokeStyle=`rgba(244,232,204,${alpha})`;ctx.lineWidth=radius===230?4:2;
      ctx.beginPath();ctx.arc(256,256,radius,0,Math.PI*2);ctx.stroke();
    }
    const pip=(suit:number,x:number,y:number,size:number)=>{
      ctx.save();ctx.translate(x,y);ctx.scale(size,-size);
      ctx.beginPath();this.outlines[suit].getPoints(20).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.closePath();ctx.fillStyle='#f2e6cf';ctx.shadowColor='#080d1599';ctx.shadowBlur=3/size;ctx.shadowOffsetY=2/size;ctx.fill();ctx.restore();
    };
    pip(index%4,256,256,115);
    [0,1,2,3].forEach(suit=>{const angle=suit*Math.PI/2-Math.PI/2;pip(suit,256+Math.cos(angle)*164,256+Math.sin(angle)*164,23);});
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;return texture;
  }

  create(index:number,scale:number):{mesh:Group;colliders:Collider[]}{
    if(this.gameModels)return this.gameModels.create(index,scale);
    const mesh=new Group();mesh.scale.setScalar(scale);
    if(this.theme==='holdem'){
      const color=index%chipColors.length;
      mesh.add(new Mesh(this.chips[color],this.chipMaterial));
      for(const side of [-1,1]){
        const face=new Mesh(this.disc,this.faces[color]);face.position.y=side*.151;face.rotation.x=-side*Math.PI/2;mesh.add(face);
      }
      return {mesh,colliders:[{shape:new Cylinder(.75*scale,.75*scale,.30*scale,20)}]};
    }
    const suit=index%4;mesh.add(new Mesh(this.suits[suit],this.suitMaterials[suit]));
    return {mesh,colliders:this.pieces[suit].map(points=>prism(points,scale))};
  }

  dispose(){this.gameModels?.dispose();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
