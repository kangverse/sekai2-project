/**
 * 世界模型数据可视化工具 — Three.js 相机轨迹渲染
 *
 * 功能：
 * - 3D 相机轨迹线
 * - 相机锥体 (Frustum) 显示
 * - 当前帧高亮指示器（与视频同步）
 * - 坐标轴辅助
 * - OrbitControls 旋转/缩放
 * - 摇杆 (Joystick) Canvas 2D 可视化
 */

class PoseViewer {
    constructor(containerEl) {
        this.container = containerEl;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // 轨迹数据
        this.trajectoryData = null;
        this.positions = [];
        this.forwardVectors = [];

        // Three.js 对象
        this.trajectoryLine = null;
        this.frustumGroup = null;
        this.currentFrameMarker = null;

        // 选项
        this.showFrustums = true;
        this.showTrajectory = true;
        this.followMode = false;
        this.progressHighlight = true;
        this.showDirection = true;

        // 当前帧
        this.currentFrame = 0;

        // 摇杆叠加层
        this.joystickOverlayCanvas = null;
        this.joystickOverlayCtx = null;
        this.translationJoystick = null;  // [[x,y], ...] per frame
        this.rotationJoystick = null;     // [[x,y], ...] per frame

        // 视频叠加层
        this.overlayCanvas = null;
        this.overlayCtx = null;

        // 视频轨迹投影叠加层
        this.traceCanvas = null;
        this.traceCtx = null;
        this.intrinsics = null;   // {fx, fy, cx, cy}
        this.worldTrace = null;   // [[x,y,z], ...] 每帧光轴前方点的世界坐标

        this._animationId = null;
        this._resizeHandler = null;
    }

    /**
     * 初始化 Three.js 场景
     */
    init() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight || (width * 9 / 16);

        // 场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // 相机
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 100);
        this.camera.position.set(2, 2, 2);
        this.camera.lookAt(0, 0, 0);

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        // The synchronized viewer starts in a camera-aligned chase view. As
        // soon as the reader drags the scene, return full control to OrbitControls.
        this.controls.addEventListener('start', () => { this.followMode = false; });

        // 坐标轴
        const axes = new THREE.AxesHelper(0.5);
        this.scene.add(axes);

        // 地面网格
        const grid = new THREE.GridHelper(4, 20, 0x2d3247, 0x1d2030);
        this.scene.add(grid);

        // 环境光 + 方向光
        this.scene.add(new THREE.AmbientLight(0x404060, 0.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        // 窗口 resize
        this._resizeHandler = () => this._onResize();
        window.addEventListener('resize', this._resizeHandler);

        // 开始渲染循环
        this._animate();
    }

    /**
     * 加载轨迹数据并渲染
     * @param {Object} data — 后端 /api/items/{id}/pose 返回的 JSON
     */
    loadTrajectory(data) {
        this.trajectoryData = data;
        this.positions = data.positions;
        // ViPE cam_c2w uses OpenCV's local +Z optical-forward convention.
        // Older exported website JSON accidentally stored local -Z; preserve
        // compatibility while new exports carry an explicit forward_axis tag.
        this.forwardVectors = data.forward_axis === '+Z'
            ? data.forward_vectors
            : data.forward_vectors.map(v => [-v[0], -v[1], -v[2]]);
        this.currentFrame = 0;

        // 存储摇杆数据
        this.translationJoystick = data.translation_joystick || null;
        this.rotationJoystick = data.rotation_joystick || null;

        // 存储 intrinsics 并预计算世界轨迹点
        this.intrinsics = data.intrinsics || null;
        this._precomputeWorldTrace(data);

        // 清除旧的
        this._clearTrajectory();

        // Fit first so the trajectory-dependent marker scale and clipping
        // planes are valid before constructing markers and frustums.
        this._fitCamera();

        // 构建轨迹线
        this._buildTrajectoryLine();

        // 构建相机锥体
        this._buildFrustums();

        // 当前帧标记
        this._buildCurrentFrameMarker();

        // Re-apply the fitted view after all scene objects are attached.
        this.controls.update();
    }

    /**
     * 清除所有轨迹数据，重置为空场景
     */
    clearScene() {
        this._clearTrajectory();
        this.trajectoryData = null;
        this.positions = null;
        this.forwardVectors = null;
        this.translationJoystick = null;
        this.rotationJoystick = null;
        this.intrinsics = null;
        this.worldTrace = null;
        this.currentFrame = 0;

        // 清空摇杆叠加层 canvas
        if (this.joystickOverlayCtx) {
            this.joystickOverlayCtx.clearRect(0, 0, this.joystickOverlayCanvas.width, this.joystickOverlayCanvas.height);
        }
        // 清空 overlay canvas
        if (this.overlayCtx) {
            this.overlayCtx.clearRect(0, 0, this.overlayCtx.canvas.width, this.overlayCtx.canvas.height);
        }
        // 清空 trace canvas
        if (this.traceCtx) {
            this.traceCtx.clearRect(0, 0, this.traceCtx.canvas.width, this.traceCtx.canvas.height);
        }
    }

    /**
     * 高亮指定帧
     */
    setCurrentFrame(frameIndex) {
        if (!this.trajectoryData) return;
        frameIndex = Math.max(0, Math.min(frameIndex, this.positions.length - 1));
        this.currentFrame = frameIndex;

        // 更新标记位置
        if (this.currentFrameMarker && this.positions[frameIndex]) {
            const pos = this.positions[frameIndex];
            this.currentFrameMarker.position.set(pos[0], pos[1], pos[2]);

            // 更新方向锥体
            if (this.currentDirCone && this.forwardVectors[frameIndex]) {
                const fwd = this.forwardVectors[frameIndex];
                this.currentDirCone.position.set(pos[0], pos[1], pos[2]);
                const target = new THREE.Vector3(
                    pos[0] + fwd[0], pos[1] + fwd[1], pos[2] + fwd[2]
                );
                this.currentDirCone.lookAt(target);
                // ConeGeometry points along local +Y. After lookAt(), local -Z
                // faces the target, so rotate -90 degrees to align +Y with -Z.
                this.currentDirCone.rotateX(-Math.PI / 2);
            }
        }

        // 更新已播放轨迹线颜色（红色高亮已播放部分）
        if (this.progressHighlight && this.trajectoryLine && this.trajectoryLine.geometry) {
            const colors = this.trajectoryLine.geometry.getAttribute('color');
            if (colors) {
                const vertexCount = colors.count;
                const progress = frameIndex / Math.max(this.positions.length - 1, 1);
                for (let i = 0; i < vertexCount; i++) {
                    if (i / Math.max(vertexCount - 1, 1) <= progress) {
                        colors.setXYZ(i, 1.0, 0.27, 0.27); // 红色
                    } else {
                        colors.setXYZ(i, 0.36, 0.54, 0.96); // 蓝色
                    }
                }
                colors.needsUpdate = true;
            }
        }

        // 高亮锥体
        if (this.frustumGroup) {
            this.frustumGroup.children.forEach((child, i) => {
                const isNear = Math.abs(child.userData.frameIndex - frameIndex) <= 1;
                if (child.material) {
                    child.material.opacity = isNear ? 0.9 : 0.3;
                    child.material.color.setHex(isNear ? 0xff4444 : 0x5b8af5);
                }
            });
        }

        // 跟随模式：3D 相机跟随当前帧
        if (this.followMode && this.controls && this.positions[frameIndex]) {
            const pos = this.positions[frameIndex];
            if (this.forwardVectors[frameIndex]) {
                const fwd = this.forwardVectors[frameIndex];
                const distance = Math.max((this._markerScale || 0.01) * 24, 0.3);
                // Camera-aligned chase view: behind and slightly above the
                // current pose, looking along the same optical-forward axis.
                const camPos = new THREE.Vector3(
                    pos[0] - fwd[0] * distance,
                    pos[1] - fwd[1] * distance + distance * 0.35,
                    pos[2] - fwd[2] * distance
                );
                const target = new THREE.Vector3(
                    pos[0] + fwd[0] * distance,
                    pos[1] + fwd[1] * distance,
                    pos[2] + fwd[2] * distance
                );
                this.camera.position.lerp(camPos, 0.18);
                this.controls.target.lerp(target, 0.18);
            }
        }
    }

    /**
     * 切换显示选项
     */
    setShowFrustums(show) {
        this.showFrustums = show;
        if (this.frustumGroup) this.frustumGroup.visible = show;
    }

    setShowTrajectory(show) {
        this.showTrajectory = show;
        if (this.trajectoryLine) this.trajectoryLine.visible = show;
    }

    setProgressHighlight(enabled) {
        this.progressHighlight = enabled;
    }

    setShowDirection(show) {
        this.showDirection = show;
        if (this.currentDirCone) this.currentDirCone.visible = show;
    }

    /**
     * 跟随模式开关
     */
    setFollowMode(enabled) {
        this.followMode = enabled;
        if (!enabled) {
            // 退出跟随时恢复全局视角
            this._fitCamera();
        }
    }

    snapToCameraView(frameIndex) {
        if (!this.positions?.length || !this.forwardVectors?.length) return;
        frameIndex = Math.max(0, Math.min(frameIndex, this.positions.length - 1));
        const pos = this.positions[frameIndex];
        const fwd = this.forwardVectors[frameIndex];
        const distance = Math.max((this._markerScale || 0.01) * 24, 0.3);
        this.camera.position.set(
            pos[0] - fwd[0] * distance,
            pos[1] - fwd[1] * distance + distance * 0.35,
            pos[2] - fwd[2] * distance
        );
        this.controls.target.set(
            pos[0] + fwd[0] * distance,
            pos[1] + fwd[1] * distance,
            pos[2] + fwd[2] * distance
        );
        this.followMode = true;
        this.controls.update();
    }

    /**
     * 重置相机视角
     */
    resetCamera() {
        this.followMode = false;
        this._fitCamera();
    }

    /**
     * 销毁
     */
    dispose() {
        if (this._animationId) cancelAnimationFrame(this._animationId);
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        if (this.renderer) {
            this.renderer.dispose();
            this.container.innerHTML = '';
        }
        this.controls?.dispose();
    }

    // ──── 视频叠加方向罗盘 ────

    /**
     * 初始化视频叠加层
     */
    initOverlay(canvas) {
        this.overlayCanvas = canvas;
        this.overlayCtx = canvas.getContext('2d');
    }

    /**
     * 绘制视频叠加方向箭头
     * @param {number} frameIndex 当前帧号
     */
    drawVideoOverlay(frameIndex) {
        if (!this.overlayCtx || !this.trajectoryData) return;

        const ctx = this.overlayCtx;
        // 匹配 canvas 绘制分辨率与 CSS 显示尺寸（全屏时自动放大）
        const displayW = this.overlayCanvas.clientWidth || 100;
        const displayH = this.overlayCanvas.clientHeight || 100;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(displayW * dpr);
        const targetH = Math.round(displayH * dpr);
        if (this.overlayCanvas.width !== targetW || this.overlayCanvas.height !== targetH) {
            this.overlayCanvas.width = targetW;
            this.overlayCanvas.height = targetH;
        }
        const w = this.overlayCanvas.width;
        const h = this.overlayCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) - 6;

        const yaw = this.trajectoryData.yaw || [];
        const pitch = this.trajectoryData.pitch || [];
        const positions = this.positions;

        ctx.clearRect(0, 0, w, h);

        if (yaw.length === 0) return;
        // clamp 到最后一帧，避免视频尾部超出 pose 范围时画面消失
        frameIndex = Math.min(frameIndex, yaw.length - 1);

        // 帧间速度（用于箭头颜色）
        let speed = 0;
        if (frameIndex > 0 && positions[frameIndex] && positions[frameIndex - 1]) {
            const p0 = positions[frameIndex - 1];
            const p1 = positions[frameIndex];
            speed = Math.sqrt(
                (p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2 + (p1[2] - p0[2]) ** 2
            );
        }

        // 缓存最大速度用于归一化
        if (!this.trajectoryData._maxSpeed) {
            let ms = 0;
            for (let i = 1; i < positions.length; i++) {
                const a = positions[i - 1], b = positions[i];
                const d = Math.sqrt((b[0]-a[0])**2 + (b[1]-a[1])**2 + (b[2]-a[2])**2);
                ms = Math.max(ms, d);
            }
            this.trajectoryData._maxSpeed = ms || 1;
        }
        const speedNorm = Math.min(1, speed / this.trajectoryData._maxSpeed);

        // 相对角度
        const relYaw = yaw[frameIndex] - yaw[0];
        const relPitch = pitch[frameIndex] - pitch[0];

        // ── 绘制 ──

        // 半透明圆形背景
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 17, 23, 0.65)';
        ctx.fill();

        // 缩放因子（相对 100px 基准）
        const s = w / 100;

        // 外圈
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();

        // FBLR 标记
        const labelFont = Math.round(11 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `bold ${labelFont}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('F', cx, cy - r + 9 * s);
        ctx.fillText('B', cx, cy + r - 9 * s);
        ctx.fillText('L', cx - r + 9 * s, cy);
        ctx.fillText('R', cx + r - 9 * s, cy);

        // 箭头角度 = relYaw（yaw 正 = 相机右转 → 箭头顺时针指向右）
        const angle = relYaw;

        // 俯仰偏移（pitch 正 = 向上看，箭头向上偏移）
        const pitchOffset = -relPitch * r * 0.5;

        // 箭头长度：基础 + 速度加成
        const baseLen = r * 0.45;
        const arrowLen = baseLen + speedNorm * r * 0.3;

        // 箭头颜色：蓝(静止) → 红(快速)
        const red = Math.round(91 + speedNorm * 164);
        const green = Math.round(138 - speedNorm * 100);
        const blue = Math.round(245 - speedNorm * 200);

        // 箭头起点（中心 + pitch偏移）
        const ox = cx;
        const oy = cy + pitchOffset;

        // 箭头终点
        const tipX = ox + Math.sin(angle) * arrowLen;
        const tipY = oy - Math.cos(angle) * arrowLen;

        // 箭头杆
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(tipX, tipY);
        ctx.strokeStyle = `rgb(${red},${green},${blue})`;
        ctx.lineWidth = 3 * s;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 箭头头部
        const headLen = 8 * s;
        const headAngle = 0.45;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
            tipX - headLen * Math.sin(angle - headAngle),
            tipY + headLen * Math.cos(angle - headAngle)
        );
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
            tipX - headLen * Math.sin(angle + headAngle),
            tipY + headLen * Math.cos(angle + headAngle)
        );
        ctx.strokeStyle = `rgb(${red},${green},${blue})`;
        ctx.lineWidth = 2.5 * s;
        ctx.stroke();

        // 中心点
        ctx.beginPath();
        ctx.arc(ox, oy, 3 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // 角度数值
        const yawDeg = (relYaw * 180 / Math.PI).toFixed(1);
        const pitchDeg = (relPitch * 180 / Math.PI).toFixed(1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const infoFont = Math.round(8 * s);
        ctx.font = `${infoFont}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${yawDeg}° / ${pitchDeg}°`, cx, h - 3 * s);
    }

    // ──── 视频轨迹投影叠加 ────

    /**
     * 初始化轨迹投影叠加层
     */
    initTraceOverlay(canvas) {
        this.traceCanvas = canvas;
        this.traceCtx = canvas.getContext('2d');
    }

    /**
     * 清除轨迹投影叠加层（切换数据时调用）
     */
    clearTraceOverlay() {
        this.worldTrace = null;
        this.intrinsics = null;
        this._lastTraceFrame = -1;
        if (this.traceCtx && this.traceCanvas) {
            this.traceCtx.clearRect(0, 0, this.traceCanvas.width, this.traceCanvas.height);
        }
    }

    /**
     * 预计算每帧光轴前方点的世界坐标
     * world_point[i] = R_i @ [0, 0, distance] + t_i
     */
    _precomputeWorldTrace(data) {
        if (!data.positions || !data.rotations) {
            this.worldTrace = null;
            return;
        }
        const distance = 1.0;
        this.worldTrace = [];
        for (let i = 0; i < data.positions.length; i++) {
            const R = data.rotations[i]; // 行主序展平: [r00,r01,r02, r10,r11,r12, r20,r21,r22]
            const pos = data.positions[i];
            // R @ [0, 0, distance] = [R[2]*d, R[5]*d, R[8]*d]
            this.worldTrace.push([
                R[2] * distance + pos[0],
                R[5] * distance + pos[1],
                R[8] * distance + pos[2],
            ]);
        }
    }

    /**
     * 绘制视频轨迹投影
     * @param {number} frameIndex 当前帧号
     * @param {number} videoW     视频原始宽度（像素）
     * @param {number} videoH     视频原始高度（像素）
     */
    drawVideoTrace(frameIndex, videoW, videoH) {
        if (!this.traceCtx || !this.traceCanvas) return;

        // 帧号未变时跳过重绘
        if (frameIndex === this._lastTraceFrame) return;
        this._lastTraceFrame = frameIndex;

        const canvas = this.traceCanvas;
        const ctx = this.traceCtx;

        // 匹配 canvas 分辨率到显示尺寸 × DPR
        const displayW = canvas.clientWidth || 1;
        const displayH = canvas.clientHeight || 1;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(displayW * dpr);
        const targetH = Math.round(displayH * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.intrinsics || !this.worldTrace || !this.trajectoryData) return;
        if (frameIndex < 1) return;

        let { fx, fy, cx, cy, normalized } = this.intrinsics;
        // 归一化 intrinsics：值在 0~1 范围，需乘以视频分辨率转为像素坐标
        if (normalized && videoW > 0 && videoH > 0) {
            fx *= videoW;
            fy *= videoH;
            cx *= videoW;
            cy *= videoH;
        }
        const rotations = this.trajectoryData.rotations;
        const positions = this.trajectoryData.positions;

        frameIndex = Math.min(frameIndex, positions.length - 1);

        // 当前帧的 R 和 t
        const R = rotations[frameIndex];
        const t = positions[frameIndex];
        const tx = t[0], ty = t[1], tz = t[2];

        const canvasW = canvas.width;
        const canvasH = canvas.height;

        // 投影 0..frameIndex 的世界轨迹点到当前帧相机视图
        const projected = [];
        for (let j = 0; j <= frameIndex; j++) {
            const wp = this.worldTrace[j];
            const relX = wp[0] - tx;
            const relY = wp[1] - ty;
            const relZ = wp[2] - tz;

            // cam = R^T @ rel（R 行主序展平，R^T 第 k 行 = R 第 k 列）
            const camX = R[0] * relX + R[3] * relY + R[6] * relZ;
            const camY = R[1] * relX + R[4] * relY + R[7] * relZ;
            const camZ = R[2] * relX + R[5] * relY + R[8] * relZ;

            if (camZ <= 0.001 || !isFinite(camX) || !isFinite(camY)) {
                projected.push(null);
                continue;
            }

            const u = fx * camX / camZ + cx;
            const v = fy * camY / camZ + cy;

            if (!isFinite(u) || !isFinite(v) || u < 0 || u >= videoW || v < 0 || v >= videoH) {
                projected.push(null);
                continue;
            }

            projected.push({
                x: u / videoW * canvasW,
                y: v / videoH * canvasH,
            });
        }

        // 分段：连续 valid 点 ≥ 2 构成一段
        const segments = [];
        let segStart = null;
        for (let i = 0; i < projected.length; i++) {
            if (projected[i] !== null) {
                if (segStart === null) segStart = i;
            } else {
                if (segStart !== null && i - segStart >= 2) {
                    segments.push([segStart, i]);
                }
                segStart = null;
            }
        }
        if (segStart !== null && projected.length - segStart >= 2) {
            segments.push([segStart, projected.length]);
        }

        if (segments.length === 0) return;

        // Outline 风格：黑色描边 + 白色内线
        const thickness = 2 * dpr;

        for (const [start, end] of segments) {
            // 黑色描边
            ctx.beginPath();
            ctx.moveTo(projected[start].x, projected[start].y);
            for (let i = start + 1; i < end; i++) {
                ctx.lineTo(projected[i].x, projected[i].y);
            }
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = thickness + 2 * dpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // 白色内线
            ctx.beginPath();
            ctx.moveTo(projected[start].x, projected[start].y);
            for (let i = start + 1; i < end; i++) {
                ctx.lineTo(projected[i].x, projected[i].y);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = thickness;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
    }

    // ──── 双摇杆叠加层 (Joystick Overlay) ────

    /**
     * 初始化摇杆叠加层 canvas
     * @param {HTMLCanvasElement} canvas
     */
    initJoystickOverlay(canvas) {
        this.joystickOverlayCanvas = canvas;
        this.joystickOverlayCtx = canvas.getContext('2d');
    }

    /**
     * 绘制双摇杆叠加层
     * @param {number} frameIndex 当前帧号
     */
    drawJoystickOverlay(frameIndex) {
        if (!this.joystickOverlayCtx || !this.joystickOverlayCanvas) return;
        if (!this.translationJoystick || !this.rotationJoystick) return;

        const canvas = this.joystickOverlayCanvas;
        const ctx = this.joystickOverlayCtx;

        // DPR-aware canvas sizing
        const displayW = canvas.clientWidth;
        const displayH = canvas.clientHeight;
        // Skip if canvas has no layout dimensions yet
        if (!displayW || !displayH) return;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(displayW * dpr);
        const targetH = Math.round(displayH * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        const numFrames = this.translationJoystick.length;
        if (numFrames === 0) return;
        frameIndex = Math.max(0, Math.min(frameIndex, numFrames - 1));

        // Layout: two joysticks at bottom-right
        const radius = Math.min(w, h) * 0.08;
        const margin = radius * 0.5;
        const gap = radius * 0.6;

        // Right joystick (Rotation) — rightmost
        const rCx = w - margin - radius;
        const rCy = h - margin - radius;

        // Left joystick (Translation) — to the left of right joystick
        const lCx = rCx - radius * 2 - gap;
        const lCy = rCy;

        // Get joystick values for this frame
        const tJoy = this.translationJoystick[frameIndex];
        const rJoy = this.rotationJoystick[frameIndex];

        // Draw both joysticks
        this._drawSingleJoystick(ctx, lCx, lCy, radius, tJoy[0], tJoy[1]);
        this._drawSingleJoystick(ctx, rCx, rCy, radius, rJoy[0], rJoy[1]);

        // Labels above each joystick
        const fontSize = Math.max(9, Math.round(radius * 0.30));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255,255,255,0.60)';
        ctx.fillText('Translation', lCx, lCy - radius - 4);
        ctx.fillText('Rotation', rCx, rCy - radius - 4);
    }

    /**
     * Draw a single joystick at (cx, cy) with given radius and deflection (x, y) in [-1, 1]
     */
    _drawSingleJoystick(ctx, cx, cy, radius, x, y) {
        x = Math.max(-1, Math.min(1, x));
        y = Math.max(-1, Math.min(1, y));

        const knobX = cx + x * radius * 0.85;
        const knobY = cy + y * radius * 0.85;

        // ── Background glow ──
        // Dark base
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.95);
        bgGrad.addColorStop(0, 'rgba(18, 22, 30, 0.75)');
        bgGrad.addColorStop(0.7, 'rgba(35, 45, 65, 0.40)');
        bgGrad.addColorStop(1, 'rgba(18, 22, 30, 0.0)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = bgGrad;
        ctx.fill();

        // ── Inner rings ──
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.88, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.70, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // ── Blue outer glow ──
        const blue = '#32aaff';
        const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.90, cx, cy, radius * 1.22);
        glowGrad.addColorStop(0, 'rgba(50, 170, 255, 0.26)');
        glowGrad.addColorStop(1, 'rgba(50, 170, 255, 0.0)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.22, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Blue ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(50, 170, 255, 0.66)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Hot ring (inner)
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.98, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(90, 210, 255, 0.44)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Knob shadow ──
        const shadowOx = radius * 0.05;
        const shadowOy = radius * 0.06;
        const shadowGrad = ctx.createRadialGradient(
            knobX + shadowOx, knobY + shadowOy, 0,
            knobX + shadowOx, knobY + shadowOy, radius * 0.42
        );
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
        ctx.beginPath();
        ctx.arc(knobX + shadowOx, knobY + shadowOy, radius * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = shadowGrad;
        ctx.fill();

        // ── Knob body ──
        // Edge gradient
        const edgeGrad = ctx.createRadialGradient(knobX, knobY, 0, knobX, knobY, radius * 0.40);
        edgeGrad.addColorStop(0, 'rgba(235, 245, 255, 0.80)');
        edgeGrad.addColorStop(0.65, 'rgba(165, 190, 215, 0.62)');
        edgeGrad.addColorStop(1, 'rgba(165, 190, 215, 0.0)');
        ctx.beginPath();
        ctx.arc(knobX, knobY, radius * 0.40, 0, Math.PI * 2);
        ctx.fillStyle = edgeGrad;
        ctx.fill();

        // Inner white ring
        ctx.beginPath();
        ctx.arc(knobX, knobY, radius * 0.38, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Outer dark ring
        ctx.beginPath();
        ctx.arc(knobX, knobY, radius * 0.39, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // ── Highlight ──
        const hlX = knobX - radius * 0.12;
        const hlY = knobY - radius * 0.12;
        const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, radius * 0.11);
        hlGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        hlGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        ctx.beginPath();
        ctx.arc(hlX, hlY, radius * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = hlGrad;
        ctx.fill();
    }

    // ──── 内部方法 ────

    _clearTrajectory() {
        if (this.trajectoryLine) {
            this.scene.remove(this.trajectoryLine);
            this.trajectoryLine.geometry?.dispose();
            this.trajectoryLine.material?.dispose();
            this.trajectoryLine = null;
        }
        if (this.frustumGroup) {
            this.scene.remove(this.frustumGroup);
            this.frustumGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.frustumGroup = null;
        }
        if (this.currentFrameMarker) {
            this.scene.remove(this.currentFrameMarker);
            this.currentFrameMarker.geometry?.dispose();
            this.currentFrameMarker.material?.dispose();
            this.currentFrameMarker = null;
        }
        if (this.currentDirCone) {
            this.scene.remove(this.currentDirCone);
            this.currentDirCone.geometry?.dispose();
            this.currentDirCone.material?.dispose();
            this.currentDirCone = null;
        }
    }

    _buildTrajectoryLine() {
        const points = this.positions.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        if (points.length < 2) return;

        // WebGL ignores LineBasicMaterial.linewidth on most platforms, which
        // made long trajectories nearly invisible. Render a lightweight tube
        // with per-vertex temporal colors instead.
        const curve = new THREE.CatmullRomCurve3(points);
        const radius = Math.max(this._markerScale * 0.55, 0.002);
        const geometry = new THREE.TubeGeometry(curve, Math.min(points.length * 2, 480), radius, 6, false);
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color();
        for (let i = 0; i < count; i++) {
            const t = i / Math.max(count - 1, 1);
            color.setHSL(0.56 + 0.32 * t, 0.72, 0.62);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const material = new THREE.MeshBasicMaterial({ vertexColors: true });
        this.trajectoryLine = new THREE.Mesh(geometry, material);
        this.trajectoryLine.visible = this.showTrajectory;
        this.scene.add(this.trajectoryLine);
    }

    _buildFrustums() {
        this.frustumGroup = new THREE.Group();
        this.frustumGroup.visible = this.showFrustums;

        const N = this.positions.length;
        // 每隔几帧画一个锥体
        const step = Math.max(1, Math.floor(N / 30));
        const s = this._markerScale || 0.015;
        const frustumSize = s * 5;

        for (let i = 0; i < N; i += step) {
            const pos = this.positions[i];
            const fwd = this.forwardVectors[i];

            // 创建小锥体
            const coneGeo = new THREE.ConeGeometry(frustumSize * 0.6, frustumSize * 1.5, 4);
            const coneMat = new THREE.MeshBasicMaterial({
                color: 0x5b8af5,
                transparent: true,
                opacity: 0.3,
            });
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.userData.frameIndex = i;

            // 定位
            cone.position.set(pos[0], pos[1], pos[2]);

            // 朝向前方
            if (fwd) {
                const target = new THREE.Vector3(
                    pos[0] + fwd[0],
                    pos[1] + fwd[1],
                    pos[2] + fwd[2]
                );
                cone.lookAt(target);
                // ConeGeometry points along local +Y; align its tip with the
                // forward vector (lookAt maps local -Z toward the target).
                cone.rotateX(-Math.PI / 2);
            }

            this.frustumGroup.add(cone);
        }

        this.scene.add(this.frustumGroup);
    }

    _buildCurrentFrameMarker() {
        // 红色球体标记当前位置（尺寸自适应轨迹范围）
        const s = this._markerScale || 0.015;
        const geo = new THREE.SphereGeometry(s * 4, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
        this.currentFrameMarker = new THREE.Mesh(geo, mat);

        // 方向锥体（显示相机朝向）
        const coneGeo = new THREE.ConeGeometry(s * 2.5, s * 8, 6);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.8 });
        this.currentDirCone = new THREE.Mesh(coneGeo, coneMat);
        this.currentDirCone.visible = this.showDirection;

        if (this.positions.length > 0) {
            const pos = this.positions[0];
            this.currentFrameMarker.position.set(pos[0], pos[1], pos[2]);
            this.currentDirCone.position.set(pos[0], pos[1], pos[2]);

            if (this.forwardVectors[0]) {
                const fwd = this.forwardVectors[0];
                const target = new THREE.Vector3(pos[0] + fwd[0], pos[1] + fwd[1], pos[2] + fwd[2]);
                this.currentDirCone.lookAt(target);
                this.currentDirCone.rotateX(-Math.PI / 2);
            }
        }

        this.scene.add(this.currentFrameMarker);
        this.scene.add(this.currentDirCone);
    }

    _fitCamera() {
        if (!this.positions || this.positions.length === 0) return;

        // 计算包围盒
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const p of this.positions) {
            minX = Math.min(minX, p[0]);
            minY = Math.min(minY, p[1]);
            minZ = Math.min(minZ, p[2]);
            maxX = Math.max(maxX, p[0]);
            maxY = Math.max(maxY, p[1]);
            maxZ = Math.max(maxZ, p[2]);
        }

        const center = new THREE.Vector3(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        );

        const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const size = Math.max(extent, 0.5);
        // Keep trajectory, endpoints, and frustums legible at every ViPE scale.
        this._markerScale = Math.max(extent * 0.012, 0.002);
        const distance = size * 1.18;

        // Real ViPE trajectories can span hundreds of normalized units.  A
        // fixed far plane of 100 clips the complete trajectory in those
        // cases, leaving an apparently unresponsive blank viewer.
        this.camera.near = Math.max(size / 10000, 0.001);
        this.camera.far = Math.max(distance * 12, 100);
        this.camera.updateProjectionMatrix();

        this.camera.position.set(
            center.x + distance * 0.7,
            center.y + distance * 0.5,
            center.z + distance * 0.7
        );
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
    }

    _onResize() {
        if (!this.container || !this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight || (width * 9 / 16);

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    _animate() {
        this._animationId = requestAnimationFrame(() => this._animate());
        this.controls?.update();
        this.renderer?.render(this.scene, this.camera);
    }
}

// 导出全局
window.PoseViewer = PoseViewer;
