import {BoxGeometry,ExtrudeGeometry,Group,Mesh,MeshMatcapMaterial,Shape} from 'three';
import {SEAT_COLORS} from './artwork';
export class CatanTableModels {
  private house:ExtrudeGeometry;
  private road=new BoxGeometry(1.6,.3,.34,1,1,1);
  private materials=SEAT_COLORS.map(color=>new MeshMatcapMaterial({color}));
  constructor(){const shape=new Shape();shape.moveTo(-.55,-.5);shape.lineTo(.55,-.5);shape.lineTo(.55,.16);shape.lineTo(0,.64);shape.lineTo(-.55,.16);shape.closePath();this.house=new ExtrudeGeometry(shape,{depth:.55,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:3,steps:1});this.house.translate(0,0,-.275);}
  create(index:number,scale:number){const group=new Group();group.scale.setScalar(scale*.65);group.add(new Mesh(index%3===0?this.road:this.house,this.materials[index%4]));return group;}
  dispose(){this.house.dispose();this.road.dispose();this.materials.forEach(m=>m.dispose());}
}
