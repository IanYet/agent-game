// Geometric optics on the same Mobius field as glass-optics.ts.
// Scene-plate projection, mip footprints and rim filtering informed by React Bits FluidGlass.
// Source and adaptation notes: public/licenses/NOTICE.txt; license: public/licenses/FluidGlass.md.
export default `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_res,u_artOffset;
uniform vec3 u_rotation;
const vec3 cameraOrigin=vec3(0.,.03,5.1);
const vec3 pageColor=vec3(.035294,.039216,.05098);
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float scene(vec3 p){
  p.xy=rot(u_rotation.x)*p.xy;
  p.yz=rot(u_rotation.y)*p.yz;
  p.xz=rot(u_rotation.z)*p.xz;
  float a=atan(p.z,p.x);
  vec2 q=rot(a*.5+.34)*vec2(length(p.xz)-1.12,p.y);
  return (length(q/vec2(.36,.145))-1.)*.145;
}
vec3 normalAt(vec3 p){
  vec2 e=vec2(.0015,0.);
  return normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy),scene(p+e.yxy)-scene(p-e.yxy),scene(p+e.yyx)-scene(p-e.yyx)));
}
bool intersectGlass(vec3 origin,vec3 direction,bool inside,out vec3 hit,out float travel){
  float b=dot(origin,direction),c=dot(origin,origin)-2.4964,disc=b*b-c;
  travel=.003;
  if(disc<0.){hit=origin;return false;}
  float end=-b+sqrt(disc);
  if(!inside)travel=max(travel,-b-sqrt(disc));
  float previous=travel;
  for(int i=0;i<128;i++){
    float d=scene(origin+direction*travel)*(inside?-1.:1.);
    if(d<.00032){
      float low=previous,high=travel;
      for(int j=0;j<5;j++){float mid=(low+high)*.5;if(scene(origin+direction*mid)*(inside?-1.:1.)>0.)low=mid;else high=mid;}
      travel=(low+high)*.5;hit=origin+direction*travel;return true;
    }
    previous=travel;travel+=clamp(d*.78,.0003,.19);
    if(travel>end+.006)break;
  }
  hit=origin+direction*travel;return false;
}
float cardIntegral(float x,float inner,float outer){
  float a=abs(x),width=outer-inner,t=clamp((a-inner)/width,0.,1.);
  return sign(x)*(min(a,inner)+width*(t-t*t*t+.5*t*t*t*t));
}
float filteredCard(float x,float inner,float outer,float footprint){
  float halfWidth=max(.001,footprint*.5);
  return clamp((cardIntegral(x+halfWidth,inner,outer)-cardIntegral(x-halfWidth,inner,outer))/(2.*halfWidth),0.,1.);
}
vec3 studio(vec3 r,float footprint){
  // Smooth angular studio cards, following Fluid Glass's high-radiance lighting.
  // Their reflected shape gives polished glass a crisp, continuous highlight.
  vec2 angle=vec2(atan(r.x,r.z),r.y);
  // Integrate the studio cards over the ray's angular footprint. Filtering only
  // the backdrop leaves refracted studio highlights as undersampled color wires.
  float angularWidth=footprint/max(.12,length(r.xz));
  float key=filteredCard(angle.x+.62,.24,.45,angularWidth)*filteredCard(angle.y-.5,.12,.32,footprint);
  float strip=filteredCard(angle.x-.95,.05,.14,angularWidth)*filteredCard(angle.y-.05,.35,.8,footprint);
  return vec3(12.)*key+vec3(6.)*strip+vec3(.025+.055*smoothstep(0.,1.,r.z));
}
float ior(float wavelength){return 1.45+.022/(wavelength*wavelength);}
vec2 projected(vec3 p){
  vec2 plane=(p.xy-cameraOrigin.xy)*3.35/max(.01,cameraOrigin.z-p.z)+u_artOffset;
  return .5+plane*u_res.y/(2.*u_res);
}
struct Transmission{vec2 uv;vec3 direction;float throughput;float escaped;};
Transmission traceTransmission(vec3 p,vec3 incoming,vec3 normal,float index){
  Transmission tr;tr.uv=v_uv;tr.direction=incoming;tr.throughput=1.;tr.escaped=0.;
  vec3 direction=refract(incoming,normal,1./index),position=p-normal*.003;
  float throughput=1.;bool inside=true;
  for(int bounce=0;bounce<6;bounce++){
    vec3 boundary;float thickness;
    if(!intersectGlass(position,direction,inside,boundary,thickness)){
      // An unfinished internal path has not reached the studio. Treating it as
      // escaped injects bright, wavelength-dependent pinpricks along TIR bands.
      tr.direction=direction;tr.throughput=inside?0.:throughput;
      if(!inside&&direction.z<-.001){tr.uv=projected(position+direction*((-2.1-position.z)/direction.z));tr.escaped=1.;}
      return tr;
    }
    if(inside)throughput*=exp(-.035*thickness);
    vec3 outward=normalAt(boundary),inward=inside?-outward:outward;
    float eta=inside?index:1./index;
    vec3 next=refract(direction,inward,eta);
    if(dot(next,next)>.0001){
      // At the critical angle transmission approaches zero continuously. An
      // unweighted switch from refraction to TIR produces saturated thin bands.
      float ci=abs(dot(direction,inward)),ct=abs(dot(next,inward));
      float rs=(eta*ci-ct)/max(.00001,eta*ci+ct),rp=(ci-eta*ct)/max(.00001,ci+eta*ct);
      throughput*=1.-.5*(rs*rs+rp*rp);
      direction=next;inside=!inside;
    }
    else direction=reflect(direction,inward);
    position=boundary+outward*(inside?-.003:.003);
  }
  tr.direction=direction;tr.throughput=0.;return tr;
}
vec3 transmittedLight(Transmission tr,vec2 dx,vec2 dy,float footprint){
  // Gradients come from the primary ray, outside all divergent and subpixel loops.
  vec4 plate=textureGrad(u_scene,tr.uv,dx,dy);
  float valid=step(0.,tr.uv.x)*step(0.,tr.uv.y)*step(tr.uv.x,1.)*step(tr.uv.y,1.);
  vec3 content=plate.rgb*valid+pageColor*(1.-plate.a*valid);
  return mix(studio(tr.direction,footprint),content,tr.escaped)*tr.throughput;
}
struct GlassSample{
  float hit;float distance;float facing;vec3 direction;vec3 normal;
  Transmission red;Transmission green;Transmission blue;
};
GlassSample traceSample(vec2 pixel){
  GlassSample surfaceSample;
  vec2 uv=(pixel*2.-u_res)/u_res.y-u_artOffset;
  surfaceSample.direction=normalize(vec3(uv,-3.35));
  vec3 p;float travel;
  bool hit=intersectGlass(cameraOrigin,surfaceSample.direction,false,p,travel);
  surfaceSample.hit=hit?1.:0.;surfaceSample.distance=hit?travel:100.;
  surfaceSample.normal=hit?normalAt(p):vec3(0.,0.,1.);
  surfaceSample.facing=clamp(dot(surfaceSample.normal,-surfaceSample.direction),0.,1.);
  Transmission empty;empty.uv=pixel/u_res;empty.direction=surfaceSample.direction;empty.throughput=1.;empty.escaped=0.;
  surfaceSample.red=empty;surfaceSample.green=empty;surfaceSample.blue=empty;
  // Unresolved grazing detail is integrated by the rim filter, as in Fluid Glass.
  if(hit&&surfaceSample.facing>.14){
    surfaceSample.red=traceTransmission(p,surfaceSample.direction,surfaceSample.normal,ior(.68));
    surfaceSample.green=traceTransmission(p,surfaceSample.direction,surfaceSample.normal,ior(.55));
    surfaceSample.blue=traceTransmission(p,surfaceSample.direction,surfaceSample.normal,ior(.43));
  }
  return surfaceSample;
}
vec4 shadeSample(GlassSample surfaceSample,vec2 pixel,vec2 rdx,vec2 rdy,vec2 gdx,vec2 gdy,vec2 bdx,vec2 bdy,vec4 angularFootprint){
  vec2 uv=pixel/u_res;
  vec4 background=texture2D(u_scene,uv);
  vec3 color=background.rgb;float alpha=background.a;
  if(surfaceSample.hit>.5){
    float index=ior(.55),f0=pow((index-1.)/(index+1.),2.);
    float fresnel=f0+(1.-f0)*pow(1.-surfaceSample.facing,5.);
    vec3 redLight=transmittedLight(surfaceSample.red,rdx,rdy,angularFootprint.r);
    vec3 greenLight=transmittedLight(surfaceSample.green,gdx,gdy,angularFootprint.g);
    vec3 blueLight=transmittedLight(surfaceSample.blue,bdx,bdy,angularFootprint.b);
    vec3 transmission=vec3(redLight.r,greenLight.g,blueLight.b);
    vec2 footprint=abs(gdx)+abs(gdy);
    vec4 average=textureLod(u_scene,uv,5.);
    float angularSpread=max(angularFootprint.r,max(angularFootprint.g,angularFootprint.b));
    // A whole RGB footprint must agree on the same reconstruction. Resolving
    // each wavelength independently turns subpixel TIR detail into colored wires.
    float band=max(max(1.-smoothstep(.14,.43,surfaceSample.facing),smoothstep(.028,.16,length(footprint))),smoothstep(.018,.09,angularSpread));
    transmission=mix(transmission,average.rgb+pageColor*(1.-average.a),band);
    color=transmission*(1.-fresnel)+studio(reflect(surfaceSample.direction,surfaceSample.normal),angularFootprint.a)*fresnel;
    alpha=1.;
  }
  return vec4(color,alpha);
}
void main(){
  vec2 pixel=gl_FragCoord.xy;
  GlassSample primary=traceSample(pixel);
  // Derivatives are calculated unconditionally; no derivative lives in a TIR loop.
  vec2 rdx=dFdx(primary.red.uv),rdy=dFdy(primary.red.uv);
  vec2 gdx=dFdx(primary.green.uv),gdy=dFdy(primary.green.uv);
  vec2 bdx=dFdx(primary.blue.uv),bdy=dFdy(primary.blue.uv);
  vec3 reflection=reflect(primary.direction,primary.normal);
  vec4 angularFootprint=vec4(
    length(dFdx(primary.red.direction))+length(dFdy(primary.red.direction)),
    length(dFdx(primary.green.direction))+length(dFdy(primary.green.direction)),
    length(dFdx(primary.blue.direction))+length(dFdy(primary.blue.direction)),
    length(dFdx(reflection))+length(dFdy(reflection)));
  vec4 color=shadeSample(primary,pixel,rdx,rdy,gdx,gdy,bdx,bdy,angularFootprint);
  float contour=fwidth(primary.hit);
  float rim=primary.hit*(1.-smoothstep(.24,.56,primary.facing));
  float projection=primary.hit*smoothstep(.018,.10,length(abs(gdx)+abs(gdy)));
  float specular=smoothstep(.04,.18,max(max(angularFootprint.r,angularFootprint.g),max(angularFootprint.b,angularFootprint.a)));
  if(max(max(contour,specular),max(rim,projection))>.08){
    // Four REAL rays per edge pixel, including new surface hits, normals and
    // wavelength paths. This is spatial integration, not a blur over one jagged ray.
    vec2 offsets[3]=vec2[3](vec2(.33,.33),vec2(-.33,.25),vec2(.25,-.33));
    for(int i=0;i<3;i++){
      vec2 subPixel=pixel+offsets[i];
      GlassSample sub=traceSample(subPixel);
      color+=shadeSample(sub,subPixel,rdx,rdy,gdx,gdy,bdx,bdy,angularFootprint);
    }
    color*=.25;
  }
  gl_FragColor=vec4(color.rgb/max(color.a,.0001),color.a);
}
`;
