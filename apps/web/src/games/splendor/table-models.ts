import {BufferGeometry,CanvasTexture,CircleGeometry,Color,Float32BufferAttribute,Group,LatheGeometry,Mesh,MeshPhysicalMaterial,SRGBColorSpace,Vector2} from 'three';
import {ConvexPolyhedron,Vec3} from 'cannon-es';
import {GEM_PALETTE,gemOutline,paintGem} from './artwork';
import {GEMS,type Gem} from './types';

/** Reusable coin bodies, engraved faces and raised gemstone cuts; no playing-card suits. */
export class SplendorModels {
  private geometries:BufferGeometry[]=[];
  private materials:MeshPhysicalMaterial[]=[];
  private textures:CanvasTexture[]=[];
  private bodies:LatheGeometry[]=[];
  private faces:MeshPhysicalMaterial[]=[];
  private gems:BufferGeometry[]=[];
  private gemMaterials:MeshPhysicalMaterial[]=[];
  private bodyMaterial:MeshPhysicalMaterial;
  private disc=new CircleGeometry(.66,48);
  constructor(){
    this.geometries.push(this.disc);this.bodyMaterial=this.material({vertexColors:true,roughness:.3,metalness:.38,clearcoat:.7});
    for(const color of GEMS){
      const profile=[[0,-.17],[.62,-.17],[.70,-.15],[.755,-.09],[.765,0],[.755,.09],[.70,.15],[.62,.17],[0,.17]];
      const body=new LatheGeometry(profile.map(([x,y])=>new Vector2(x,y)),48);body.rotateX(Math.PI/2);
      const position=body.getAttribute('position'),colors:number[]=[],base=new Color(GEM_PALETTE[color][0]),edge=new Color(GEM_PALETTE[color][2]),inlay=new Color(color==='gold'?'#fff0b5':'#bdad80');
      for(let i=0;i<position.count;i++){
        const angle=Math.atan2(position.getY(i),position.getX(i))+Math.PI,radial=Math.hypot(position.getX(i),position.getY(i));
        const tint=radial>.735?((angle/Math.PI*24)%1<.17?inlay:edge):base;colors.push(tint.r,tint.g,tint.b);
      }
      body.setAttribute('color',new Float32BufferAttribute(colors,3));this.bodies.push(body);this.geometries.push(body);
      const texture=this.faceTexture(color);this.textures.push(texture);this.faces.push(this.material({map:texture,roughness:.32,metalness:color==='gold'?.65:.25,clearcoat:.65}));
      const cut=this.gemGeometry(color);this.gems.push(cut);this.geometries.push(cut);this.gemMaterials.push(this.material({vertexColors:true,roughness:.17,metalness:color==='gold'?.7:.18,clearcoat:1,clearcoatRoughness:.1,flatShading:true}));
    }
  }
  private material(options:ConstructorParameters<typeof MeshPhysicalMaterial>[0]){const material=new MeshPhysicalMaterial(options);this.materials.push(material);return material;}
  private faceTexture(color:Gem){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const ctx=canvas.getContext('2d')!,palette=GEM_PALETTE[color];
    ctx.fillStyle=palette[3];ctx.fillRect(0,0,384,384);
    const glow=ctx.createRadialGradient(158,138,4,192,192,180);glow.addColorStop(0,palette[0]);glow.addColorStop(1,palette[3]);ctx.fillStyle=glow;ctx.fillRect(0,0,384,384);
    for(const radius of [178,168,140]){ctx.lineWidth=radius===178?4:1.4;ctx.strokeStyle=color==='gold'?'#ffedabbb':'#e8d5a98c';ctx.beginPath();ctx.arc(192,192,radius,0,Math.PI*2);ctx.stroke();}
    for(let i=0;i<12;i++){const angle=i*Math.PI/6;ctx.save();ctx.translate(192+Math.cos(angle)*154,192+Math.sin(angle)*154);ctx.rotate(angle+Math.PI/2);ctx.fillStyle=palette[1];ctx.globalAlpha=.7;ctx.fillRect(-2,-5,4,10);ctx.restore();}
    paintGem(ctx,color,192,192,112);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;return texture;
  }
  private gemGeometry(color:Gem){
    const outline=gemOutline(color),vertices:number[]=[],colors:number[]=[],palette=GEM_PALETTE[color];
    const triangle=(a:number[],b:number[],c:number[],tint:string)=>{vertices.push(...a,...b,...c);const rgb=new Color(tint);for(let i=0;i<3;i++)colors.push(rgb.r,rgb.g,rgb.b);};
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],loA=[a[0]*.34,a[1]*.34,0],loB=[b[0]*.34,b[1]*.34,0],hiA=[a[0]*.17,a[1]*.17,.1],hiB=[b[0]*.17,b[1]*.17,.1];
      const tint=palette[[1,0,2,3,2,0,1,1][i]];triangle(loA,loB,hiB,tint);triangle(loA,hiB,hiA,tint);triangle([0,0,.1],hiA,hiB,palette[0]);
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
  }
  create(index:number,scale:number){
    const color=index%6,mesh=new Group();mesh.scale.setScalar(scale);mesh.add(new Mesh(this.bodies[color],this.bodyMaterial));
    for(const side of [-1,1]){
      const face=new Mesh(this.disc,this.faces[color]);face.position.z=side*.171;if(side<0)face.rotation.y=Math.PI;mesh.add(face);
      const gem=new Mesh(this.gems[color],this.gemMaterials[color]);gem.position.z=side*.173;if(side<0)gem.rotation.y=Math.PI;mesh.add(gem);
    }
    const count=16,vertices=[-.19,.19].flatMap(z=>Array.from({length:count},(_,i)=>new Vec3(Math.cos(i*Math.PI*2/count)*.765*scale,Math.sin(i*Math.PI*2/count)*.765*scale,z*scale)));
    const faces=[Array.from({length:count},(_,i)=>count-1-i),Array.from({length:count},(_,i)=>count+i)];
    for(let i=0;i<count;i++){const next=(i+1)%count;faces.push([i,next,next+count,i+count]);}
    return {mesh,colliders:[{shape:new ConvexPolyhedron({vertices,faces})}]};
  }
  dispose(){this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
