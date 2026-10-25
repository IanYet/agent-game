// The visible cut also supplies the interior ray intersections. No texture or
// white diffuse fill is needed to keep a coloured stone legible on the black table.
export const crystalVertex=/* glsl */`
varying vec3 crystalPosition;
varying vec3 crystalNormal;
varying vec3 crystalIncident;
varying mat3 crystalToView;
void main() {
  crystalPosition = position;
  crystalNormal = normal;
  crystalToView = mat3(normalize(modelViewMatrix[0].xyz), normalize(modelViewMatrix[1].xyz), normalize(modelViewMatrix[2].xyz));
  crystalIncident = normalize(vec3(0.0, 0.0, -1.0) * crystalToView);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const crystalFragment=/* glsl */`
uniform vec4 gemPlanes[GEM_PLANES];
uniform vec4 gemEdges[GEM_PLANES];
uniform vec2 gemTable[GEM_OUTLINE];
uniform vec3 gemColor;
uniform float gemIor;
uniform float gemBrilliance;
varying vec3 crystalPosition;
varying vec3 crystalNormal;
varying vec3 crystalIncident;
varying mat3 crystalToView;

bool insideFacet(int index, vec3 point, float margin) {
  if (index == 0) {
    bool inside = false;
    for (int i = 0; i < GEM_OUTLINE; i++) {
      vec2 a = gemTable[i], b = gemTable[(i + 1) % GEM_OUTLINE];
      vec2 segment = b - a;
      vec2 closest = a + segment * clamp(dot(point.xy - a, segment) / dot(segment, segment), 0.0, 1.0);
      if (distance(point.xy, closest) <= margin) return true;
      if ((a.y > point.y) != (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  int ring = (index - 1) % 3;
  float bottom = ring == 0 ? 0.035 : ring == 1 ? -0.035 : -0.48;
  float top = ring == 0 ? 0.27 : ring == 1 ? 0.035 : -0.035;
  vec4 edge = gemEdges[index];
  return point.z >= bottom - margin && point.z <= top + margin
    && edge.x * point.y - edge.y * point.x >= -margin
    && point.x * edge.w - point.y * edge.z >= -margin;
}

// Finite light cards give a moving highlight within a facet, even with the
// table's orthographic camera. They illuminate the stone, never the table.
float lightCard(vec3 origin, vec3 ray, vec3 center, vec2 size) {
  vec3 normal = normalize(center);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
  vec3 up = cross(normal, right);
  float facing = dot(ray, normal);
  if (facing <= 0.001) return 0.0;
  float distance = dot(center - origin, normal) / facing;
  vec3 hit = origin + ray * distance - center;
  vec2 uv = vec2(dot(hit, right), dot(hit, up)) / size;
  vec2 feather = 1.0 - smoothstep(vec2(0.72), vec2(1.0), abs(uv));
  return feather.x * feather.y * (0.78 + 0.22 * (1.0 - clamp(length(uv), 0.0, 1.0)));
}

float studio(vec3 origin, vec3 ray) {
  float broad = pow(max(dot(ray, normalize(vec3(-0.5, 0.8, 0.6))), 0.0), 5.0);
  float side = pow(max(dot(ray, normalize(vec3(0.9, -0.3, 0.4))), 0.0), 9.0);
  float back = pow(max(dot(ray, normalize(vec3(-0.3, 0.2, -1.0))), 0.0), 7.0);
  return 0.12 + broad * 0.8 + side * 0.55 + back * 0.75
    + lightCard(origin, ray, vec3(-1.8, 2.4, 3.2), vec2(0.55, 1.7)) * 2.2
    + lightCard(origin, ray, vec3(2.8, 0.4, 1.6), vec2(0.28, 1.6)) * 1.4
    + lightCard(origin, ray, vec3(-0.35, 0.65, 2.2), vec2(0.22, 0.8)) * 2.0;
}

float exitFacet(vec3 origin, vec3 ray, out vec3 normal) {
  float nearest = 100.0;
  normal = -ray;
  for (int i = 0; i < GEM_PLANES; i++) {
    vec4 plane = gemPlanes[i];
    float facing = dot(plane.xyz, ray);
    if (facing > 0.0001) {
      float distance = -(dot(plane.xyz, origin) + plane.w) / facing;
      if (distance > 0.0001 && distance < nearest && insideFacet(i, origin + ray * distance, 0.0001)) {
        nearest = distance;
        normal = plane.xyz;
      }
    }
  }
  return nearest;
}

float fresnel(float cosine) {
  float f0 = (gemIor - 1.0) / (gemIor + 1.0);
  return f0 * f0 + (1.0 - f0 * f0) * pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
}

vec3 traceInterior(vec3 position, vec3 normal, vec3 incident, vec3 absorption) {
  vec3 ray = refract(incident, normal, 1.0 / gemIor);
  vec3 origin = position + ray * 0.001;
  vec3 throughput = vec3(1.0);
  vec3 interior = vec3(0.0);
  for (int bounce = 0; bounce < 3; bounce++) {
    vec3 exitNormal;
    float distance = exitFacet(origin, ray, exitNormal);
    if (distance > 50.0) break;
    origin += ray * distance;
    throughput *= exp(-absorption * distance);
    vec3 escaped = refract(ray, -exitNormal, gemIor);
    float reflection = 1.0;
    if (dot(escaped, escaped) > 0.01) {
      reflection = fresnel(dot(ray, exitNormal));
      interior += throughput * (1.0 - reflection) * studio(crystalToView * origin, crystalToView * escaped);
    }
    throughput *= reflection;
    ray = reflect(ray, exitNormal);
    origin += ray * 0.001;
  }
  return interior + throughput * studio(crystalToView * origin, crystalToView * ray) * 0.6;
}

void main() {
  vec3 normal = normalize(crystalNormal);
  vec3 incident = normalize(crystalIncident);
  float facing = clamp(dot(-incident, normal), 0.0, 1.0);
  float surfaceFresnel = fresnel(facing);
  float colorPeak = max(max(max(gemColor.r, gemColor.g), gemColor.b), 0.0001);
  vec3 absorption = -log(max(gemColor / colorPeak, vec3(0.035))) * 0.32;
  vec3 pixelX = dFdx(crystalPosition), pixelY = dFdy(crystalPosition);
  vec3 interior = traceInterior(crystalPosition, normal, incident, absorption);
  // MSAA covers the mesh silhouette, but cannot see boundaries created inside
  // a fragment by refraction. Sample the pixel footprint where those rays split.
  vec3 variation = max(abs(dFdx(interior)), abs(dFdy(interior)));
  float contrast = max(variation.r, max(variation.g, variation.b));
  if (contrast > 0.025) {
    vec3 a = pixelX * 0.375 + pixelY * 0.125;
    vec3 b = pixelX * -0.125 + pixelY * 0.375;
    vec3 filtered = (
      traceInterior(crystalPosition + a, normal, incident, absorption)
      + traceInterior(crystalPosition - a, normal, incident, absorption)
      + traceInterior(crystalPosition + b, normal, incident, absorption)
      + traceInterior(crystalPosition - b, normal, incident, absorption)
    ) * 0.25;
    interior = mix(interior, filtered, smoothstep(0.025, 0.08, contrast));
  }
  vec3 viewPosition = crystalToView * crystalPosition;
  vec3 reflected = crystalToView * reflect(incident, normal);
  float reflection = lightCard(viewPosition, reflected, vec3(-1.8, 2.4, 3.2), vec2(0.28, 1.1))
    + lightCard(viewPosition, reflected, vec3(2.8, 0.4, 1.6), vec2(0.16, 1.4)) * 0.65
    + lightCard(viewPosition, reflected, vec3(-0.35, 0.65, 2.2), vec2(0.16, 0.75));
  float edge = pow(1.0 - facing, 3.0);
  vec3 body = gemColor * gemBrilliance * (0.16 + interior * 2.2);
  vec3 polish = vec3(0.88, 0.94, 1.0) * (reflection * (1.4 + surfaceFresnel * 0.8) + edge * 0.05);
  float brilliance = max(interior.r, max(interior.g, interior.b));
  float opacity = clamp(0.58 + min(brilliance, 1.0) * 0.24 + edge * 0.1 + reflection * 0.16, 0.0, 0.94);
  vec3 radiance = body + polish;
  // Compress brightness without the neutral tone mapper's whitening of saturated highlights.
  float peak = max(radiance.r, max(radiance.g, radiance.b));
  radiance *= (1.0 - exp(-peak)) / max(peak, 0.0001);
  gl_FragColor = vec4(radiance, opacity);
  #include <colorspace_fragment>
}
`;
