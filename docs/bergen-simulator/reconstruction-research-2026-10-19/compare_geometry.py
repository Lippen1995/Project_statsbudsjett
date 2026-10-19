"""Compare decoded world-space vertex sets, NOT surveyed Bergen accuracy."""
import json
import sys
from pathlib import Path
import numpy as np


def maximum_nearest(a, b):
    worst = 0.0
    for chunk in np.array_split(a, max(1, len(a)//128)):
        nearest = np.sqrt(((chunk[:, None, :] - b[None, :, :])**2).sum(axis=2).min(axis=1))
        worst = max(worst, float(nearest.max()))
    return worst


if __name__ == "__main__":
    folder = Path(sys.argv[1]).resolve()
    root = Path(__file__).resolve().parents[3]
    assert not folder.is_relative_to(root)
    a = np.array(json.loads((folder/'r1c-vertices.json').read_text())).reshape(-1, 3)
    assert len(a) == 3716*3 and np.isfinite(a).all()
    results = {}
    for key in ['indexed', 'meshopt']:
        b = np.array(json.loads((folder/(key+'-vertices.json')).read_text())).reshape(-1, 3)
        assert len(b) == len(a) and np.isfinite(b).all()
        aa, bb = np.unique(a, axis=0), np.unique(b, axis=0)
        distance = max(maximum_nearest(aa, bb), maximum_nearest(bb, aa))
        results[key] = {'triangles': len(b)//3, 'exactExpandedOrder': np.array_equal(a,b),
            'maxSymmetricNearestVertexDistanceMetres': distance,
            'sameVertexCountExpanded': len(a)==len(b), 'thresholdMetres': 0 if key=='indexed' else .002}
        assert distance <= results[key]['thresholdMetres']
    (folder/'geometry-comparison.json').write_text(json.dumps(results, indent=2)+'\n')
    print(json.dumps(results, indent=2))
