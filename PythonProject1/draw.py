import matplotlib.pyplot as plt
import os

pose_file = os.path.join("poses", "pose_0005.txt")

points = []
with open(pose_file, 'r') as f:
    for line in f:
        x, y, z, v = map(float, line.strip().split(','))
        points.append((x, y))

xs, ys = zip(*points)
plt.figure(figsize=(5, 8))
plt.scatter(xs, ys, c='red')
plt.gca().invert_yaxis()
plt.title(f"Pose keypoints from {pose_file}")
plt.show()