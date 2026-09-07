/* Ympyröintitehtävä: käyttäjä rajaa kysytyn tähdistön taivaalta. */
(function (global) {
    'use strict';

    var MIN_ALTITUDE = 22;
    var MIN_STAR_ALTITUDE = 10;

    function create(options) {
        var sky = options.sky;
        var overlay = options.overlay;
        var ctx = overlay.getContext('2d');

        var pool = [];
        var queue = [];
        var target = null;
        var path = null;
        var drawing = false;
        var activePointerId = null;
        var answered = false;
        var hintUsed = false;

        // Kysyttäväksi kelpaa vain tähdistö, jonka kaikki tähdet ovat näkyvissä riittävän korkealla.
        function computePool() {
            pool = options.constellations.filter(function (constellation) {
                var stars = sky.starsOf(constellation.hips);
                if (stars.length < constellation.hips.length) return false;
                var centroid = sky.centroidOf(constellation.hips);
                if (!centroid || centroid.altitude < MIN_ALTITUDE) return false;
                return stars.every(function (star) { return star.altitude >= MIN_STAR_ALTITUDE; });
            });
            queue = [];
            return pool;
        }

        function polygonArea(points) {
            var area = 0;
            for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
                area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
            }
            return Math.abs(area / 2);
        }

        function isInside(point, points) {
            var inside = false;
            for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
                var yi = points[i].y, yj = points[j].y;
                if ((yi > point.y) === (yj > point.y)) continue;
                var x = points[i].x + ((point.y - yi) / (yj - yi)) * (points[j].x - points[i].x);
                if (point.x < x) inside = !inside;
            }
            return inside;
        }

        function resizeOverlay() {
            var ratio = Math.min(window.devicePixelRatio || 1, 2);
            overlay.width = overlay.clientWidth * ratio;
            overlay.height = overlay.clientHeight * ratio;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            render();
        }

        function render() {
            ctx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
            if (!path || path.points.length < 2) return;

            var stroke = answered ? (path.correct ? '#34d399' : '#fb7185') : '#fbbf24';
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(path.points[0].x, path.points[0].y);
            for (var i = 1; i < path.points.length; i++) {
                ctx.lineTo(path.points[i].x, path.points[i].y);
            }
            if (!drawing) ctx.closePath();

            if (!drawing) {
                ctx.fillStyle = answered
                    ? (path.correct ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 113, 133, 0.1)')
                    : 'rgba(251, 191, 36, 0.1)';
                ctx.fill();
            }

            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2.2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.setLineDash(drawing ? [7, 6] : []);
            ctx.stroke();
            ctx.restore();
        }

        function pointerPosition(event) {
            var rect = overlay.getBoundingClientRect();
            return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        }

        overlay.addEventListener('pointerdown', function (event) {
            if (answered || activePointerId !== null) return;
            activePointerId = event.pointerId;
            drawing = true;
            path = { points: [pointerPosition(event)] };
            try {
                overlay.setPointerCapture(event.pointerId);
            } catch (error) {
                // Piirto toimii myös ilman osoittimen kaappausta.
            }
            render();
        });

        overlay.addEventListener('pointermove', function (event) {
            if (!drawing || !path || event.pointerId !== activePointerId) return;
            var point = pointerPosition(event);
            var last = path.points[path.points.length - 1];
            if (Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
            path.points.push(point);
            render();
        });

        function releasePointer(event) {
            activePointerId = null;
            drawing = false;
            if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
        }

        overlay.addEventListener('pointerup', function (event) {
            if (!drawing || event.pointerId !== activePointerId) return;
            releasePointer(event);
            if (!path || path.points.length < 6 || polygonArea(path.points) < 1200) {
                path = null;
                render();
                return;
            }
            render();
            evaluate();
        });

        overlay.addEventListener('pointercancel', function (event) {
            if (event.pointerId !== activePointerId) return;
            releasePointer(event);
            path = null;
            render();
        });

        function targetScreenStars() {
            return sky.starsOf(target.hips)
                .map(function (star) { return sky.screenPosition(star.hip); })
                .filter(function (position) { return position && position.onScreen; });
        }

        function evaluate() {
            var points = targetScreenStars();
            var total = target.hips.length;

            if (points.length < total * 0.7) {
                answered = false;
                options.onResult({
                    status: 'incomplete',
                    message: 'Koko tähdistö ei ole näkyvissä ruudulla. Käännä katsetta tai loitonna ja yritä uudelleen.'
                });
                path = null;
                render();
                return;
            }

            var centroid = points.reduce(function (acc, point) {
                acc.x += point.x / points.length;
                acc.y += point.y / points.length;
                return acc;
            }, { x: 0, y: 0 });

            var neededRadius = points.reduce(function (max, point) {
                return Math.max(max, Math.hypot(point.x - centroid.x, point.y - centroid.y));
            }, 0) + 14;

            var inside = points.filter(function (point) {
                return isInside(point, path.points);
            }).length;

            var coverage = inside / points.length;
            var area = polygonArea(path.points);
            var neededArea = Math.PI * neededRadius * neededRadius;
            var tooWide = area > neededArea * 2.2;
            var correct = coverage >= 0.8 && !tooWide;

            answered = true;
            path.correct = correct;
            render();
            sky.drawConstellation(target);

            var message;
            if (correct) {
                message = 'Oikein! Kohde oli ' + target.name + ' (' + target.latin + '). Kirkkain tähti: ' + target.brightest + '.';
            } else if (tooWide) {
                message = 'Rajaus oli liian laaja. Kohde oli ' + target.name + ' — se näkyy nyt viivoitettuna.';
            } else if (coverage < 0.8) {
                message = 'Rajauksen sisällä oli vain ' + Math.round(coverage * 100) + ' % tähdistön tähdistä. Oikea paikka näkyy nyt viivoitettuna.';
            } else {
                message = 'Rajaus oli väärässä kohdassa. Oikea paikka näkyy nyt viivoitettuna.';
            }

            options.onResult({
                status: correct ? 'correct' : 'wrong',
                correct: correct,
                hintUsed: hintUsed,
                constellation: target,
                message: message
            });
        }

        function nextTarget() {
            if (!queue.length) {
                queue = pool.slice().sort(function () { return Math.random() - 0.5; });
            }
            target = queue.pop();
            path = null;
            answered = false;
            drawing = false;
            activePointerId = null;
            hintUsed = false;
            sky.clearConstellation();
            render();
            return target;
        }

        window.addEventListener('resize', resizeOverlay);
        resizeOverlay();
        computePool();

        return {
            poolSize: function () { return pool.length; },
            refreshPool: computePool,
            next: nextTarget,
            current: function () { return target; },
            isAnswered: function () { return answered; },
            resize: resizeOverlay,
            clearSelection: function () { path = null; render(); },
            hint: function () {
                hintUsed = true;
                var centroid = sky.centroidOf(target.hips);
                return {
                    text: target.name + ' on suunnassa ' + Astro.compassName(centroid.azimuth) +
                        ' (atsimuutti ' + Math.round(centroid.azimuth) + '°), korkeus noin ' + Math.round(centroid.altitude) + '°.',
                    azimuth: centroid.azimuth,
                    altitude: centroid.altitude
                };
            },
            reveal: function () {
                if (answered) return;
                answered = true;
                path = null;
                render();
                sky.drawConstellation(target);
                options.onResult({
                    status: 'revealed',
                    correct: false,
                    constellation: target,
                    message: target.name + ' (' + target.latin + ') näkyy nyt viivoitettuna. Kirkkain tähti: ' + target.brightest + '.'
                });
            }
        };
    }

    global.Quiz = { create: create };
})(window);
