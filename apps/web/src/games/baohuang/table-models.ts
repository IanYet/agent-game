import {BoxGeometry,CylinderGeometry,ExtrudeGeometry,Group,Mesh,MeshPhysicalMaterial,Shape,SphereGeometry,type BufferGeometry} from 'three';
import {Box,Vec3,type Shape as CollisionShape} from 'cannon-es';

type Collider={shape:CollisionShape;offset?:Vec3};
// Regal objects share the public table's materials, rigid bodies and pointer forces.
export class BaoTableModels {
  private geometries:BufferGeometry[]=[];
  private materials:MeshPhysicalMaterial[]=[];
  private gold=this.material('#cba353');
  private silver=this.material('#8fabb7');
  private ink=this.material('#5d718b');
  private ruby=this.material('#a84b58');
  private crown=this.outline([[-.82,-.56],[.82,-.56],[.95,.49],[.47,.12],[0,.79],[-.47,.12],[-.95,.49]]);
  private shield=this.outline([[-.73,.67],[.73,.67],[.65,-.17],[.4,-.55],[0,-.83],[-.4,-.55],[-.65,-.17]]);
  private card=this.geometry(new BoxGeometry(1.22,1.65,.2));
  private head=this.geometry(new SphereGeometry(.2,16,12));
  private jewel=this.geometry(new SphereGeometry(.1,16,12));
  private bar=this.geometry(new BoxGeometry(.16,1.05,.14));
  private foot=this.geometry(new BoxGeometry(.65,.12,.18));
  private disc=this.geometry(new CylinderGeometry(.83,.83,.22,40));
  private bust=this.outline([[-.27,-.45],[.27,-.45],[.19,-.04],[-.19,-.04]]);
  private material(color:string){const m=new MeshPhysicalMaterial({color,roughness:.28,metalness:.5,clearcoat:.75,clearcoatRoughness:.2});this.materials.push(m);return m;}
  private geometry<T extends BufferGeometry>(g:T):T{this.geometries.push(g);return g;}
  private outline(points:number[][]){const s=new Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();const g=new ExtrudeGeometry(s,{depth:.22,bevelEnabled:true,bevelSize:.055,bevelThickness:.045,bevelSegments:3,steps:1});g.translate(0,0,-.11);return this.geometry(g);}
  create(index:number,scale:number):{mesh:Group;colliders:Collider[]}{
    const mesh=new Group();mesh.scale.setScalar(scale);const type=index%4;
    const add=(g:BufferGeometry,m:MeshPhysicalMaterial,x=0,y=0,z=0)=>{const part=new Mesh(g,m);part.position.set(x,y,z);mesh.add(part);return part;};
    const box=(x:number,y:number,z:number,ox=0,oy=0):Collider=>({shape:new Box(new Vec3(x*scale,y*scale,z*scale)),offset:new Vec3(ox*scale,oy*scale,0)});
    if(type===0){
      add(this.crown,this.gold);for(const side of [-1,1]){add(this.jewel,this.ruby,0,-.25,side*.17);add(this.jewel,this.silver,-.49,-.25,side*.17);add(this.jewel,this.silver,.49,-.25,side*.17);}
      return {mesh,colliders:[box(.83,.32,.17,0,-.25),box(.27,.34,.17,0,.38),box(.19,.24,.17,-.69,.23),box(.19,.24,.17,.69,.23)]};
    }
    if(type===1){
      add(this.shield,this.silver);for(const side of [-1,1]){add(this.bar,this.gold,0,.05,side*.2);const cross=add(this.foot,this.gold,0,.29,side*.2);cross.scale.x=.8;}
      return {mesh,colliders:[box(.72,.46,.17,0,.22),box(.47,.22,.17,0,-.42),box(.2,.15,.17,0,-.7)]};
    }
    if(type===2){
      const disc=add(this.disc,this.ink);disc.rotation.x=Math.PI/2;
      for(const side of [-1,1])for(const x of [-.4,0,.4]){add(this.head,this.silver,x,.22,side*.16).scale.setScalar(.72);add(this.bust,this.silver,x,-.04,side*.16).scale.setScalar(.64);}
      return {mesh,colliders:[box(.76,.76,.16)]};
    }
    add(this.card,this.ruby);for(const side of [-1,1]){const crown=add(this.crown,this.gold,0,.17,side*.17);crown.scale.setScalar(.47);add(this.foot,this.silver,0,-.47,side*.17);}
    return {mesh,colliders:[box(.64,.85,.15)]};
  }
  dispose(){this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}
