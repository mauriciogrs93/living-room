"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { DOG_SPOTS, stagePose } from "@/lib/room/layout";
import { dogWander, motionPoint, route, samplePath } from "@/lib/room/paths";
import type { PublicAgent, PublicDog } from "@/lib/room/types";
import { Tap, useScene } from "./furniture-kit";

function agentAt(agent: PublicAgent, now: number) {
  if (!agent.motion) return { x: agent.position.x, z: agent.position.z };
  const at = motionPoint(agent.motion.path, agent.motion.from, agent.motion.to, agent.motion.startedAt, agent.motion.arriveAt, now);
  return { x: at.x, z: at.z };
}

export function HouseDog({ dog, agents, skew }: { dog: PublicDog; agents: PublicAgent[]; skew: number }) {
  const { onTapDog } = useScene();
  const group = useRef<Group>(null);
  const tail = useRef<Mesh>(null);
  const yaw = useRef(0.4);
  const prev = useRef({ x: dog.x, z: dog.z });
  useFrame(({ clock }) => {
    const now = Date.now() + skew;
    const wander = dogWander(now);
    let x = wander.x;
    let z = wander.z;
    let nap = dog.mode === "nap" || (dog.mode !== "follow" && dog.mode !== "fetch" && dog.mode !== "bark" && wander.mode === "nap");
    if (dog.mode === "nap") {
      x = dog.x;
      z = dog.z;
      nap = true;
    }
    if (dog.mode === "follow" && dog.followId && dog.since && now < dog.since + 22_000) {
      const agent = agents.find((item) => item.id === dog.followId);
      if (agent) {
        const who = agentAt(agent, now);
        const u = Math.min(1, (now - dog.since) / 4000);
        const at = samplePath(route(wander, { x: who.x + 0.28, z: who.z - 0.22 }), u);
        x = at.x;
        z = at.z;
        nap = false;
      }
    }
    if (dog.mode === "fetch" && dog.fetchUntil && dog.since && now < dog.fetchUntil) {
      const span = Math.max(1, dog.fetchUntil - dog.since);
      const u = Math.min(1, (now - dog.since) / span);
      const back = u > 0.55;
      const leg = back ? (u - 0.55) / 0.45 : u / 0.55;
      const agent = agents.find((item) => item.id === dog.followId);
      const who = agent ? agentAt(agent, now) : wander;
      const toy = DOG_SPOTS[0] ?? { x: -1.7, z: 10.1 };
      const at = samplePath(route(back ? toy : who, back ? who : toy), leg);
      x = at.x;
      z = at.z;
      nap = false;
    }
    const dx = x - prev.current.x;
    const dz = z - prev.current.z;
    if (dx * dx + dz * dz > 1e-6) yaw.current = Math.atan2(dx, dz);
    const moving = dx * dx + dz * dz > 1e-5;
    prev.current = { x, z };
    const staged = stagePose(x, z);
    const bob = moving && !nap ? Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.025 : 0;
    if (group.current) {
      group.current.position.set(staged.x, staged.y + (nap ? 0.08 : 0.16) + bob, staged.z);
      group.current.rotation.set(0, yaw.current, nap ? Math.PI / 2 : 0);
    }
    if (tail.current) tail.current.rotation.z = Math.sin(clock.elapsedTime * (dog.mode === "fetch" ? 10 : 4)) * 0.5;
  });
  const staged = stagePose(dog.x, dog.z);
  const nap = dog.mode === "nap";
  return (
    <Tap onTap={onTapDog}>
      <group ref={group} position={[staged.x, staged.y + 0.16, staged.z]}>
        <mesh position={[0, 0.08, 0]} raycast={() => null}>
          <capsuleGeometry args={[0.09, 0.22, 4, 8]} />
          <meshStandardMaterial color="#c4a574" roughness={0.72} />
        </mesh>
        <mesh position={[0.22, nap ? 0.12 : 0.18, 0.08]}>
          <sphereGeometry args={[0.09, 12, 10]} />
          <meshStandardMaterial color="#d8bc8a" roughness={0.7} />
        </mesh>
        <mesh position={[0.26, nap ? 0.14 : 0.22, 0.12]} raycast={() => null}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshStandardMaterial color="#2c241e" />
        </mesh>
        <mesh ref={tail} position={[-0.18, 0.14, 0]} rotation={[0, 0, 0.8]} raycast={() => null}>
          <capsuleGeometry args={[0.02, 0.12, 4, 6]} />
          <meshStandardMaterial color="#a68455" />
        </mesh>
        {!nap &&
          [
            [0.08, 0, 0.06],
            [0.08, 0, -0.06],
            [-0.08, 0, 0.06],
            [-0.08, 0, -0.06],
          ].map((pos) => (
            <mesh key={pos.join()} position={pos as [number, number, number]} raycast={() => null}>
              <cylinderGeometry args={[0.02, 0.02, 0.1, 6]} />
              <meshStandardMaterial color="#b08968" />
            </mesh>
          ))}
      </group>
    </Tap>
  );
}
