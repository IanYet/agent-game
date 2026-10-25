import {BufferGeometry,CanvasTexture,ExtrudeGeometry,Float32BufferAttribute,Group,Mesh,MeshPhysicalMaterial,Shape,SRGBColorSpace} from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {Box,Vec3} from 'cannon-es';
import {paintTile,TILE_COLORS} from './artwork';

const HALF_SIZE=.66,CORNER_RADIUS=.18,DEPTH=.23,BEVEL=.045,DOME=.05,CAP_RINGS=12;

export class AzulTableModels {
  private body:BufferGeometry;
  private materials:MeshPhysicalMaterial[]=[];
  private faces:MeshPhysicalMaterial[]=[];
  private textures:CanvasTexture[]=[];
  constructor(){
    const shape=new Shape();const a=HALF_SIZE,r=CORNER_RADIUS;
    shape.moveTo(-a+r,-a);shape.lineTo(a-r,-a);shape.quadraticCurveTo(a,-a,a,-a+r);shape.lineTo(a,a-r);shape.quadraticCurveTo(a,a,a-r,a);shape.lineTo(-a+r,a);shape.quadraticCurveTo(-a,a,-a,a-r);shape.lineTo(-a,-a+r);shape.quadraticCurveTo(-a,-a,-a+r,-a);
    shape.closePath();
    const outline=shape.getSpacedPoints(96);outline.pop();
    const sides=new ExtrudeGeometry(new Shape(outline),{depth:DEPTH,bevelEnabled:true,bevelSize:BEVEL,bevelThickness:BEVEL,bevelSegments:8,steps:1});sides.translate(0,0,-DEPTH/2);
    const positions:number[]=[],uvs:number[]=[];
    const vertex=(x:number,y:number,z:number)=>{positions.push(x,y,z);uvs.push(.5+x*(z<0?-1:1)/(a*2),.5+y/(a*2));};
    const capTriangle=(side:number,p:[number,number],q:[number,number],s:[number,number])=>{
      for(const [radius,index] of side>0?[p,q,s]:[p,s,q]){
        const point=outline[index%outline.length];
        vertex(point.x*radius,point.y*radius,side*(DEPTH/2+BEVEL+DOME*(1-radius*radius)**2));
      }
    };
    for(const side of [-1,1])for(let ring=0;ring<CAP_RINGS;ring++)for(let i=0;i<outline.length;i++){
      const inner=ring/CAP_RINGS,outer=(ring+1)/CAP_RINGS;
      capTriangle(side,[inner,i],[outer,i],[outer,i+1]);
      if(ring)capTriangle(side,[inner,i],[outer,i+1],[inner,i+1]);
    }
    const capCount=positions.length/3,position=sides.getAttribute('position'),sideGroup=sides.groups.find(group=>group.materialIndex===1)!;
    for(let i=sideGroup.start;i<sideGroup.start+sideGroup.count;i++)vertex(position.getX(i),position.getY(i),position.getZ(i));
    const body=new BufferGeometry();body.setAttribute('position',new Float32BufferAttribute(positions,3));body.setAttribute('uv',new Float32BufferAttribute(uvs,2));
    body.addGroup(0,capCount,0);body.addGroup(capCount,sideGroup.count,1);
    // Both faces rise gently from the rounded rim; the artwork follows the same surface.
    this.body=mergeVertices(body);this.body.computeVertexNormals();body.dispose();sides.dispose();
    for(let i=0;i<5;i++){
      this.materials.push(new MeshPhysicalMaterial({color:TILE_COLORS[i],roughness:.08,metalness:0,ior:1.52,clearcoat:1,clearcoatRoughness:.025,envMapIntensity:1.65}));
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle=TILE_COLORS[i];ctx.fillRect(0,0,512,512);paintTile(ctx,i,0,0,512);
      const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;this.textures.push(texture);
      this.faces.push(new MeshPhysicalMaterial({map:texture,roughness:.055,metalness:0,ior:1.52,clearcoat:1,clearcoatRoughness:.018,envMapIntensity:1.8}));
    }
  }
  create(index:number,scale:number){
    const mesh=new Group(),i=index%this.faces.length;mesh.scale.setScalar(scale);mesh.add(new Mesh(this.body,[this.faces[i],this.materials[i]]));
    return {mesh,colliders:[{shape:new Box(new Vec3((HALF_SIZE+BEVEL)*scale,(HALF_SIZE+BEVEL)*scale,(DEPTH/2+BEVEL+DOME)*scale))}]};
  }
  dispose(){this.body.dispose();this.materials.forEach(m=>m.dispose());this.faces.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
