# 坐标、公式与软件边界

本页整理自 v6 的模型与公式。v7 补强校验，不把未建模的镜片物理特性加入几何公式。

## 坐标约定

相机理想投影中心 `C=(0,0,0)`；光轴沿 z 向上。r 是到旋转轴的距离。镜面朝向下方相机。a、b、r、z、焦距 f 等长度用 mm，像素间距 p 用 μm，UI 角度用 degree；微分计算内部以 radian 为基础。

`C` 不是 PCB、传感器平面或镜筒前端。有效视点 `V` 也不是一个额外的真实镜头。

## 主要关系

```text
a = s a₀, b = s b₀
c = sqrt(a² + b²)
C = (0,0,0), V = (0,0,2c)
z(r) = c + a sqrt(1 + r²/b²)

θ(r) = atan2(z(r) - 2c, r)
r(θ) = b² cosθ / (a - c sinθ)
-90° < θ < atan(a/b)

D = 2 R
h₀ = c + a
h_rim = z(R)
sag = h_rim - h₀

fpx ≈ 1000 f / p             [仅原生采样、方形像素估算]
ρ(r) = fpx r / z(r)
W_sensor = Nx p / 1000
H_sensor = Ny p / 1000
L = (min(Nx,Ny)-1)/2 - margin
完整保边距条件：ρmax ≤ L
安全余量：L - ρmax

z' = ar / (b² sqrt(1+r²/b²))
dρ/dr = fpx (z-rz')/z²
dθ/dr = (rz'-(z-2c)) / (r²+(z-2c)²)
Qφ = ρ π/180
Qθ = |(dρ/dr)/(dθ/dr)| π/180   [px/degree]
```

同轴相似缩放 a、b、r、z、c 不改变 r/z，因此不改变给定相机下的理想圆环大小。但实际镜头的有限孔径、对焦、支架和制造精度不会随此几何推导自动缩放。

按半径截取时允许内半径为 0；这对应轴上的退化方向。轴上方位角没有唯一意义，`azimuthDegPerPx` 可为 Infinity。普通探针计算避开角带端点；不要把这个几何退化点当成数值精度承诺。

## 装调与全景

装调页从偏移后的 C′ 发出反向光线，用局部法线计算 `w=u-2(u·n)n`；只对二维轴截面采样。其他页面继续使用理想中心模型，不能把装调页的误差直接解释成三维精度。

等俯仰展开对每一行指定外界角度，再经 θ→r→ρ 映射回原图。线性圆环展开只是半径均匀采样，不等于俯仰均匀。姿态校正只重排已经看见的方向，不恢复离开视场的区域。

## v7 软件计算域（不是硬件限制）

| 参数 | 允许的软件输入范围 |
|---|---|
| a₀、b₀ | 0.001–1000 mm |
| s | 0.001–1000 |
| f | 0.001–10000 mm |
| p | 0.001–1000 μm |
| 标定 fpx | 0.001–100000000 px |
| Nx、Ny、展开 W | 16–16384 的整数 |
| margin | 0–8191 px，并严格小于画幅短边的一半 |
| θmin、θmax | -89.99999–89.99999°，并满足顺序和双曲面渐近角限制 |
| rin₀、R₀ | rin₀ 为 0–10000 mm，R₀ 为 0.001–10000 mm，且 R₀>rin₀ |
| 方向探针 | -90–90°；渲染时落在有效角带内 |
| 航向 / 倾斜 | ±180° / ±85°；默认滑块只给常用范围 |
| Δx、Δz | ±1000 mm |

这些范围仅为通用数值防护，大部分显然不适合微型机器人。即使输入处于这些范围，派生结果不稳定、非有限或镜面半径超过软件稳定域时仍会拒绝计算。正常相机参数不依靠这些范围选择。

## 来源与证据边界

双焦点中心式条件与基础光学依据：
- Baker & Nayar, *A Theory of Single-Viewpoint Catadioptric Image Formation*, IJCV, 1999: https://www.cs.columbia.edu/CAVE/publications/pdfs/Baker_IJCV99.pdf
- OpenCV, camera projection and calibration: https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html
- OpenCV, omnidirectional calibration: https://docs.opencv.org/4.13.0/dd/d12/tutorial_omnidir_calib_main.html

闭式公式采用本工具明示的坐标约定；不应将其他论文的同名字母直接混用。以上链接继承自原工具参考资料，本次功能修改没有重新核验硬件数据或部署兼容性。
