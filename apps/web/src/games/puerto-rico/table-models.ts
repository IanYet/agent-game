import {Group,LatheGeometry,Mesh,MeshMatcapMaterial,TorusGeometry,Vector2} from 'three';
import {GOODS,GOOD_COLORS} from './data';
export class PuertoRicoTableModels {
  private barrel=new LatheGeometry([[0,-.7],[.45,-.7],[.53,-.63],[.62,-.2],[.64,0],[.62,.2],[.53,.63],[.45,.7],[0,.7]].map(([x,y])=>new Vector2(x,y)),32);
  private hoop=new TorusGeometry(.61,.037,8,32);
  private colors=GOODS.map(g=>new MeshMatcapMaterial({color:GOOD_COLORS[g]}));
  private iron=new MeshMatcapMaterial({color:'#344153'});
  create(index:number,scale:number){const group=new Group();group.scale.setScalar(scale*.55);group.add(new Mesh(this.barrel,this.colors[index%5]));for(const y of [-.34,.34]){const hoop=new Mesh(this.hoop,this.iron);hoop.rotation.x=Math.PI/2;hoop.position.y=y;group.add(hoop);}return group;}
  dispose(){this.barrel.dispose();this.hoop.dispose();this.iron.dispose();this.colors.forEach(m=>m.dispose());}
}
