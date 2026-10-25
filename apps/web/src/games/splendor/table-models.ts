import {BufferGeometry,Color as ThreeColor,Float32BufferAttribute,Group,Mesh,ShaderMaterial,Vector2,Vector3,Vector4} from 'three';
import {GEM_FACET_SCALE,GEM_PALETTE,gemOutline} from './artwork';
import {COLORS,type Color} from './types';
import {crystalFragment,crystalVertex} from './crystal.glsl';

type GemCut={geometry:BufferGeometry;planes:Vector4[];edges:Vector4[];table:Vector2[]};
const TABLE_Z=.27,GIRDLE_Z=.035,TIP_Z=-.48;
export const CRYSTAL_BODY_COLORS:Readonly<Record<Color,string>>={
  white:GEM_PALETTE.white[0],blue:'#1b3b9d',green:'#175e32',red:GEM_PALETTE.red[0],black:'#35333d',
};

/** The game's five approved silhouettes, cut into a table, crown, girdle and pavilion. */
function gemCut(color:Color):GemCut{
  const outline=gemOutline(color).map(([x,y])=>[x,-y] as const).reverse(),count=outline.length;
  const vertices=[
    ...outline.map(([x,y])=>new Vector3(x*GEM_FACET_SCALE,y*GEM_FACET_SCALE,TABLE_Z)),
    ...outline.map(([x,y])=>new Vector3(x,y,GIRDLE_Z)),
    ...outline.map(([x,y])=>new Vector3(x,y,-GIRDLE_Z)),
    new Vector3(0,0,TIP_Z),
  ];
  const faces:number[][]=[Array.from({length:count},(_,i)=>i)],edges=[new Vector4()];
  for(let i=0;i<count;i++){
    const next=(i+1)%count;
    faces.push([i,count+i,count+next,next]);
    faces.push([count+i,count*2+i,count*2+next,count+next]);
    faces.push([count*2+i,count*3,count*2+next]);
    const edge=new Vector4(...outline[i],...outline[next]);edges.push(edge,edge,edge);
  }
  const positions:number[]=[];
  for(const face of faces)for(let i=1;i<face.length-1;i++){
    for(const index of [face[0],face[i],face[i+1]]){const point=vertices[index];positions.push(point.x,point.y,point.z);}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const planes=faces.map(face=>{
    const a=vertices[face[0]],normal=new Vector3().subVectors(vertices[face[1]],a).cross(new Vector3().subVectors(vertices[face[2]],a)).normalize();
    return new Vector4(normal.x,normal.y,normal.z,-normal.dot(a));
  });
  return {geometry,planes,edges,table:outline.map(([x,y])=>new Vector2(x*GEM_FACET_SCALE,y*GEM_FACET_SCALE))};
}

export class SplendorTableModels {
  readonly pixelBudget=2.5e6;
  private cuts=COLORS.map(gemCut);
  private materials=COLORS.map((color,index)=>new ShaderMaterial({
    name:`splendor-crystal-${color}`,
    defines:{GEM_PLANES:this.cuts[index].planes.length,GEM_OUTLINE:this.cuts[index].table.length},
    uniforms:{
      gemPlanes:{value:this.cuts[index].planes},gemColor:{value:new ThreeColor(CRYSTAL_BODY_COLORS[color])},
      gemEdges:{value:this.cuts[index].edges},gemTable:{value:this.cuts[index].table},
      gemIor:{value:color==='white'?2.1:1.76},gemBrilliance:{value:color==='white'?2.0:color==='black'?4.0:3.1},
    },
    vertexShader:crystalVertex,fragmentShader:crystalFragment,
    transparent:true,depthWrite:false,toneMapped:false,
  }));

  create(index:number,scale:number){
    const type=index%COLORS.length,cut=this.cuts[type],mesh=new Group();mesh.scale.setScalar(scale);
    mesh.add(new Mesh(cut.geometry,this.materials[type]));
    return mesh;
  }

  setColor(color:Color,hex:string){
    this.materials[COLORS.indexOf(color)].uniforms.gemColor.value.set(hex);
  }

  dispose(){this.cuts.forEach(cut=>cut.geometry.dispose());this.materials.forEach(material=>material.dispose());}
}
