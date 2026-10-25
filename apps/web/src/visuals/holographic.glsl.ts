/*
 * Material adapted from vgpu's Holographic Card (WGSL → GLSL).
 * https://vgpu.sh/examples/holographic-card/source.md
 *
 * MIT License
 * Copyright (c) 2025 Vercel, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export const HOLOGRAPHIC_VERTEX=`#version 300 es
void main(){
  vec2 vertices[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
  gl_Position=vec4(vertices[gl_VertexID],0.,1.);
}`;

// Only the material is rendered here. Points, discounts and costs stay in the DOM.
export const HOLOGRAPHIC_FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform vec2 uCssSize;
uniform vec2 uPointer;
uniform vec3 uHaloColor;
uniform float uRainbow;
uniform float uEngravedPattern;
uniform sampler2D uEngraving;
out vec4 outColor;

vec3 wavelengthColor(float wavelength){
  vec3 response=(vec3(wavelength)-vec3(.610,.545,.460))/vec3(.045,.038,.032);
  float visible=smoothstep(.380,.410,wavelength)*(1.-smoothstep(.700,.780,wavelength));
  return exp(-.5*response*response)*visible;
}

vec3 diffraction(vec2 across,vec2 lightAndView){
  float pathDifference=1.65*abs(dot(lightAndView,across));
  float along=dot(lightAndView,vec2(-across.y,across.x));
  vec3 reflected=vec3(0.);
  for(int order=1;order<=3;order++){
    float m=float(order);
    reflected+=wavelengthColor(pathDifference/m)/(m*m);
  }
  return reflected*exp(-along*along/.36);
}

vec3 pearlColor(float phase){
  vec3 rainbow=vec3(.55,.52,.64)+vec3(.43,.40,.34)*cos(6.2831853*(phase+vec3(.05,.38,.63)));
  vec3 metal=uHaloColor*(.78+.22*cos(6.2831853*phase));
  return mix(metal,rainbow,uRainbow);
}

float grain(vec2 point){
  uvec2 p=uvec2(abs(point)*2400.);
  uint n=(p.x*1597334677u)^(p.y*3812015801u);
  n=(n^(n>>16u))*2246822519u;
  return float(n&1023u)/1023.-.5;
}

float etchedPhase(vec2 p){
  vec2 warp=vec2(sin(p.y*7.+sin(p.x*4.))*.085,sin(p.x*6.-p.y*3.)*.07);
  vec2 q=p+warp-vec2(.13,.08);
  float radius=length(q*vec2(1.,.76));
  // Seven CSS pixels between grooves, independent of card size and display DPR.
  float frequency=3.14159265*uCssSize.x/(1.28*7.);
  return radius*frequency+sin(atan(q.y,q.x)*3.+radius*8.)*1.7;
}

void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  uv.y=1.-uv.y;
  vec2 halfSize=vec2(.64,.64*uResolution.y/uResolution.x);
  vec2 p=(uv-.5)*halfSize*2.;
  vec2 lightCenter=uPointer*halfSize;
  vec2 delta=p-lightCenter;
  float sweep=delta.x*.72+delta.y*.52+sin(p.y*4.+p.x*3.)*.08;
  float band=exp(-pow(sweep/.36,2.));
  float glint=exp(-pow(sweep/.085,2.));
  float spotlight=exp(-dot(delta*vec2(1.05,.72),delta*vec2(1.05,.72))*2.6);
  float light=band*spotlight;
  vec3 lightDirection=normalize(vec3(lightCenter-p,1.2));
  vec3 viewDirection=normalize(vec3(-p,4.5));
  vec2 lightAndView=(lightDirection+viewDirection).xy+uPointer*.12;
  float illumination=max(lightDirection.z,0.)*viewDirection.z;
  float noise=grain(p+2.);
  vec3 tint=mix(uHaloColor,vec3(.72,.76,.8),uRainbow);
  vec3 color=vec3(.062,.068,.078)+.008*(.9-p.y);
  color+=noise*(.008+light*.03);
  color+=light*(vec3(.045)+tint*.065);

  vec4 engraving=texture(uEngraving,uv);

  float contour=etchedPhase(p);
  vec2 dx=dFdx(p),dy=dFdy(p);
  vec2 gradient=vec2(dFdx(contour)*dy.y-dFdy(contour)*dx.y,dFdy(contour)*dx.x-dFdx(contour)*dy.x);
  vec2 across=gradient/max(length(gradient),.00000001);
  float phasePerPixel=max(length(vec2(dFdx(contour),dFdy(contour))),.0001);
  float distanceToGroove=abs(fract(contour/3.14159265+.5)-.5)*3.14159265/phasePerPixel;
  float dpr=uResolution.x/uCssSize.x;
  float contours=1.-smoothstep(.25*dpr,.25*dpr+.65,distanceToGroove);
  float phase=dot(lightAndView,vec2(.48,-.32))+p.y*.32+contour*.003;
  vec3 outerPearl=pearlColor(phase),innerPearl=pearlColor(phase+.12);
  vec3 diffracted=diffraction(across,lightAndView)*illumination*uRainbow;
  vec3 pearl=(outerPearl+innerPearl)*.5;
  float reveal=.14*spotlight+light*1.15;
  color+=pearl*light*.24;
  color+=(pearl*.5+vec3(.5))*glint*spotlight*.12;
  vec3 outerFoil=vec3(.12,.14,.18)+outerPearl*.65+diffracted*.12;
  float etching=mix(contours*.6,engraving.r*.85,uEngravedPattern);
  color+=etching*outerFoil*reveal;
  outColor=vec4(color,1.);
}`;
