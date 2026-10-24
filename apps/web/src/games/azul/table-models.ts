import {CanvasTexture,ExtrudeGeometry,Group,Mesh,MeshPhysicalMaterial,PlaneGeometry,Shape,SRGBColorSpace} from 'three';
import {Box,Vec3} from 'cannon-es';
import {paintTile,TILE_COLORS} from './artwork';

export class AzulTableModels {
  private body:ExtrudeGeometry;
  private face=new PlaneGeometry(1.28,1.28);
  private materials:MeshPhysicalMaterial[]=[];
  private faces:MeshPhysicalMaterial[]=[];
  private textures:CanvasTexture[]=[];
  constructor(){
    const shape=new Shape();const a=.66,r=.10;
    shape.moveTo(-a+r,-a);shape.lineTo(a-r,-a);shape.quadraticCurveTo(a,-a,a,-a+r);shape.lineTo(a,a-r);shape.quadraticCurveTo(a,a,a-r,a);shape.lineTo(-a+r,a);shape.quadraticCurveTo(-a,a,-a,a-r);shape.lineTo(-a,-a+r);shape.quadraticCurveTo(-a,-a,-a+r,-a);
    this.body=new ExtrudeGeometry(shape,{depth:.23,bevelEnabled:true,bevelSize:.035,bevelThickness:.04,bevelSegments:3,steps:1,curveSegments:8});this.body.translate(0,0,-.115);
    for(let i=0;i<6;i++){
      this.materials.push(new MeshPhysicalMaterial({color:TILE_COLORS[i],roughness:.19,metalness:.03,clearcoat:1,clearcoatRoughness:.09}));
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;paintTile(canvas.getContext('2d')!,i,0,0,512);
      const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;this.textures.push(texture);
      this.faces.push(new MeshPhysicalMaterial({map:texture,roughness:.18,metalness:.02,clearcoat:1,clearcoatRoughness:.08}));
    }
  }
  create(index:number,scale:number){
    const mesh=new Group(),i=index%6;mesh.scale.setScalar(scale);mesh.add(new Mesh(this.body,this.materials[i]));
    for(const side of [-1,1]){const face=new Mesh(this.face,this.faces[i]);face.position.z=side*.157;face.rotation.y=side===-1?Math.PI:0;mesh.add(face);}
    return {mesh,colliders:[{shape:new Box(new Vec3(.695*scale,.695*scale,.155*scale))}]};
  }
  dispose(){this.body.dispose();this.face.dispose();this.materials.forEach(m=>m.dispose());this.faces.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
