import {Group,LinearFilter,Mesh,MeshMatcapMaterial,NoColorSpace,type DataTexture,type Material} from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';

// Lusion HomeBalloons: red = diffuse, green = matte specular, blue = glossy specular.
// https://lusion.co/_astro/hoisted.CUO_IjfL.js
const FINISHES=['matte','glossy','matte','glossy','glossy','matte','matte'] as const;
type Finish=(typeof FINISHES)[number];
const ROUGHNESS={glossy:.1,matte:.8};
const MATCAP_URL=new URL('./assets/lusion-home-matcap.exr',import.meta.url).href;

const fragmentSurface=/* glsl */`
float surfaceRoughness = min(0.9, tableRoughness + dot(vec3(1.0), fwidth(normal)));
float diffuseLight = 0.25 + 0.75 * matcapColor.r;
float specularLight = surfaceRoughness > 0.5 ? matcapColor.g : matcapColor.b;
// The reference disables ColorManagement: restore sRGB albedo before its lighting curve.
vec3 albedo = sRGBTransferOETF(diffuseColor).rgb;
vec3 outgoingLight = albedo * diffuseLight + vec3(specularLight);
// Match the reference's 2.2 power and optimized filmic curve.
outgoingLight = pow(max(outgoingLight, vec3(0.0)), vec3(2.2));
outgoingLight = max(vec3(0.0), outgoingLight - 0.004);
outgoingLight = outgoingLight * (6.2 * outgoingLight + 0.5) / (outgoingLight * (6.2 * outgoingLight + 1.7) + 0.06);
`;

export class TableSurfaces {
  private variants=new Map<MeshMatcapMaterial,Map<Finish,MeshMatcapMaterial>>();
  private disposed=false;

  private constructor(private matcap:DataTexture){}

  static async load(){
    const texture=await new EXRLoader().loadAsync(MATCAP_URL);
    texture.colorSpace=NoColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=LinearFilter;
    return new TableSurfaces(texture);
  }

  apply(mesh:Group,index:number){
    mesh.traverse(object=>{
      if(!(object instanceof Mesh))return;
      object.castShadow=false;object.receiveShadow=true;
      object.material=Array.isArray(object.material)?object.material.map(material=>this.material(material,index)):this.material(object.material,index);
    });
  }

  private material(source:Material,index:number){
    if(!(source instanceof MeshMatcapMaterial))return source;
    let variants=this.variants.get(source);
    if(!variants){variants=new Map();this.variants.set(source,variants);}
    const finish=FINISHES[index%FINISHES.length],existing=variants.get(finish);if(existing)return existing;
    const material=source.clone();
    material.name=`table-${finish}`;material.matcap=this.matcap;material.toneMapped=false;
    material.onBeforeCompile=shader=>{
      shader.uniforms.tableRoughness={value:ROUGHNESS[finish]};
      shader.fragmentShader=`uniform float tableRoughness;\n${shader.fragmentShader}`
        .replace('* 0.495 + 0.5','* 0.5 + 0.5')
        .replace('vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;',fragmentSurface)
        .replace('#include <tonemapping_fragment>','')
        .replace('#include <colorspace_fragment>','');
    };
    material.customProgramCacheKey=()=> 'tongzhuo-table-packed-matcap';
    variants.set(finish,material);return material;
  }

  restore(){this.matcap.needsUpdate=true;}

  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.variants.forEach(variants=>variants.forEach(material=>material.dispose()));this.variants.clear();
    this.matcap.dispose();
  }
}
