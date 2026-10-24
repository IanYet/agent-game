import {BoxGeometry,CylinderGeometry,ExtrudeGeometry,Group,Mesh,MeshPhysicalMaterial,OctahedronGeometry,Shape,SphereGeometry,TorusGeometry,type BufferGeometry} from 'three';
import {Box,Cylinder,Sphere,Vec3,type Shape as CollisionShape} from 'cannon-es';
type Collider={shape:CollisionShape;offset?:Vec3};
export const CITADELS_OBJECTS=['🗡️','💰','🪄','👑','⚜️','📦','📐','🪖'];

/** Eight silhouettes, with compound collision bodies, share the table's lighting and pointer physics. */
export class CitadelsModels {
  private geometries:BufferGeometry[]=[];
  private materials=['#bdc6d4','#c8a453','#625374','#c29966','#89b3a1','#8e424c','#212637','#e0ceb0'].map(color=>new MeshPhysicalMaterial({color,metalness:.42,roughness:.3,clearcoat:.65}));
  create(index:number,scale:number):{mesh:Group;colliders:Collider[]}{
    const mesh=new Group(),colliders:Collider[]=[];mesh.scale.setScalar(scale);
    const part=(geo:BufferGeometry,material:number,x=0,y=0,z=0)=>{this.geometries.push(geo);const m=new Mesh(geo,this.materials[material]);m.position.set(x,y,z);mesh.add(m);return m;};
    const collisionBox=(w:number,h:number,d:number,x=0,y=0,z=0)=>colliders.push({shape:new Box(new Vec3(w*scale/2,h*scale/2,d*scale/2)),offset:new Vec3(x*scale,y*scale,z*scale)});
    const box=(w:number,h:number,d:number,mat:number,x=0,y=0,z=0,collision=true)=>{const m=part(new BoxGeometry(w,h,d),mat,x,y,z);if(collision)collisionBox(w,h,d,x,y,z);return m;};
    const orb=(radius:number,mat:number,x=0,y=0,z=0,collision=true)=>{const m=part(new SphereGeometry(radius,24,16),mat,x,y,z);if(collision)colliders.push({shape:new Sphere(radius*scale),offset:new Vec3(x*scale,y*scale,z*scale)});return m;};
    const rod=(radius:number,height:number,mat:number,x=0,y=0,z=0)=>{part(new CylinderGeometry(radius,radius,height,20),mat,x,y,z);colliders.push({shape:new Cylinder(radius*scale,radius*scale,height*scale,12),offset:new Vec3(x*scale,y*scale,z*scale)});};
    const outline=(points:number[][],depth:number,mat:number)=>{const shape=new Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const g=new ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.035,bevelThickness:.03,bevelSegments:2,steps:1});g.translate(0,0,-depth/2);part(g,mat);};
    switch(index%8){
      case 0: // Assassin: silver diamond blade, gold crossguard and dark grip.
        outline([[0,1],[-.21,.15],[0,-.2],[.21,.15]],.15,0);collisionBox(.34,1.15,.2,0,.4);
        box(.8,.12,.24,1,0,-.2);rod(.1,.55,6,0,-.52);orb(.14,1,0,-.83);break;
      case 1: // Thief: rounded drawstring purse, neck, tie, and coin.
        orb(.64,3,0,-.13).scale.set(1,.9,.65);rod(.26,.25,3,0,.55);
        part(new TorusGeometry(.27,.055,10,28),1,0,.55).rotation.x=Math.PI/2;
        box(.39,.1,.12,1,.27,.58,.1,false).rotation.z=-.4;
        orb(.18,1,0,-.1,.4,false).scale.z=.22;break;
      case 2: // Magician: staff with an amethyst crystal and gilt socket.
        rod(.075,1.55,2,0,-.17);rod(.14,.17,1,0,.59);
        part(new OctahedronGeometry(.36),2,0,.91);colliders.push({shape:new Sphere(.36*scale),offset:new Vec3(0,.91*scale,0)});
        box(.22,.05,.17,1,0,-.78);break;
      case 3: // King: a crown has three unmistakable prongs and inset gems.
        outline([[-.8,-.55],[-.86,.5],[-.43,.1],[0,.87],[.43,.1],[.86,.5],[.8,-.55]],.3,1);
        collisionBox(1.5,.75,.37,0,-.15);collisionBox(.4,.6,.3,0,.5);
        for(const x of [-.65,0,.65])orb(.1,x===0?5:2,x,-.25,.19,false);box(1.58,.12,.35,1,0,-.47);break;
      case 4: // Bishop: a long crozier with curved head, cross and blue jewel.
        rod(.07,1.65,1,0,-.05);part(new TorusGeometry(.29,.07,10,28,Math.PI*1.7),1,.24,.72);
        colliders.push({shape:new Sphere(.36*scale),offset:new Vec3(.22*scale,.72*scale,0)});
        box(.52,.07,.14,0,0,.32);orb(.1,0,.28,.63,.04,false);break;
      case 5: // Merchant: bound cargo crate, corner fittings, rope handle.
        box(1.2,.94,.7,3,0,-.05);for(const x of [-.39,.39])box(.1,.97,.74,1,x,-.05,0,false);
        for(const y of [-.32,.2])box(1.22,.035,.025,7,0,y,.36,false);
        part(new TorusGeometry(.24,.055,10,28,Math.PI),3,0,.43);collisionBox(.6,.3,.25,0,.55);break;
      case 6: // Architect: two squared ruler arms, hollow middle and graduated marks.
        box(.28,1.7,.2,4,-.58,0);box(1.43,.28,.2,4,.0,-.71);
        for(let i=0;i<7;i++){box(i%2?.09:.17,.025,.02,1,-.55,-.52+i*.19,.113,false);box(.025,i%2?.09:.17,.02,1,-.4+i*.16,-.67,.113,false);}break;
      case 7: // Warlord: steel helmet, black visor, cheek guards and scarlet crest.
        orb(.64,0,0,.05).scale.set(1,.9,.67);box(.94,.16,.14,6,0,-.1,.42,false);
        box(.17,.54,.31,0,-.48,-.4,.1);box(.17,.54,.31,0,.48,-.4,.1);
        box(.16,.66,.64,5,0,.64,-.03);break;
    }
    return {mesh,colliders};
  }
  dispose(){this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}
