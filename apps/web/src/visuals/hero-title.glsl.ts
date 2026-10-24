// Transparent scene plate shared by the final hero and its glass transmission.
export default `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_glyph,u_paint;
uniform vec2 u_res;
uniform float u_time,u_progress;
vec3 palette(float p){return .5+.5*cos(6.28318*(vec3(.07,.30,.51)+p));}
vec2 glyphCoverage(vec2 uv,vec2 dx,vec2 dy){
  // Keep the original outline width; the atlas is now twice as detailed.
  vec2 px=vec2(1./2048.,1./1024.);
  float glyph=textureGrad(u_glyph,uv,dx,dy).a;
  float left=textureGrad(u_glyph,uv-vec2(px.x,0.),dx,dy).a;
  float right=textureGrad(u_glyph,uv+vec2(px.x,0.),dx,dy).a;
  float up=textureGrad(u_glyph,uv+vec2(0.,px.y),dx,dy).a;
  float down=textureGrad(u_glyph,uv-vec2(0.,px.y),dx,dy).a;
  return vec2(glyph,clamp(max(max(left,right),max(up,down))-min(min(left,right),min(up,down)),0.,1.));
}
void main(){
  // Translate the whole title by 30% of the viewport as the hero leaves the screen.
  vec2 center=vec2(.50-u_progress*.30,.55+u_progress*.065);
  vec2 textUV=(v_uv-center)/vec2(.90,.89)+.5;
  textUV.x+=(textUV.y-.5)*.055;
  vec2 dx=dFdx(textUV),dy=dFdy(textUV);
  if(any(lessThan(textUV,vec2(0.)))||any(greaterThan(textUV,vec2(1.)))){gl_FragColor=vec4(0.);return;}
  vec4 paint=texture2D(u_paint,v_uv);
  float wave=.5+.5*cos((textUV.x+textUV.y)*4.2+u_time*.33+u_progress*4.);
  vec3 tint=palette(paint.r*.55+paint.g*.65+wave*.22);
  float light=paint.a;
  // Exact OTHER MINDS fill/contour palette, with the original fading pointer paint.
  vec3 fill=mix(vec3(.045,.049,.061)+wave*wave*.015,tint*.36,light*.65);
  vec3 line=mix(vec3(.11,.13,.17)+wave*wave*.075,tint*.7,min(1.,light*3.2));
  vec4 color=vec4(0.);
  // Integrate fill and outline coverage before refraction and final FXAA.
  // Premultiplied accumulation avoids a dark fringe on the outline.
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec2 coverage=glyphCoverage(textUV+dx*(float(x)*.5-.25)+dy*(float(y)*.5-.25),dx,dy);
    float alpha=max(coverage.x,coverage.y);
    color+=vec4(mix(fill,line,coverage.y*.92)*alpha,alpha);
  }
  color*=.25;
  gl_FragColor=vec4(color.rgb/max(color.a,.0001),color.a);
}`;
