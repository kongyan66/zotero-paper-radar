import assert from "node:assert/strict";
import test from "node:test";
import {
  assignToNearestCentroids,
  clusterProfiles,
} from "../../../src/domain/profiles/profileClustering.ts";

function topicVectors() {
  const centers = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return centers.flatMap((center, topic) =>
    Array.from({ length: 10 }, (_, index) => ({
      id: `${["document", "depth", "longtail"][topic]}-${index}`,
      vector: center.map((value, dimension) =>
        dimension === topic ? value : index * 0.0001,
      ),
    })),
  );
}

test("fixed seed produces identical assignments and centroids", () => {
  const first = clusterProfiles(topicVectors(), { seed: 42, k: 3 });
  const second = clusterProfiles([...topicVectors()].reverse(), {
    seed: 42,
    k: 3,
  });

  assert.deepEqual(first, second);
});

test("three-topic fixture separates document AI, 3D vision, and long-tail", () => {
  const result = clusterProfiles(topicVectors(), { seed: 7, k: 3 });
  const memberships = result.clusters.map((cluster) =>
    cluster.memberIDs.map((id) => id.split("-")[0]),
  );

  assert.equal(result.clusters.length, 3);
  for (const members of memberships) {
    assert.equal(new Set(members).size, 1);
    assert.equal(members.length, 10);
  }
});

test("singleton isolated clusters are folded into an explicit other cluster", () => {
  const vectors = [
    { id: "a1", vector: [1, 0] },
    { id: "a2", vector: [0.99, 0.01] },
    { id: "b1", vector: [0, 1] },
    { id: "b2", vector: [0.01, 0.99] },
    { id: "isolated", vector: [-1, 0] },
  ];
  const result = clusterProfiles(vectors, { seed: 9, k: 3 });

  const other = result.clusters.find((cluster) => cluster.other);
  assert.ok(other);
  assert.deepEqual(other.memberIDs, ["isolated"]);
});

test("nearest-centroid assignment performs N times K distance calls", () => {
  const points = Array.from({ length: 200 }, (_, index) => [index, 1]);
  const centroids = Array.from({ length: 5 }, (_, index) => [index * 10, 1]);
  let calls = 0;
  const assignments = assignToNearestCentroids(points, centroids, () => {
    calls += 1;
  });

  assert.equal(assignments.length, 200);
  assert.equal(calls, 1_000);
  assert.ok(calls < points.length * points.length);
});
