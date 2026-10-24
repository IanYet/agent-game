import {ExtrudeGeometry,Group,Mesh,MeshPhysicalMaterial,Shape,Vector2} from 'three';
import {ConvexPolyhedron,Vec3} from 'cannon-es';

export const GUANDAN_SYMBOLS=['2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
type Stroke={x:number;y:number;length:number;angle:number;thickness?:number};
const horizontal=(x:number,y:number,length=.63):Stroke=>({x,y,length,angle:0});
const vertical=(x:number,y:number,length=.61):Stroke=>({x,y,length,angle:Math.PI/2});
const segments=[horizontal(0,.72),vertical(.38,.37),vertical(.38,-.37),horizontal(0,-.72),vertical(-.38,-.37),vertical(-.38,.37),horizontal(0,0)];
const digits:Record<string,number[]>={'0':[0,1,2,3,4,5],'1':[1,2],'2':[0,1,6,4,3],'3':[0,1,6,2,3],'4':[5,6,1,2],'5':[0,5,6,2,3],'6':[0,5,6,4,2,3],'7':[0,1,2],'8':[0,1,2,3,4,5,6],'9':[0,1,2,3,5,6]};
function strokes(symbol:string):Stroke[]{
  if(symbol==='10')return ['1','0'].flatMap((digit,i)=>digits[digit].map(n=>({...segments[n],x:(segments[n].x+(i-.5)*1.06)*.76,y:segments[n].y*.9,length:segments[n].length*.76,thickness:.16})));
  if(symbol==='J')return [horizontal(0,.72),vertical(.38,.36),vertical(.38,-.36),horizontal(0,-.72),vertical(-.38,-.43,.35)];
  if(symbol==='Q')return [...digits['0'].map(n=>segments[n]),{x:.29,y:-.57,length:.66,angle:-Math.PI/4}];
  if(symbol==='K')return [vertical(-.38,0,1.44),{x:.02,y:.35,length:1.03,angle:Math.PI/4},{x:.02,y:-.35,length:1.03,angle:-Math.PI/4}];
  return digits[symbol].map(n=>segments[n]);
}
function outline(stroke:Stroke){
  const half=stroke.length/2,thick=(stroke.thickness??.20)/2;
  return [[-half,-thick],[half,-thick],[half,thick],[-half,thick]].map(([x,y])=>new Vector2(stroke.x+x*Math.cos(stroke.angle)-y*Math.sin(stroke.angle),stroke.y+x*Math.sin(stroke.angle)+y*Math.cos(stroke.angle)));
}
function collider(points:Vector2[],scale:number){
  const center=points.reduce((sum,p)=>sum.add(p),new Vector2()).multiplyScalar(.25),depth=.18*scale;
  const vertices=[-depth,depth].flatMap(z=>points.map(p=>new Vec3((p.x-center.x)*scale,(p.y-center.y)*scale,z)));
  return {shape:new ConvexPolyhedron({vertices,faces:[[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]}),offset:new Vec3(center.x*scale,center.y*scale,0)};
}

/** Bevelled numeral/letter strokes are both the visible model and the collision pieces. */
export class GuandanTableModels {
  private shapes=GUANDAN_SYMBOLS.map(s=>strokes(s).map(outline));
  private geometries=this.shapes.map(parts=>parts.map(points=>{
    const shape=new Shape(points),geometry=new ExtrudeGeometry(shape,{depth:.28,bevelEnabled:true,bevelThickness:.04,bevelSize:.035,bevelSegments:3,steps:1});
    geometry.translate(0,0,-.14);return geometry;
  }));
  private materials=['#d29c75','#95b8ce','#b698be','#c6ba9c','#8cb5a7'].map(color=>new MeshPhysicalMaterial({color,metalness:.32,roughness:.27,clearcoat:.8,clearcoatRoughness:.17}));
  create(index:number,scale:number){
    const at=index%GUANDAN_SYMBOLS.length,mesh=new Group();mesh.name=`guandan-${GUANDAN_SYMBOLS[at]}`;mesh.scale.setScalar(scale);
    this.geometries[at].forEach(geometry=>mesh.add(new Mesh(geometry,this.materials[index%this.materials.length])));
    return {mesh,colliders:this.shapes[at].map(points=>collider(points,scale))};
  }
  dispose(){this.geometries.flat().forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}
