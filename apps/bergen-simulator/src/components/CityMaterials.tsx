import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { HERO_BOUNDS } from "../geo/benchmark";

/** Static illustrative finish, never a surveyed facade or architectural texture. */
export function SourceBuildingMaterial({ detail }: { detail: boolean }) {
  const material = useMemo(() => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (detail)
      m.onBeforeCompile = (shader) => {
        shader.uniforms.heroBounds = {
          value: new THREE.Vector4(...HERO_BOUNDS),
        };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 r1World;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nr1World = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 r1World; uniform vec4 heroBounds;",
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
        if(r1World.x >= heroBounds.x && r1World.x <= heroBounds.z && r1World.z >= heroBounds.y && r1World.z <= heroBounds.w) {
          float closeDetail = 1.0 - smoothstep(110.0, 420.0, distance(cameraPosition, r1World));
          float grainCoord = dot(r1World, vec3(1.71, 4.13, 2.37));
          float grain = abs(fract(grainCoord) * 2.0 - 1.0) - 0.5;
          float antialias = 1.0 - smoothstep(0.15, 0.8, fwidth(grainCoord));
          diffuseColor.rgb *= 1.0 + grain * 0.075 * closeDetail * antialias;
        }
      `,
          );
      };
    m.customProgramCacheKey = () =>
      detail ? "bergen-r1-source-grain-v1" : "bergen-source-flat-v1";
    return m;
  }, [detail]);
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={material} attach="material" />;
}

export function WaterMaterial({ detail }: { detail: boolean }) {
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 waterWorld;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nwaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 waterWorld;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        float broad = abs(fract(dot(waterWorld.xz, vec2(0.012, 0.021))) * 2.0 - 1.0);
        float fine = abs(fract(dot(waterWorld.xz, vec2(0.18, -0.11))) * 2.0 - 1.0);
        ${
          detail
            ? `float grazing = 1.0 - abs(normalize(cameraPosition - waterWorld).y);
        grazing *= grazing;
        diffuseColor.rgb *= 0.95 + 0.04 * broad + 0.025 * fine;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.52, 0.56), grazing * 0.48);`
            : "diffuseColor.rgb *= 0.97 + 0.035 * broad + 0.015 * fine;"
        }
      `,
        );
    };
    m.customProgramCacheKey = () =>
      detail ? "bergen-static-water-v4-balanced" : "bergen-static-water-v4-low";
    return m;
  }, [detail]);
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={material} attach="material" />;
}
