import {Vector3} from 'three';

export const SPECTRAL_RAYS=7;
export const PATH_POINTS=8;
// The CPU light paths and GPU surface use the same pose and distance field.
// Wavelengths are in micrometres; Cauchy's approximation describes a dispersive glass.
export const glassIor=(wavelength:number)=>1.45+.022/(wavelength*wavelength);
export function glassDistance(point:Vector3,rotation:Vector3){
  let {x,y,z}=point,c=Math.cos(rotation.x),s=Math.sin(rotation.x);
  [x,y]=[c*x+s*y,-s*x+c*y];c=Math.cos(rotation.y);s=Math.sin(rotation.y);
  [y,z]=[c*y+s*z,-s*y+c*z];c=Math.cos(rotation.z);s=Math.sin(rotation.z);
  [x,z]=[c*x+s*z,-s*x+c*z];
  const angle=Math.atan2(z,x)*.5+.34,radius=Math.hypot(x,z)-1.12;
  c=Math.cos(angle);s=Math.sin(angle);
  // Continuous elliptical ribbon section, identical to the conservative GPU field.
  const qx=(c*radius+s*y)/.36,qy=(-s*radius+c*y)/.145;
  return (Math.hypot(qx,qy)-1)*.145;
}
function normalAt(point:Vector3,rotation:Vector3){
  const epsilon=.0015,value=(x:number,y:number,z:number)=>glassDistance(point.clone().add(new Vector3(x,y,z)),rotation);
  return new Vector3(value(epsilon,0,0)-value(-epsilon,0,0),value(0,epsilon,0)-value(0,-epsilon,0),value(0,0,epsilon)-value(0,0,-epsilon)).normalize();
}
function surface(origin:Vector3,direction:Vector3,rotation:Vector3,inside:boolean,limit:number):Vector3|null{
  let distance=.004,previous=distance;
  for(let i=0;i<200&&distance<limit;i++){
    const point=origin.clone().addScaledVector(direction,distance),signed=glassDistance(point,rotation)*(inside?-1:1);
    if(signed<.00025){
      // Refine the boundary consistently, including a step that crossed the surface.
      let low=previous,high=distance;
      for(let j=0;j<8;j++){const mid=(low+high)*.5;if(glassDistance(origin.clone().addScaledVector(direction,mid),rotation)*(inside?-1:1)>0)low=mid;else high=mid;}
      return origin.clone().addScaledVector(direction,(low+high)*.5);
    }
    previous=distance;distance+=Math.max(.0003,Math.min(.22,signed*.55));
  }
  return null;
}
function refract(direction:Vector3,normal:Vector3,eta:number):Vector3|null{
  const cosine=-normal.dot(direction),discriminant=1-eta*eta*(1-cosine*cosine);
  return discriminant<0?null:direction.clone().multiplyScalar(eta).addScaledVector(normal,eta*cosine-Math.sqrt(discriminant)).normalize();
}
function fresnel(direction:Vector3,normal:Vector3,eta:number){
  const f0=((1-eta)/(1+eta))**2;
  return f0+(1-f0)*(1-Math.min(1,Math.abs(direction.dot(normal))))**5;
}
export class GlassLightPaths{
  private readonly previousRotation=new Vector3(NaN,NaN,NaN);
  readonly source=new Vector3(-4.6,.75,-.1);
  readonly incident=new Vector3(1,-.13,-.055).normalize();
  readonly entry=new Vector3();
  readonly points=Array.from({length:SPECTRAL_RAYS*PATH_POINTS},()=>new Vector3());
  readonly energy=new Float32Array(SPECTRAL_RAYS*PATH_POINTS);
  readonly colors=[new Vector3(.06,.02,.70),new Vector3(.04,.30,.90),new Vector3(.02,.72,.50),new Vector3(.25,.80,.04),new Vector3(.95,.63,.01),new Vector3(1,.22,.01),new Vector3(.85,.025,.01)];
  constructor(){const white=new Vector3();this.colors.forEach(color=>white.add(color));this.colors.forEach(color=>color.divide(white));}
  update(rotation:Vector3){
    if(this.previousRotation.equals(rotation))return false;
    this.previousRotation.copy(rotation);
    // Aim at a point inside the moving ribbon. The first boundary is still solved,
    // not prescribed; the light therefore always reaches the sculpture it illuminates.
    let x=-.97,y=.20,z=0,c=Math.cos(rotation.z),s=Math.sin(rotation.z);
    [x,z]=[c*x-s*z,s*x+c*z];c=Math.cos(rotation.y);s=Math.sin(rotation.y);
    [y,z]=[c*y-s*z,s*y+c*z];c=Math.cos(rotation.x);s=Math.sin(rotation.x);
    [x,y]=[c*x-s*y,s*x+c*y];
    this.incident.set(x,y,z).sub(this.source).normalize();
    const entry=surface(this.source,this.incident,rotation,false,9);
    this.entry.copy(entry??this.source.clone().addScaledVector(this.incident,9));
    this.energy.fill(0);
    for(let band=0;band<SPECTRAL_RAYS;band++){
      const offset=band*PATH_POINTS;
      for(let j=0;j<PATH_POINTS;j++)this.points[offset+j].copy(this.entry);
      if(!entry)continue;
      const wavelength=.43+band*(.27/(SPECTRAL_RAYS-1)),ior=glassIor(wavelength);
      let position=entry.clone(),direction=this.incident.clone(),inside=false,energy=1;
      for(let segment=0;segment<PATH_POINTS-1;segment++){
        let normal=normalAt(position,rotation);if(inside)normal.negate();
        const eta=inside?ior:1/ior,transmitted=refract(direction,normal,eta);
        if(transmitted){energy*=1-fresnel(direction,normal,eta);direction=transmitted;inside=!inside;}
        else direction.reflect(normal).normalize();
        const origin=position.clone().addScaledVector(normalAt(position,rotation),inside?-.001:.001);
        const next=surface(origin,direction,rotation,inside,inside?4:7);
        if(inside&&!next)break;
        const destination=next??position.clone().addScaledVector(direction,7);
        this.points[offset+segment+1].copy(destination);
        this.energy[offset+segment]=energy*(inside?.28:1);
        if(inside)energy*=Math.exp(-.035*position.distanceTo(destination));
        position=destination;
        if(!next){for(let j=segment+2;j<PATH_POINTS;j++)this.points[offset+j].copy(destination);break;}
      }
    }
    return true;
  }
}
