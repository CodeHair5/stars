/* Tähtitieteelliset muunnokset: J2000-koordinaateista havaitsijan horisonttikoordinaatteihin. */
(function (global) {
    'use strict';

    var RAD = Math.PI / 180;
    var DEG = 180 / Math.PI;

    function julianDate(date) {
        return date.getTime() / 86400000 + 2440587.5;
    }

    function greenwichSiderealDegrees(jd) {
        var d = jd - 2451545.0;
        var t = d / 36525;
        var gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000;
        return ((gmst % 360) + 360) % 360;
    }

    /* Palauttaa korkeuden ja atsimuutin asteina, atsimuutti pohjoisesta itään päin. */
    function equatorialToHorizontal(raDeg, decDeg, latDeg, lonDeg, jd) {
        var lst = greenwichSiderealDegrees(jd) + lonDeg;
        var hourAngle = (((lst - raDeg) % 360) + 360) % 360 * RAD;
        var dec = decDeg * RAD;
        var lat = latDeg * RAD;

        var sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle);
        sinAlt = Math.max(-1, Math.min(1, sinAlt));
        var alt = Math.asin(sinAlt);

        var cosAz = (Math.sin(dec) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(alt));
        cosAz = Math.max(-1, Math.min(1, cosAz));
        var az = Math.acos(cosAz);
        if (Math.sin(hourAngle) > 0) az = 2 * Math.PI - az;

        return { altitude: alt * DEG, azimuth: az * DEG };
    }

    /* Yksikkövektori: Y ylös, -Z pohjoiseen, +X itään. */
    function horizontalToVector(altitudeDeg, azimuthDeg) {
        var alt = altitudeDeg * RAD;
        var az = azimuthDeg * RAD;
        var horizontal = Math.cos(alt);
        return {
            x: horizontal * Math.sin(az),
            y: Math.sin(alt),
            z: -horizontal * Math.cos(az)
        };
    }

    function vectorToHorizontal(x, y, z) {
        var length = Math.sqrt(x * x + y * y + z * z) || 1;
        var altitude = Math.asin(Math.max(-1, Math.min(1, y / length))) * DEG;
        var azimuth = Math.atan2(x, -z) * DEG;
        return { altitude: altitude, azimuth: ((azimuth % 360) + 360) % 360 };
    }

    /* B-V-indeksistä approksimoitu näkyvä väri. */
    function colorFromBv(bv) {
        if (bv <= -0.2) return [0.68, 0.79, 1.0];
        if (bv <= 0.0) return [0.79, 0.86, 1.0];
        if (bv <= 0.3) return [0.92, 0.94, 1.0];
        if (bv <= 0.6) return [1.0, 0.98, 0.92];
        if (bv <= 1.0) return [1.0, 0.92, 0.78];
        if (bv <= 1.5) return [1.0, 0.82, 0.64];
        return [1.0, 0.72, 0.55];
    }

    /* Galaktisista koordinaateista J2000-ekvaattorikoordinaatteihin. */
    var GAL_POLE_RA = 192.85948 * RAD;
    var GAL_POLE_DEC = 27.12825 * RAD;
    var GAL_NCP_LON = 122.93192 * RAD;

    function galacticToEquatorial(lDeg, bDeg) {
        var l = lDeg * RAD;
        var b = bDeg * RAD;
        var diff = GAL_NCP_LON - l;

        var sinDec = Math.sin(GAL_POLE_DEC) * Math.sin(b) + Math.cos(GAL_POLE_DEC) * Math.cos(b) * Math.cos(diff);
        var dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
        var y = Math.cos(b) * Math.sin(diff);
        var x = Math.sin(b) * Math.cos(GAL_POLE_DEC) - Math.cos(b) * Math.sin(GAL_POLE_DEC) * Math.cos(diff);
        var ra = (GAL_POLE_RA + Math.atan2(y, x)) * DEG;

        return { ra: ((ra % 360) + 360) % 360, dec: dec * DEG };
    }

    function compassName(azimuthDeg) {
        var names = ['pohjoinen', 'koillinen', 'itä', 'kaakko', 'etelä', 'lounas', 'länsi', 'luode'];
        var index = Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8;
        return names[index];
    }

    global.Astro = {
        julianDate: julianDate,
        equatorialToHorizontal: equatorialToHorizontal,
        horizontalToVector: horizontalToVector,
        vectorToHorizontal: vectorToHorizontal,
        galacticToEquatorial: galacticToEquatorial,
        colorFromBv: colorFromBv,
        compassName: compassName
    };
})(window);
