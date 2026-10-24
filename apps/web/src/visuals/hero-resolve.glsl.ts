// Remove isolated, subpixel specular spikes before the contour reconstruction.
// A continuous highlight has support on both sides; an isolated sparkle does not.
export default `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_frame,u_scene;
uniform vec2 u_step;
float highlightLuma(vec3 color){return dot(color,vec3(.299,.587,.114));}
void main(){
  vec4 center=texture2D(u_frame,v_uv);
  float support=0.;
  vec2 axes[4]=vec2[4](vec2(1.,0.),vec2(0.,1.),vec2(1.,1.),vec2(1.,-1.));
  for(int i=0;i<4;i++){
    vec2 offset=axes[i]*u_step;
    float a=highlightLuma(texture2D(u_frame,v_uv+offset).rgb);
    float b=highlightLuma(texture2D(u_frame,v_uv-offset).rgb);
    support=max(support,min(a,b));
  }
  float light=highlightLuma(center.rgb),limit=support*1.25+.008;
  float addedLight=light-highlightLuma(texture2D(u_scene,v_uv).rgb);
  // The unlit title belongs to the scene plate: leave its fine lines to FXAA.
  float outlier=smoothstep(.01,.06,light-limit)*smoothstep(.015,.04,addedLight);
  center.rgb*=mix(1.,min(1.,limit/max(light,.0001)),outlier);
  // Both this target and the following FXAA pass use premultiplied alpha.
  gl_FragColor=center;
}`;
