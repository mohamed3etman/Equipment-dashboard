"""Poster helpers: (1) align hero clip IMG_9872 to the supplied poster design (the poster is a frame of
that shot), (2) build a text-free clean plate of the poster so its typography can be animated.
Usage: python3 prepare_assets.py <assetsdir> <workdir>"""
import sys, cv2, numpy as np
A, Wd = sys.argv[1], sys.argv[2]
P = cv2.imread(f'{A}/poster.jpg')
cap = cv2.VideoCapture(f'{Wd}/IMG_9872_sdr.mp4')
cap.set(cv2.CAP_PROP_POS_FRAMES, 150); ok, F = cap.read()
orb = cv2.ORB_create(4000)
g1, g2 = cv2.cvtColor(F, cv2.COLOR_BGR2GRAY), cv2.cvtColor(P, cv2.COLOR_BGR2GRAY)
m2 = np.full_like(g2, 255); m2[420:960, :] = 0                      # ignore typography
k1, d1 = orb.detectAndCompute(g1, None); k2, d2 = orb.detectAndCompute(g2, m2)
ms = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
a = np.float32([k1[m.queryIdx].pt for m in ms]); b = np.float32([k2[m.trainIdx].pt for m in ms])
M, inl = cv2.estimateAffinePartial2D(a, b, ransacReprojThreshold=4)
print('align inliers', int(inl.sum()), 'scale', np.hypot(M[0, 0], M[1, 0]))
np.save(f'{Wd}/align.npy', M)
# clean plate
L = cv2.cvtColor(P, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
Lb = cv2.cvtColor(cv2.medianBlur(P, 61), cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
m = np.zeros(L.shape, np.uint8)
y0, y1, x0, x1 = 430, 920, 230, 1110
m[y0:y1, x0:x1] = ((Lb - L)[y0:y1, x0:x1] > 8) * 255
md = cv2.dilate(m, np.ones((11, 11), np.uint8))
clean = cv2.inpaint(P, md, 21, cv2.INPAINT_TELEA)
bl = cv2.GaussianBlur(clean, (0, 0), 12)
w = cv2.GaussianBlur(cv2.dilate(md, np.ones((25, 25), np.uint8)), (0, 0), 8).astype(np.float32)[..., None] / 255
cv2.imwrite(f'{Wd}/poster_clean.png', (clean * (1 - w) + bl * w).astype(np.uint8))
