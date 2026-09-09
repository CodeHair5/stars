/* Sovelluksen käynnistys ja käyttöliittymän kytkennät. */
(function () {
    'use strict';

    var LOCATION = { latitude: 60.17, longitude: 24.94, name: 'Helsinki (60,2° N)' };

    // Kellonajat Suomen kesäaikaa (UTC+3).
    var SEASONS = {
        syksy: { label: 'Syksyilta 15.10.2025 klo 22.00', date: new Date(Date.UTC(2025, 9, 15, 19, 0, 0)) },
        kevat: { label: 'Kevätilta 15.4.2025 klo 22.00', date: new Date(Date.UTC(2025, 3, 15, 19, 0, 0)) }
    };

    // Linnunrata katoaa nopeasti valosaasteeseen: Bortle 5:llä se on enää aavistus, 6:sta ylöspäin sitä ei näy.
    var BORTLE = {
        1: { magLimit: 6.5, milkyWay: 1.0, glow: 0.0, text: 'Bortle 1 — erämaataivas' },
        2: { magLimit: 6.3, milkyWay: 0.72, glow: 0.08, text: 'Bortle 2 — todella pimeä' },
        3: { magLimit: 6.1, milkyWay: 0.42, glow: 0.2, text: 'Bortle 3 — maaseutu' },
        4: { magLimit: 5.8, milkyWay: 0.2, glow: 0.34, text: 'Bortle 4 — maaseudun reuna' },
        5: { magLimit: 5.4, milkyWay: 0.06, glow: 0.52, text: 'Bortle 5 — esikaupunki' },
        6: { magLimit: 5.0, milkyWay: 0, glow: 0.7, text: 'Bortle 6 — kirkas esikaupunki' },
        7: { magLimit: 4.5, milkyWay: 0, glow: 0.88, text: 'Bortle 7 — kaupungin laita' }
    };

    var settings = { bortle: 5, season: 'syksy' };

    function currentObserver() {
        return {
            latitude: LOCATION.latitude,
            longitude: LOCATION.longitude,
            date: SEASONS[settings.season].date
        };
    }

    var elements = {};
    var sky = null;
    var quiz = null;
    var circleMode = false;
    var state = { score: 0, streak: 0, answered: 0, correct: 0 };

    function byId(id) {
        return document.getElementById(id);
    }

    function setStatus(message, tone) {
        elements.status.textContent = message;
        elements.status.className = 'status status--' + (tone || 'neutral');
    }

    function updateStats() {
        elements.score.textContent = state.score;
        elements.streak.textContent = state.streak;
        elements.answered.textContent = state.correct + ' / ' + state.answered;
    }

    function setCircleMode(active) {
        circleMode = active;
        elements.overlay.style.pointerEvents = active ? 'auto' : 'none';
        elements.overlay.classList.toggle('overlay--active', active);
        sky.setInteractive(!active);
        elements.modeToggle.textContent = active ? 'Lopeta rajaus' : 'Rajaa kohde';
        elements.modeToggle.classList.toggle('button--active', active);
        elements.modeHint.textContent = active
            ? 'Piirrä sormella tai hiirellä vapaa alue kohteen ympäri — rajaus sulkeutuu itsestään.'
            : 'Käännä katsetta vetämällä, zoomaa nipistämällä tai rullalla.';
    }

    function askNext() {
        var target = quiz.next();
        elements.targetName.textContent = target.name;
        elements.targetLatin.textContent = target.latin;
        elements.nextButton.disabled = true;
        elements.hintButton.disabled = false;
        elements.revealButton.disabled = false;
        setCircleMode(false);
        setStatus('Etsi tähdistö taivaalta ja rajaa se piirtämällä.', 'neutral');
    }

    function handleResult(result) {
        if (result.status === 'incomplete') {
            setStatus(result.message, 'warn');
            return;
        }

        state.answered++;
        if (result.correct) {
            state.correct++;
            state.streak++;
            state.score += result.hintUsed ? 60 : 100;
            setStatus(result.message, 'ok');
        } else {
            state.streak = 0;
            setStatus(result.message, 'bad');
        }

        updateStats();
        setCircleMode(false);
        elements.nextButton.disabled = false;
        elements.hintButton.disabled = true;
        elements.revealButton.disabled = true;
    }

    function applySettings() {
        var preset = BORTLE[settings.bortle];

        sky.configure({
            observer: currentObserver(),
            magLimit: preset.magLimit,
            milkyWay: preset.milkyWay,
            skyGlow: preset.glow
        });
        quiz.refreshPool();

        elements.bortleLabel.textContent = preset.text;
        elements.observerInfo.textContent = SEASONS[settings.season].label + ' — ' + LOCATION.name;
        elements.starCount.textContent = sky.starCount() + ' tähteä näkyvissä · ' + quiz.poolSize() + ' tähdistöä';
        askNext();
    }

    function updateViewInfo() {
        var view = sky.viewDirection();
        elements.viewInfo.textContent = 'Katse: ' + Astro.compassName(view.azimuth) +
            ' ' + Math.round(view.azimuth) + '°, korkeus ' + Math.round(view.altitude) + '°';
    }

    function init() {
        elements = {
            container: byId('sky-container'),
            overlay: byId('overlay'),
            status: byId('status-message'),
            score: byId('stat-score'),
            streak: byId('stat-streak'),
            answered: byId('stat-answered'),
            targetName: byId('target-name'),
            targetLatin: byId('target-latin'),
            modeToggle: byId('mode-toggle'),
            modeHint: byId('mode-hint'),
            hintButton: byId('hint-button'),
            revealButton: byId('reveal-button'),
            nextButton: byId('next-button'),
            viewInfo: byId('view-info'),
            observerInfo: byId('observer-info'),
            starCount: byId('star-count'),
            bortleSlider: byId('bortle-slider'),
            bortleLabel: byId('bortle-label'),
            seasonSelect: byId('season-select')
        };

        if (typeof THREE === 'undefined') {
            setStatus('Three.js-kirjastoa ei saatu ladattua. Tarkista verkkoyhteys.', 'bad');
            return;
        }

        sky = Sky.create({
            container: elements.container,
            observer: currentObserver(),
            stars: window.STAR_DATA,
            magLimit: BORTLE[settings.bortle].magLimit,
            milkyWay: BORTLE[settings.bortle].milkyWay,
            skyGlow: BORTLE[settings.bortle].glow
        });

        quiz = Quiz.create({
            sky: sky,
            overlay: elements.overlay,
            constellations: window.CONSTELLATION_DATA,
            onResult: handleResult
        });

        window.VirtualSky = { sky: sky, quiz: quiz, settings: settings };

        elements.bortleSlider.value = String(settings.bortle);
        elements.seasonSelect.value = settings.season;

        elements.bortleSlider.addEventListener('input', function () {
            settings.bortle = Number(elements.bortleSlider.value);
            elements.bortleLabel.textContent = BORTLE[settings.bortle].text;
        });
        elements.bortleSlider.addEventListener('change', applySettings);
        elements.seasonSelect.addEventListener('change', function () {
            settings.season = elements.seasonSelect.value;
            applySettings();
        });

        elements.modeToggle.addEventListener('click', function () {
            if (quiz.isAnswered()) return;
            setCircleMode(!circleMode);
        });

        elements.hintButton.addEventListener('click', function () {
            var hint = quiz.hint();
            setStatus(hint.text, 'warn');
        });

        elements.revealButton.addEventListener('click', function () {
            quiz.reveal();
        });

        elements.nextButton.addEventListener('click', askNext);

        // Vastauksen jälkeen ruudulle jäänyt rajaus ei enää vastaa taivaan kohtaa, kun katse kääntyy.
        sky.element.addEventListener('pointerdown', function () {
            if (quiz.isAnswered()) quiz.clearSelection();
        });

        window.addEventListener('resize', function () {
            sky.resize();
            quiz.resize();
        });

        setInterval(updateViewInfo, 200);
        updateStats();
        applySettings();
    }

    window.addEventListener('DOMContentLoaded', init);
})();
