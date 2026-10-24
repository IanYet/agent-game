import {AddEquation,BufferAttribute,BufferGeometry,CustomBlending,DynamicDrawUsage,Mesh,OneFactor,ShaderMaterial,Vector2,Vector3} from 'three';
import glassFragment from './glass-hero.glsl';
import {GlassLightPaths,PATH_POINTS,SPECTRAL_RAYS} from './glass-optics';

// The light's geometry is the traced path, not a screen-wide search through every ray.
// Reuse the EXACT field and first-hit solver for depth attenuation under the glass.
const field=glassFragment.slice(0,glassFragment.indexOf('vec3 studio'));
const fragment=field+String.raw`
varying vec3 v_start,v_end,v_color;varying float v_width;
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-u_res)/u_res.y-u_artOffset;
  vec3 rd=normalize(vec3(uv,-3.35)),v=v_end-v_start,w=cameraOrigin-v_start;
  float lengthSquared=dot(v,v),along=dot(rd,v),view=dot(rd,w);
  float segment=clamp((dot(v,w)-along*view)/max(.00001,lengthSquared-along*along),0.,1.);
  float depth=along*segment-view;if(depth<0.)discard;
  float sigma=max(v_width,depth/u_res.y*.7),radius=length(w+rd*depth-v*segment)/sigma;
  if(radius>6.)discard;
  float profile=(exp(-.5*radius*radius)+exp(-radius/3.)*.045)*(1.-smoothstep(5.,6.,radius));
  if(profile<.001)discard;
  vec3 hit;float surfaceDistance;
  if(intersectGlass(cameraOrigin,rd,false,hit,surfaceDistance)&&depth>surfaceDistance+.008)profile*=.24;
  vec2 screen=gl_FragCoord.xy/u_res;
  profile*=smoothstep(0.,.025,screen.x)*smoothstep(0.,.025,1.-screen.x)*smoothstep(0.,.035,screen.y)*smoothstep(0.,.035,1.-screen.y);
  vec3 light=v_color*profile;
  gl_FragColor=vec4(light,max(max(light.r,light.g),light.b));
}`;
const vertex=String.raw`
attribute vec3 a_start,a_end,a_color;attribute float a_width;
varying vec2 v_uv;varying vec3 v_start,v_end,v_color;varying float v_width;
void main(){
  v_start=a_start;v_end=a_end;v_color=a_color;v_width=a_width;v_uv=vec2(0.);
  gl_Position=vec4(position.xy*position.z,0.,position.z);
}`;
const VERTICES=(1+SPECTRAL_RAYS*(PATH_POINTS-1))*6;
export class GlassBeams{
  readonly geometry=new BufferGeometry();
  readonly material:ShaderMaterial;
  readonly mesh:Mesh;
  private readonly position=new Float32Array(VERTICES*3);
  private readonly starts=new Float32Array(VERTICES*3);
  private readonly ends=new Float32Array(VERTICES*3);
  private readonly colors=new Float32Array(VERTICES*3);
  private readonly widths=new Float32Array(VERTICES);
  constructor(rotation:Vector3,artOffset:Vector2){
    for(const [name,array,size] of [['position',this.position,3],['a_start',this.starts,3],['a_end',this.ends,3],['a_color',this.colors,3],['a_width',this.widths,1]] as const)this.geometry.setAttribute(name,new BufferAttribute(array,size).setUsage(DynamicDrawUsage));
    this.geometry.setDrawRange(0,0);
    this.material=new ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{u_res:{value:new Vector2()},u_rotation:{value:rotation},u_artOffset:{value:artOffset}},transparent:true,depthTest:false,depthWrite:false,blending:CustomBlending,blendEquation:AddEquation,blendSrc:OneFactor,blendDst:OneFactor,blendEquationAlpha:AddEquation,blendSrcAlpha:OneFactor,blendDstAlpha:OneFactor});
    this.mesh=new Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.visible=false;
  }
  update(paths:GlassLightPaths,offset:Vector2,width:number,height:number){
    (this.material.uniforms.u_res.value as Vector2).set(width,height);
    let at=0;const aspect=width/height;
    const project=(p:Vector3)=>{const w=5.1-p.z;return {x:(p.x*3.35/w+offset.x)/aspect,y:(p.y-.03)*3.35/w+offset.y,w};};
    const add=(start:Vector3,end:Vector3,color:Vector3,energy:number,radius:number)=>{
      if(energy<.0001||start.distanceToSquared(end)<.00001)return;
      const a=start.clone(),b=end.clone(),near=4.65;
      if(a.z>near&&b.z>near)return;
      if(a.z>near)a.lerp(b,(a.z-near)/(a.z-b.z));
      if(b.z>near)b.lerp(a,(b.z-near)/(b.z-a.z));
      const p=project(a),q=project(b),dx=(q.x-p.x)*aspect,dy=q.y-p.y,length=Math.hypot(dx,dy);
      if(length<.00001)return;
      const tx=dx/length,ty=dy/length,nx=-ty,ny=tx,ra=radius*3.35/p.w*6.5,rb=radius*3.35/q.w*6.5;
      const corners=[{x:p.x+(-tx-nx)*ra/aspect,y:p.y+(-ty-ny)*ra,w:p.w},{x:p.x+(-tx+nx)*ra/aspect,y:p.y+(-ty+ny)*ra,w:p.w},{x:q.x+(tx-nx)*rb/aspect,y:q.y+(ty-ny)*rb,w:q.w},{x:q.x+(tx+nx)*rb/aspect,y:q.y+(ty+ny)*rb,w:q.w}];
      for(const index of [0,2,1,1,2,3]){
        const c=corners[index],j=at*3;
        this.position.set([c.x,c.y,c.w],j);this.starts.set(a.toArray(),j);this.ends.set(b.toArray(),j);this.colors.set([color.x*energy,color.y*energy,color.z*energy],j);this.widths[at]=radius;at++;
      }
    };
    add(paths.source,paths.entry,new Vector3(1,.985,.96),.75,.012);
    for(let band=0;band<SPECTRAL_RAYS;band++)for(let segment=0;segment<PATH_POINTS-1;segment++){const i=band*PATH_POINTS+segment;add(paths.points[i],paths.points[i+1],paths.colors[band],paths.energy[i]*.65,.024);}
    for(const attribute of Object.values(this.geometry.attributes))attribute.needsUpdate=true;
    this.geometry.setDrawRange(0,at);
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}
