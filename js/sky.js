/* Three.js-taivas: tähdet horisonttikoordinaateissa, maanpinta ja katselun ohjaus. */
(function (global) {
    'use strict';

    var SKY_RADIUS = 500;
    var BASE_FOV = 65;
    var MIN_FOV = 22;
    var MAX_FOV = 80;

    function createGradientSky() {
        var material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                horizonColor: { value: new THREE.Color(0x0b1424) },
                zenithColor: { value: new THREE.Color(0x01030a) }
            },
            vertexShader: [
                'varying float vHeight;',
                'void main() {',
                '  vHeight = normalize(position).y;',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 horizonColor;',
                'uniform vec3 zenithColor;',
                'varying float vHeight;',
                'void main() {',
                '  float t = clamp(vHeight, 0.0, 1.0);',
                '  gl_FragColor = vec4(mix(horizonColor, zenithColor, pow(t, 0.55)), 1.0);',
                '}'
            ].join('\n')
        });
        return new THREE.Mesh(new THREE.SphereGeometry(900, 32, 24), material);
    }

    function createLabelSprite(text) {
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(148, 197, 255, 0.85)';
        ctx.font = 'bold 64px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 64);

        var texture = new THREE.CanvasTexture(canvas);
        var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
        sprite.scale.set(60, 30, 1);
        return sprite;
    }

    /* Paljain silmin erottuvat syvän taivaan kohteet. minLimit = raja-magnitudi, jolla kohde alkaa erottua. */
    var DEEP_SKY = [
        { name: 'M31 Andromedan galaksi', ra: 10.6847, dec: 41.2690, minLimit: 4.8, width: 3.0, height: 1.0, angle: 35 },
        { name: 'M33 Kolmion galaksi', ra: 23.4621, dec: 30.6602, minLimit: 6.2, width: 1.2, height: 0.8, angle: 20 },
        { name: 'h+chi Persei', ra: 34.7500, dec: 57.1330, minLimit: 5.2, width: 1.2, height: 0.7, angle: 0 },
        { name: 'M42 Orionin sumu', ra: 83.8221, dec: -5.3911, minLimit: 5.0, width: 1.1, height: 0.9, angle: 0 },
        { name: 'M44 Seimi', ra: 130.1000, dec: 19.6700, minLimit: 5.0, width: 1.6, height: 1.4, angle: 0 },
        { name: 'M13 Herkuleen pättyminen', ra: 250.4230, dec: 36.4613, minLimit: 5.9, width: 0.5, height: 0.5, angle: 0 }
    ];

    function createNebulaTexture() {
        var canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');
        var gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(226, 238, 255, 0.95)');
        gradient.addColorStop(0.35, 'rgba(198, 216, 250, 0.45)');
        gradient.addColorStop(0.7, 'rgba(160, 185, 235, 0.12)');
        gradient.addColorStop(1, 'rgba(140, 170, 220, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }

    function gaussian() {
        var u = 1 - Math.random();
        var v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function create(options) {
        var container = options.container;
        var observer = options.observer;
        var julianDay = Astro.julianDate(observer.date);
        var magLimit = options.magLimit || 5.1;
        var milkyWayStrength = options.milkyWay || 0;

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 2000);
        camera.rotation.order = 'YXZ';

        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x01030a, 1);
        container.appendChild(renderer.domElement);

        var skyGradient = createGradientSky();
        scene.add(skyGradient);

        var ground = new THREE.Mesh(
            new THREE.CircleGeometry(1200, 64),
            new THREE.MeshBasicMaterial({ color: 0x04060b })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1.5;
        scene.add(ground);

        var horizonPoints = [];
        for (var h = 0; h <= 128; h++) {
            var angle = (h / 128) * Math.PI * 2;
            horizonPoints.push(new THREE.Vector3(Math.cos(angle) * SKY_RADIUS, 0, Math.sin(angle) * SKY_RADIUS));
        }
        scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(horizonPoints),
            new THREE.LineBasicMaterial({ color: 0x1d3355, transparent: true, opacity: 0.8 })
        ));

        var cardinals = [
            { text: 'P', azimuth: 0 }, { text: 'KOI', azimuth: 45 },
            { text: 'I', azimuth: 90 }, { text: 'KAA', azimuth: 135 },
            { text: 'E', azimuth: 180 }, { text: 'LOU', azimuth: 225 },
            { text: 'L', azimuth: 270 }, { text: 'LUO', azimuth: 315 }
        ];
        cardinals.forEach(function (item) {
            var sprite = createLabelSprite(item.text);
            var vector = Astro.horizontalToVector(2.5, item.azimuth);
            sprite.position.set(vector.x * 480, vector.y * 480, vector.z * 480);
            scene.add(sprite);
        });

        var starMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                pixelRatio: { value: renderer.getPixelRatio() },
                sizeScale: { value: 1 }
            },
            vertexShader: [
                'attribute float size;',
                'attribute float alpha;',
                'attribute vec3 starColor;',
                'uniform float pixelRatio;',
                'uniform float sizeScale;',
                'varying vec3 vColor;',
                'varying float vAlpha;',
                'void main() {',
                '  vColor = starColor;',
                '  vAlpha = alpha;',
                '  gl_PointSize = size * sizeScale * pixelRatio;',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vColor;',
                'varying float vAlpha;',
                'void main() {',
                '  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;',
                '  if (r > 1.0) discard;',
                '  float core = 1.0 - smoothstep(0.0, 0.5, r);',
                '  float halo = pow(1.0 - r, 2.2);',
                '  gl_FragColor = vec4(vColor, vAlpha * clamp(core + halo * 0.6, 0.0, 1.0));',
                '}'
            ].join('\n')
        });

        var nebulaTexture = createNebulaTexture();
        var deepSkyGroup = new THREE.Group();
        scene.add(deepSkyGroup);

        var starIndex = {};
        var starPoints = null;
        var milkyWayPoints = null;
        var visibleStarCount = 0;

        function spherePoint(altitude, azimuth) {
            var vector = Astro.horizontalToVector(altitude, azimuth);
            return new THREE.Vector3(vector.x * SKY_RADIUS, vector.y * SKY_RADIUS, vector.z * SKY_RADIUS);
        }

        function makeCloud(positions, colors, sizes, alphas) {
            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('starColor', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
            geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
            return new THREE.Points(geometry, starMaterial);
        }

        function removeCloud(cloud) {
            if (!cloud) return;
            scene.remove(cloud);
            cloud.geometry.dispose();
        }

        // Piirretään vain horisontin yläpuoliset tähdet, jotka ylittävät Bortle-rajan.
        function buildStars() {
            removeCloud(starPoints);
            starIndex = {};
            visibleStarCount = 0;

            var positions = [], colors = [], sizes = [], alphas = [];
            options.stars.forEach(function (row) {
                var hip = row[0], ra = row[1], dec = row[2], mag = row[3], bv = row[4];
                if (mag > magLimit) return;

                var horizontal = Astro.equatorialToHorizontal(ra, dec, observer.latitude, observer.longitude, julianDay);
                if (horizontal.altitude < 0.5) return;

                var point = spherePoint(horizontal.altitude, horizontal.azimuth);
                var rgb = Astro.colorFromBv(bv);
                var extinction = Math.min(1, 0.3 + horizontal.altitude / 20);
                var brightness = Math.max(0.3, Math.min(1, 0.32 + (6.2 - mag) * 0.13)) * extinction;

                positions.push(point.x, point.y, point.z);
                colors.push(rgb[0], rgb[1], rgb[2]);
                sizes.push(1.5 + Math.max(0.4, 6.2 - mag) * 1.25);
                alphas.push(brightness);

                starIndex[hip] = {
                    hip: hip,
                    point: point,
                    altitude: horizontal.altitude,
                    azimuth: horizontal.azimuth,
                    magnitude: mag
                };
                visibleStarCount++;
            });

            starPoints = makeCloud(positions, colors, sizes, alphas);
            scene.add(starPoints);
        }

        // Linnunrata syntyy galaktisen tason ympärille arvotuista himmeistä pisteistä.
        function buildMilkyWay() {
            removeCloud(milkyWayPoints);
            milkyWayPoints = null;
            if (milkyWayStrength <= 0.02) return;

            var positions = [], colors = [], sizes = [], alphas = [];
            for (var i = 0; i < 26000; i++) {
                var longitude = Math.random() * 360;
                // Kapea kirkas ydin ja leviämpi hohde.
                var latitude = gaussian() * (i % 3 === 0 ? 10.5 : 4.5);
                if (Math.abs(latitude) > 26) continue;

                var equatorial = Astro.galacticToEquatorial(longitude, latitude);
                var horizontal = Astro.equatorialToHorizontal(
                    equatorial.ra, equatorial.dec, observer.latitude, observer.longitude, julianDay);
                if (horizontal.altitude < 1) continue;

                // Kirkkaimmillaan Jousimiehen ja Joutsenen suunnassa, himmeimmillään antikeskustassa.
                var longitudeWeight = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.cos((longitude - 40) * Math.PI / 180), 1.1);
                var extinction = Math.min(1, 0.15 + horizontal.altitude / 25);
                var point = spherePoint(horizontal.altitude, horizontal.azimuth);

                positions.push(point.x, point.y, point.z);
                colors.push(0.86, 0.89, 1.0);
                sizes.push(2.2 + Math.random() * 3.4);
                alphas.push(longitudeWeight * extinction * milkyWayStrength * (0.3 + Math.random() * 0.7) * 0.34);
            }

            if (!positions.length) return;
            milkyWayPoints = makeCloud(positions, colors, sizes, alphas);
            scene.add(milkyWayPoints);
        }

        function buildDeepSky() {
            while (deepSkyGroup.children.length) {
                deepSkyGroup.children.pop().material.dispose();
            }

            DEEP_SKY.forEach(function (object) {
                var visibility = Math.min(0.8, (magLimit - object.minLimit) / 1.2);
                if (visibility <= 0.03) return;

                var horizontal = Astro.equatorialToHorizontal(
                    object.ra, object.dec, observer.latitude, observer.longitude, julianDay);
                if (horizontal.altitude < 4) return;

                var extinction = Math.min(1, 0.2 + horizontal.altitude / 25);
                var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: nebulaTexture,
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending,
                    opacity: visibility * extinction,
                    rotation: (object.angle || 0) * Math.PI / 180
                }));

                var degreeScale = SKY_RADIUS * Math.PI / 180 * 2.1;
                sprite.scale.set(object.width * degreeScale, object.height * degreeScale, 1);
                sprite.position.copy(spherePoint(horizontal.altitude, horizontal.azimuth));
                deepSkyGroup.add(sprite);
            });
        }

        var lineGroup = new THREE.Group();
        scene.add(lineGroup);

        function setSkyGlow(level) {
            var t = Math.max(0, Math.min(1, level));
            skyGradient.material.uniforms.horizonColor.value.setRGB(
                0.016 + 0.10 * t, 0.028 + 0.14 * t, 0.055 + 0.21 * t);
            skyGradient.material.uniforms.zenithColor.value.setRGB(
                0.004 + 0.035 * t, 0.010 + 0.052 * t, 0.030 + 0.085 * t);
        }

        buildStars();
        buildMilkyWay();
        buildDeepSky();
        setSkyGlow(options.skyGlow || 0);

        var yaw = Math.PI;
        var pitch = 25 * Math.PI / 180;
        var interactive = true;
        var pointers = {};
        var pinch = null;

        function applyCamera() {
            pitch = Math.max(-0.35, Math.min(1.45, pitch));
            camera.rotation.set(pitch, yaw, 0);
            starMaterial.uniforms.sizeScale.value = Math.min(2.2, Math.max(1, BASE_FOV / camera.fov));
        }

        function setFov(value) {
            camera.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, value));
            camera.updateProjectionMatrix();
            applyCamera();
        }

        function activePointers() {
            return Object.keys(pointers).map(function (id) { return pointers[id]; });
        }

        function pointerGap(a, b) {
            return Math.hypot(a.x - b.x, a.y - b.y);
        }

        function resize() {
            var width = container.clientWidth;
            var height = container.clientHeight;
            if (!width || !height) return;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }

        function capturePointer(element, pointerId) {
            try {
                element.setPointerCapture(pointerId);
            } catch (error) {
                // Kaappaus ei ole pakollinen, ele toimii myös ilman sitä.
            }
        }

        renderer.domElement.addEventListener('pointerdown', function (event) {
            if (!interactive) return;
            pointers[event.pointerId] = { x: event.clientX, y: event.clientY };

            var list = activePointers();
            if (list.length === 2) {
                pinch = { gap: pointerGap(list[0], list[1]), fov: camera.fov };
            }
            capturePointer(renderer.domElement, event.pointerId);
        });

        renderer.domElement.addEventListener('pointermove', function (event) {
            var previous = pointers[event.pointerId];
            if (!interactive || !previous) return;

            var dx = event.clientX - previous.x;
            var dy = event.clientY - previous.y;
            previous.x = event.clientX;
            previous.y = event.clientY;

            var list = activePointers();
            if (list.length >= 2) {
                // Kahden sormen nipistys zoomaa.
                if (pinch) {
                    var gap = pointerGap(list[0], list[1]);
                    if (gap > 6) setFov(pinch.fov * (pinch.gap / gap));
                }
                return;
            }

            var speed = (camera.fov / BASE_FOV) * 0.0035;
            yaw += dx * speed;
            pitch += dy * speed;
            applyCamera();
        });

        function endDrag(event) {
            if (event && event.pointerId !== undefined) {
                delete pointers[event.pointerId];
                if (renderer.domElement.hasPointerCapture(event.pointerId)) {
                    renderer.domElement.releasePointerCapture(event.pointerId);
                }
            } else {
                pointers = {};
            }
            if (activePointers().length < 2) pinch = null;
        }        renderer.domElement.addEventListener('pointerup', endDrag);
        renderer.domElement.addEventListener('pointercancel', endDrag);

        renderer.domElement.addEventListener('wheel', function (event) {
            event.preventDefault();
            setFov(camera.fov + (event.deltaY > 0 ? 4 : -4));
        }, { passive: false });

        window.addEventListener('resize', resize);
        resize();
        applyCamera();

        (function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        })();

        var projection = new THREE.Vector3();

        function screenPosition(hip) {
            var star = starIndex[hip];
            if (!star) return null;
            camera.updateMatrixWorld();
            camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
            projection.copy(star.point).project(camera);
            if (projection.z > 1) return null;
            return {
                x: (projection.x * 0.5 + 0.5) * container.clientWidth,
                y: (-projection.y * 0.5 + 0.5) * container.clientHeight,
                onScreen: Math.abs(projection.x) <= 1 && Math.abs(projection.y) <= 1
            };
        }

        function starsOf(hips) {
            return hips.map(function (hip) { return starIndex[hip]; }).filter(Boolean);
        }

        function centroidOf(hips) {
            var stars = starsOf(hips);
            if (!stars.length) return null;
            var sum = new THREE.Vector3();
            stars.forEach(function (star) { sum.add(star.point); });
            sum.divideScalar(stars.length);
            var horizontal = Astro.vectorToHorizontal(sum.x, sum.y, sum.z);
            return { altitude: horizontal.altitude, azimuth: horizontal.azimuth, count: stars.length };
        }

        function drawConstellation(constellation) {
            clearConstellation();
            var points = [];
            constellation.lines.forEach(function (pair) {
                var a = starIndex[pair[0]];
                var b = starIndex[pair[1]];
                if (a && b) points.push(a.point, b.point);
            });
            if (!points.length) return;
            lineGroup.add(new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.85 })
            ));
        }

        function clearConstellation() {
            while (lineGroup.children.length) {
                var child = lineGroup.children.pop();
                child.geometry.dispose();
                child.material.dispose();
            }
        }

        return {
            camera: camera,
            element: renderer.domElement,
            starCount: function () { return visibleStarCount; },
            configure: function (settings) {
                if (settings.observer) {
                    observer = settings.observer;
                    julianDay = Astro.julianDate(observer.date);
                }
                if (settings.magLimit !== undefined) magLimit = settings.magLimit;
                if (settings.milkyWay !== undefined) milkyWayStrength = settings.milkyWay;
                if (settings.skyGlow !== undefined) setSkyGlow(settings.skyGlow);
                clearConstellation();
                buildStars();
                buildMilkyWay();
                buildDeepSky();
            },
            screenPosition: screenPosition,
            starsOf: starsOf,
            centroidOf: centroidOf,
            drawConstellation: drawConstellation,
            clearConstellation: clearConstellation,
            resize: resize,
            setInteractive: function (value) { interactive = value; if (!value) endDrag(); },
            lookAt: function (azimuthDeg, altitudeDeg) {
                yaw = -azimuthDeg * Math.PI / 180;
                pitch = altitudeDeg * Math.PI / 180;
                applyCamera();
            },
            viewDirection: function () {
                var direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                return Astro.vectorToHorizontal(direction.x, direction.y, direction.z);
            }
        };
    }

    global.Sky = { create: create };
})(window);
