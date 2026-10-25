import {Group,LatheGeometry,Mesh,MeshMatcapMaterial,Vector2} from 'three';

/** One solid colour across the rounded rim and both faces, without artwork or inlays. */
export class PlainChipModels {
  private body=new LatheGeometry([
    [0,-.17],[.62,-.17],[.71,-.15],[.755,-.1],[.77,-.04],
    [.77,.04],[.755,.1],[.71,.15],[.62,.17],[0,.17],
  ].map(([radius,y])=>new Vector2(radius,y)),96);
  private materials:MeshMatcapMaterial[];

  constructor(colors:readonly string[]){
    this.materials=colors.map(color=>new MeshMatcapMaterial({color}));
  }

  create(index:number,scale:number){
    const mesh=new Group();mesh.scale.setScalar(scale);
    mesh.add(new Mesh(this.body,this.materials[index%this.materials.length]));
    return mesh;
  }

  dispose(){this.body.dispose();this.materials.forEach(material=>material.dispose());}
}
