/* RL Stats overlay engine (packs + scenes + chat).
 *
 * One runtime renders every OBS overlay: the scene layout and the design-pack
 * tokens arrive from `/api/v2/scene`, live data from the WebSocket. Modules
 * are positioned on a 1920x1080 design canvas and scaled to the browser
 * source size, so the same scene works at 720p, 1080p or 1440p.
 *
 * Security: player names and chat text are attacker-controlled, so the engine
 * only ever builds DOM nodes with `textContent` (the CI test asserts this
 * file and the pages never use innerHTML).
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var TOKEN = params.get('token') || window.__RL_TOKEN__ || '';
  var SCENE_ID = params.get('scene') || '';
  var PACK_OVERRIDE = params.get('pack') || '';
  var STATE_OVERRIDE = params.get('state') || '';
  var ALERT_TYPES = (params.get('types') || 'Goal,Save,Demo,HatTrick,EpicSave,AerialGoal')
    .split(',')
    .map(function (value) {
      return value.trim();
    })
    .filter(Boolean);
  var ALERT_DURATION = clampInt(params.get('duration'), 3200, 600, 15000);
  var ALERT_POSITION = params.get('position') || 'top';
  var ALERT_MAX = clampInt(params.get('max'), 3, 1, 6);
  var GOAL_DURATION = clampInt(params.get('goalDuration'), 2800, 800, 10000);
  var CHAT_MAX = clampInt(params.get('chatMax'), 18, 3, 60);
  var ONLY_MODULES = (params.get('only') || '')
    .split(',')
    .map(function (value) {
      return value.trim();
    })
    .filter(Boolean);
  var SPONSOR_INTERVAL = clampInt(params.get('sponsorInterval'), 8000, 2000, 60000);
  var SHOW_BOOST = params.get('boost') !== '0';

  function clampInt(raw, fallback, min, max) {
    var value = parseInt(raw, 10);
    if (isNaN(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  var App = {
    ws: null,
    backoff: 1000,
    config: null,
    match: null,
    series: null,
    events: [],
    chat: [],
    modules: new Map(),
    timer: null,
    replay: false,
    paused: false,
    visible: {},
    alertQueue: [],
    activeAlerts: 0,
    sponsors: [],
    sponsorIndex: 0,
    goalTimer: null,
    pendingRender: false,
    status: 'connecting'
  };

  var stage = document.getElementById('ov-stage');
  var alertsLayer = document.getElementById('ov-alerts');
  var goalLayer = document.getElementById('ov-goal');

  if (alertsLayer) alertsLayer.className = 'position-' + ALERT_POSITION;

  // ------------------------------------------------------------------ utils

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function formatClock(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds)) return '--:--';
    var total = Math.max(0, Math.round(seconds));
    var minutes = Math.floor(total / 60);
    var secs = total % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function prettyArena(arena) {
    if (!arena) return '';
    return String(arena).replace(/_P$/, '').replace(/_/g, ' ');
  }

  function requestRender() {
    if (App.pendingRender) return;
    App.pendingRender = true;
    window.requestAnimationFrame(function () {
      App.pendingRender = false;
      renderAll();
    });
  }

  // ------------------------------------------------------------ pack tokens

  var FONT_FALLBACK = {
    geist: "'Geist Variable','Geist','Segoe UI',system-ui,sans-serif",
    'geist-mono': "'Geist Mono Variable','Geist Mono','Cascadia Code',Consolas,monospace"
  };

  function resolveFont(token, fonts) {
    if (!token) return 'sans-serif';
    if (FONT_FALLBACK[token]) return FONT_FALLBACK[token];
    for (var index = 0; index < fonts.length; index += 1) {
      if (fonts[index].id === token) return fonts[index].stack;
    }
    return token;
  }

  function applyPack(config) {
    var tokens = (config.pack && config.pack.tokens) || {};
    var fonts = config.fonts || [];
    var root = document.documentElement;
    var map = {
      '--ov-accent': tokens.accent,
      '--ov-accent-alt': tokens.accentAlt,
      '--ov-surface': tokens.surface,
      '--ov-surface-solid': tokens.surfaceSolid,
      '--ov-text': tokens.text,
      '--ov-muted': tokens.muted,
      '--ov-border': tokens.border,
      '--ov-radius': typeof tokens.radius === 'number' ? tokens.radius + 'px' : tokens.radius,
      '--ov-shadow': tokens.shadow,
      '--ov-motion': tokens.motionMs
    };
    Object.keys(map).forEach(function (key) {
      if (map[key] !== undefined && map[key] !== null) {
        root.style.setProperty(key, String(map[key]));
      }
    });
    root.style.setProperty('--ov-font-display', resolveFont(tokens.fontDisplay, fonts));
    root.style.setProperty('--ov-font-body', resolveFont(tokens.fontBody, fonts));
    root.style.setProperty('--ov-font-numeric', resolveFont(tokens.fontNumeric, fonts));
    root.style.setProperty(
      '--ov-blur',
      tokens.texture === 'blur' ? 'blur(14px) saturate(1.2)' : 'none'
    );

    var corner = tokens.corner || 'round';
    stage.className = 'corner-' + corner;
    if (tokens.uppercase) stage.classList.add('ov-uppercase');
    if (tokens.texture === 'scanline') stage.classList.add('texture-scanline');
    if (tokens.texture === 'stripes') stage.classList.add('texture-stripes');

    injectCustomFonts(config.customFonts || []);
    App.sponsors = collectSponsors(tokens, config);
  }

  var injectedFonts = {};
  function injectCustomFonts(fonts) {
    fonts.forEach(function (font) {
      if (!font || !font.name || !font.url || injectedFonts[font.name]) return;
      injectedFonts[font.name] = true;
      var style = document.createElement('style');
      style.textContent =
        "@font-face{font-family:'" +
        String(font.name).replace(/'/g, '') +
        "';src:url('" +
        font.url +
        "');font-display:swap;}";
      document.head.appendChild(style);
    });
  }

  function collectSponsors(tokens, config) {
    var raw = params.get('sponsors');
    if (raw) {
      return raw
        .split(',')
        .map(function (value) {
          return value.trim();
        })
        .filter(Boolean);
    }
    if (Array.isArray(tokens.sponsors)) return tokens.sponsors.slice();
    return [];
  }

  // ------------------------------------------------------------------ layout

  function applyLayout(config) {
    var layout = config.layout || {};
    if (ONLY_MODULES.length) {
      // Chat-only (or any single-widget) page: synthesize a full-stage module
      // when the active scene does not include it.
      var present = Object.keys(layout).some(function (key) {
        return layout[key] && ONLY_MODULES.indexOf(layout[key].module) !== -1;
      });
      if (!present) {
        layout = {};
        ONLY_MODULES.forEach(function (module, index) {
          layout['only-' + module] = {
            module: module,
            x: 0,
            y: index * 8,
            w: 100,
            h: 100
          };
        });
        config.layout = layout;
      }
    }
    var seen = {};
    Object.keys(layout).forEach(function (key) {
      var spec = layout[key] || {};
      if (!spec.module) return;
      if (ONLY_MODULES.length && ONLY_MODULES.indexOf(spec.module) === -1) return;
      seen[key] = true;
      var module = App.modules.get(key);
      if (!module) {
        var node = el('div', 'ov-module ov-hidden');
        node.dataset.module = spec.module;
        stage.appendChild(node);
        module = { el: node, spec: spec };
        App.modules.set(key, module);
      }
      module.spec = spec;
      if (spec.team) module.el.dataset.team = spec.team;
      placeModule(module.el, spec);
    });
    App.modules.forEach(function (module, key) {
      if (!seen[key]) {
        module.el.remove();
        App.modules.delete(key);
      }
    });
  }

  function placeModule(node, spec) {
    var designWidth = 1920;
    var designHeight = 1080;
    var scale = (stage.clientWidth || designWidth) / designWidth;
    node.style.left = (spec.x || 0) + '%';
    node.style.top = (spec.y || 0) + '%';
    node.style.width = ((spec.w || 20) / 100) * designWidth + 'px';
    node.style.minHeight = ((spec.h || 10) / 100) * designHeight + 'px';
    node.style.transform = 'scale(' + scale + ')';
  }

  function repositionAll() {
    App.modules.forEach(function (module) {
      placeModule(module.el, module.spec);
    });
  }

  // ---------------------------------------------------------------- renderers

  function teamColor(team) {
    var series = App.series || {};
    var snapshot = team === 'blue' ? series.teamA : series.teamB;
    if (snapshot && snapshot.colorPrimary) return snapshot.colorPrimary;
    return team === 'blue' ? '#3b82f6' : '#f97316';
  }

  function teamName(team) {
    var series = App.series || {};
    var snapshot = team === 'blue' ? series.teamA : series.teamB;
    if (snapshot && snapshot.name) return snapshot.name;
    var query = params.get(team === 'blue' ? 'blueName' : 'orangeName');
    if (query) return query;
    return team === 'blue' ? 'AZUL' : 'NARANJA';
  }

  function teamLogo(team) {
    var series = App.series || {};
    var snapshot = team === 'blue' ? series.teamA : series.teamB;
    var url = snapshot && snapshot.logoUrl ? snapshot.logoUrl : '';
    if (!url) {
      url = params.get(team === 'blue' ? 'blueLogo' : 'orangeLogo') || '';
    }
    return url;
  }

  function playersFor(teamNum) {
    var match = App.match;
    if (!match || !Array.isArray(match.players)) return [];
    return match.players
      .filter(function (player) {
        return player.team === teamNum;
      })
      .sort(function (a, b) {
        return (b.score || 0) - (a.score || 0);
      });
  }

  function applyTeamVariables() {
    document.documentElement.style.setProperty('--ov-team-blue', teamColor('blue'));
    document.documentElement.style.setProperty('--ov-team-orange', teamColor('orange'));
  }

  function logoNode(url, className) {
    if (!url) return null;
    var img = document.createElement('img');
    img.className = className;
    img.src = url;
    img.alt = '';
    return img;
  }

  var renderers = {
    scorebug: function (node) {
      var match = App.match || {};
      var wrap = el('div', 'ov-scorebug');
      ['blue', 'orange'].forEach(function (side) {
        var teamNode = el('div', 'ov-scorebug-team ' + side);
        var logo = logoNode(teamLogo(side), 'ov-scorebug-logo');
        if (logo) teamNode.appendChild(logo);
        var info = el('div');
        info.appendChild(el('div', 'ov-scorebug-name', teamName(side)));
        info.appendChild(
          el(
            'div',
            'ov-scorebug-meta',
            side === 'blue' ? prettyArena(match.arena) : match.matchType || ''
          )
        );
        teamNode.appendChild(info);
        wrap.appendChild(teamNode);
        if (side === 'blue') {
          var center = el('div', 'ov-scorebug-center');
          var score = el('div', 'ov-score');
          score.appendChild(el('span', 'blue', match.scoreBlue || 0));
          score.appendChild(el('span', '', '–'));
          score.appendChild(el('span', 'orange', match.scoreOrange || 0));
          center.appendChild(score);
          center.appendChild(
            el('div', 'ov-clock' + (match.isOvertime ? ' overtime' : ''), formatClock(match.timeRemaining))
          );
          var sub = el('div', 'ov-sub');
          sub.appendChild(el('span', 'ov-online' + (match.isOnline ? '' : ' offline')));
          sub.appendChild(document.createTextNode(match.isOvertime ? 'OVERTIME' : 'EN VIVO'));
          center.appendChild(sub);
          wrap.appendChild(center);
        }
      });
      clear(node);
      node.appendChild(wrap);
    },

    series: function (node) {
      var series = App.series || {};
      var wrap = el('div', 'ov-series');
      if (!series.available) {
        wrap.appendChild(el('span', 'ov-series-score', 'BO' + (params.get('series') || '3')));
        clear(node);
        node.appendChild(wrap);
        return;
      }
      wrap.appendChild(el('span', '', series.teamA ? series.teamA.tag || series.teamA.name : 'A'));
      wrap.appendChild(el('span', 'ov-series-score', series.scoreA + ' – ' + series.scoreB));
      wrap.appendChild(el('span', '', series.teamB ? series.teamB.tag || series.teamB.name : 'B'));
      var dots = el('span');
      var needed = series.winsNeeded || Math.floor((series.format || 3) / 2) + 1;
      for (var index = 0; index < needed; index += 1) {
        dots.appendChild(el('span', 'ov-series-dot' + (index < series.scoreA ? ' won' : '')));
      }
      wrap.appendChild(dots);
      clear(node);
      node.appendChild(wrap);
    },

    roster: function (node, spec) {
      var side = spec.team === 'orange' ? 'orange' : 'blue';
      var teamNum = side === 'blue' ? 0 : 1;
      var players = playersFor(teamNum);
      var wrap = el('div', 'ov-roster');
      var header = el('div', 'ov-roster-header ' + side);
      header.appendChild(el('span', '', teamName(side)));
      header.appendChild(el('span', '', String(players.length)));
      wrap.appendChild(header);
      players.forEach(function (player, index) {
        var row = el('div', 'ov-player' + (SHOW_BOOST && typeof player.boost === 'number' ? ' boost-bar' : ''));
        row.appendChild(el('div', 'ov-player-index', index + 1));
        row.appendChild(el('div', 'ov-player-name', player.name || '—'));
        if (SHOW_BOOST && typeof player.boost === 'number') {
          var bar = el('div', 'ov-player-boost');
          var fill = el('div', 'ov-player-boost-fill');
          fill.style.width = Math.max(0, Math.min(100, player.boost)) + '%';
          bar.appendChild(fill);
          row.appendChild(bar);
        }
        var stats = el('div', 'ov-player-stat');
        stats.appendChild(el('b', '', player.goals || 0));
        stats.appendChild(document.createTextNode(' G '));
        stats.appendChild(el('b', '', player.assists || 0));
        stats.appendChild(document.createTextNode(' A '));
        stats.appendChild(el('b', '', player.saves || 0));
        stats.appendChild(document.createTextNode(' S'));
        row.appendChild(stats);
        wrap.appendChild(row);
      });
      clear(node);
      node.appendChild(wrap);
    },

    events: function (node) {
      var wrap = el('div', 'ov-events');
      App.events
        .slice(0, 6)
        .forEach(function (event) {
          var row = el('div', 'ov-event' + (event.team === 0 ? ' team-blue' : event.team === 1 ? ' team-orange' : ''));
          row.appendChild(el('span', 'who', event.who));
          row.appendChild(el('span', 'what', event.what));
          wrap.appendChild(row);
        });
      clear(node);
      node.appendChild(wrap);
    },

    chat: function (node) {
      var wrap = el('div', 'ov-chat');
      wrap.appendChild(el('div', 'ov-chat-title', 'CHAT'));
      var messages = App.chat.slice(-CHAT_MAX);
      messages.forEach(function (message, index) {
        var row = el('div', 'ov-chat-msg' + (index < messages.length - 6 ? ' ov-chat-fade' : ''));
        var user = el('span', 'ov-chat-user', message.user);
        user.style.color = message.color || 'var(--ov-accent)';
        row.appendChild(user);
        if (params.get('badges') !== '0') {
          (message.badges || []).slice(0, 2).forEach(function (badge) {
            row.appendChild(el('span', 'ov-chat-badge', badge));
          });
        }
        renderChatText(row, message);
        wrap.appendChild(row);
      });
      clear(node);
      node.appendChild(wrap);
    },

    brand: function (node) {
      var tokens = (App.config && App.config.pack && App.config.pack.tokens) || {};
      var url = params.get('brand') || tokens.brandLogo || '';
      var text = params.get('brandText') || tokens.brandText || 'RL STATS';
      var wrap = el('div', 'ov-brand');
      var logo = logoNode(url, 'ov-brand-logo');
      if (logo) wrap.appendChild(logo);
      wrap.appendChild(el('div', 'ov-brand-text', text));
      clear(node);
      node.appendChild(wrap);
    },

    countdown: function (node) {
      var wrap = el('div', 'ov-countdown');
      var timer = App.timer;
      if (timer && timer.running) {
        wrap.appendChild(el('div', 'ov-countdown-label', timer.label || 'COMIENZA EN'));
        var value = el('div', 'ov-countdown-value', formatClock(Math.max(0, (timer.endsAt - Date.now()) / 1000)));
        value.dataset.role = 'timer-value';
        wrap.appendChild(value);
      } else {
        wrap.appendChild(el('div', 'ov-countdown-label', 'ESPERANDO'));
        wrap.appendChild(el('div', 'ov-countdown-value', nextMatchLabel()));
      }
      clear(node);
      node.appendChild(wrap);
    },

    timer: function (node) {
      var timer = App.timer || {};
      var wrap = el('div', 'ov-countdown');
      wrap.appendChild(el('div', 'ov-countdown-label', timer.label || 'TIEMPO'));
      var value = el('div', 'ov-countdown-value', formatClock(Math.max(0, (timer.endsAt - Date.now()) / 1000)));
      value.dataset.role = 'timer-value';
      wrap.appendChild(value);
      clear(node);
      node.appendChild(wrap);
    },

    socials: function (node) {
      var tokens = (App.config && App.config.pack && App.config.pack.tokens) || {};
      var raw = params.get('socials') || tokens.socialsText || 'twitch.tv/  ·  youtube.com/@  ·  discord.gg/';
      var wrap = el('div', 'ov-socials');
      raw.split('|').forEach(function (entry) {
        wrap.appendChild(el('span', '', entry.trim()));
      });
      clear(node);
      node.appendChild(wrap);
    },

    sponsors: function (node) {
      var wrap = el('div', 'ov-sponsor');
      if (App.sponsors.length) {
        var url = App.sponsors[App.sponsorIndex % App.sponsors.length];
        var img = logoNode(url, '');
        if (img) wrap.appendChild(img);
      } else {
        wrap.appendChild(el('div', 'ov-brand-text', 'TU SPONSOR'));
      }
      clear(node);
      node.appendChild(wrap);
    },

    replaybadge: function (node) {
      var wrap = el('div', 'ov-replay', 'REPLAY');
      wrap.style.visibility = App.replay ? 'visible' : 'hidden';
      clear(node);
      node.appendChild(wrap);
    },

    upnext: function (node) {
      var wrap = el('div', 'ov-upnext');
      wrap.appendChild(el('div', 'ov-upnext-title', 'PRÓXIMO PARTIDO'));
      var match = el('div', 'ov-upnext-match');
      match.appendChild(el('span', '', teamName('blue')));
      match.appendChild(el('span', '', 'VS'));
      match.appendChild(el('span', '', teamName('orange')));
      wrap.appendChild(match);
      var series = App.series || {};
      var played = series.games ? series.games.length : 0;
      wrap.appendChild(
        el(
          'div',
          'ov-upnext-title',
          series.available ? 'MAPA ' + (played + 1) + ' DE ' + (series.format || 3) : actualStateLabel()
        )
      );
      clear(node);
      node.appendChild(wrap);
    },

    mvp: function (node) {
      var match = App.match || {};
      var winnerTeam = match.scoreBlue >= match.scoreOrange ? 0 : 1;
      var players = playersFor(winnerTeam);
      var wrap = el('div', 'ov-mvp');
      wrap.appendChild(el('div', 'ov-mvp-title', 'MVP'));
      if (players.length) {
        var top = players[0];
        wrap.appendChild(el('div', 'ov-mvp-name', top.name || '—'));
        wrap.appendChild(
          el(
            'div',
            'ov-mvp-stats',
            (top.goals || 0) + ' GOLES · ' + (top.assists || 0) + ' ASIST · ' + (top.saves || 0) + ' SAVES'
          )
        );
      } else {
        wrap.appendChild(el('div', 'ov-mvp-name', '—'));
      }
      clear(node);
      node.appendChild(wrap);
    },

    info: function (node) {
      var match = App.match || {};
      var wrap = el('div', 'ov-upnext');
      wrap.appendChild(el('div', 'ov-upnext-title', prettyArena(match.arena) || 'SIN PARTIDA'));
      wrap.appendChild(el('div', 'ov-upnext-match', actualStateLabel()));
      clear(node);
      node.appendChild(wrap);
    }
  };

  function actualStateLabel() {
    var state = (App.config && App.config.state) || 'waiting';
    var labels = {
      waiting: 'ESPERANDO AL SIGUIENTE',
      live: 'EN VIVO',
      replay: 'REPLAY',
      post: 'POST-PARTIDO',
      brb: 'VOLVEMOS EN UN MOMENTO'
    };
    return labels[state] || state.toUpperCase();
  }

  function nextMatchLabel() {
    var series = App.series || {};
    if (series.available) return 'MAPA ' + ((series.games ? series.games.length : 0) + 1);
    return actualStateLabel();
  }

  function renderChatText(row, message) {
    var text = message.text || '';
    var emotes = message.emotes || [];
    if (!emotes.length) {
      row.appendChild(document.createTextNode(text));
      return;
    }
    var remaining = text;
    emotes.forEach(function (emote) {
      var index = remaining.indexOf(emote.name);
      if (index === -1) return;
      if (index > 0) row.appendChild(document.createTextNode(remaining.slice(0, index)));
      var img = document.createElement('img');
      img.className = 'ov-chat-emote';
      img.src = emote.url;
      img.alt = emote.name;
      img.title = emote.name;
      row.appendChild(img);
      remaining = remaining.slice(index + emote.name.length);
    });
    if (remaining) row.appendChild(document.createTextNode(remaining));
  }

  var MODULE_ORDER = [
    'scorebug',
    'series',
    'roster',
    'events',
    'chat',
    'brand',
    'countdown',
    'timer',
    'socials',
    'sponsors',
    'replaybadge',
    'upnext',
    'mvp',
    'info'
  ];

  function renderAll() {
    applyTeamVariables();
    var visibility = App.visible || {};
    App.modules.forEach(function (module, key) {
      var renderer = renderers[module.spec.module];
      var shouldShow =
        renderer &&
        module.spec.enabled !== false &&
        visibility[key] !== false &&
        (module.spec.visible === undefined || module.spec.visible === true);
      if (!shouldShow) {
        module.el.classList.add('ov-hidden');
        return;
      }
      module.el.classList.remove('ov-hidden');
      renderer(module.el, module.spec);
    });
    updateTimerTicks();
  }

  function updateTimerTicks() {
    document.querySelectorAll('[data-role="timer-value"]').forEach(function (node) {
      var timer = App.timer;
      if (!timer || !timer.running) return;
      node.textContent = formatClock(Math.max(0, (timer.endsAt - Date.now()) / 1000));
    });
  }

  window.setInterval(updateTimerTicks, 250);

  // ------------------------------------------------------------------ alerts

  function pushEvent(event) {
    App.events.unshift(event);
    App.events = App.events.slice(0, 24);
  }

  var EVENT_LABELS = {
    Goal: 'GOL',
    Save: 'SAVE',
    EpicSave: 'EPIC SAVE',
    Demolish: 'DEMO',
    Demo: 'DEMO',
    HatTrick: 'HAT TRICK',
    AerialGoal: 'GOL AÉREO',
    Assists: 'ASISTENCIA',
    SaveAssist: 'ASIST. DE SAVE',
    Shot: 'TIRO'
  };

  function pushAlert(title, subtitle, team) {
    if (!alertsLayer) return;
    if (App.activeAlerts >= ALERT_MAX) {
      if (alertsLayer.firstChild) {
        alertsLayer.removeChild(alertsLayer.firstChild);
        App.activeAlerts = Math.max(0, App.activeAlerts - 1);
      } else {
        return;
      }
    }
    var card = el('div', 'ov-alert');
    if (team === 0) card.style.borderLeftColor = 'var(--ov-team-blue)';
    if (team === 1) card.style.borderLeftColor = 'var(--ov-team-orange)';
    card.appendChild(el('div', 'ov-alert-title', title));
    if (subtitle) card.appendChild(el('div', 'ov-alert-sub', subtitle));
    alertsLayer.appendChild(card);
    App.activeAlerts += 1;
    window.setTimeout(function () {
      card.classList.add('leaving');
      window.setTimeout(function () {
        if (card.parentNode) card.parentNode.removeChild(card);
        App.activeAlerts = Math.max(0, App.activeAlerts - 1);
      }, 240);
    }, ALERT_DURATION);
  }

  function showGoal(data) {
    if (!goalLayer || !data) return;
    var card = el('div', 'ov-goal-card');
    card.appendChild(el('div', 'ov-goal-kicker', data.teamNum === 0 ? 'GOL DE ' + teamName('blue') : 'GOL DE ' + teamName('orange')));
    card.appendChild(el('div', 'ov-goal-scorer', data.scorerName || '—'));
    var meta = [];
    if (data.goalTime) meta.push('TIEMPO ' + formatClock(data.goalTime));
    if (data.goalSpeed) meta.push('VELOCIDAD ' + Math.round(data.goalSpeed) + ' KM/H');
    if (meta.length) card.appendChild(el('div', 'ov-goal-meta', meta.join('  ·  ')));
    clear(goalLayer);
    goalLayer.appendChild(card);
    goalLayer.classList.add('visible');
    if (App.goalTimer) window.clearTimeout(App.goalTimer);
    App.goalTimer = window.setTimeout(function () {
      goalLayer.classList.remove('visible');
    }, GOAL_DURATION);
    if (ALERT_TYPES.indexOf('Goal') !== -1) {
      pushAlert('GOL', data.scorerName || '', data.teamNum);
    }
  }

  function pushChat(message) {
    if (!message || typeof message.text !== 'string') return;
    App.chat.push(message);
    if (App.chat.length > 80) App.chat = App.chat.slice(-80);
    requestRender();
  }

  // --------------------------------------------------------------- websocket

  function connect() {
    var host = window.location.host || '127.0.0.1:9528';
    var protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    var url = protocol + '://' + host + '/ws?token=' + encodeURIComponent(TOKEN);
    App.status = 'connecting';
    var socket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      scheduleReconnect();
      return;
    }
    App.ws = socket;

    socket.onopen = function () {
      App.backoff = 1000;
      App.status = 'online';
    };
    socket.onmessage = function (event) {
      var message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      handleMessage(message);
    };
    socket.onclose = function () {
      App.status = 'offline';
      scheduleReconnect();
    };
    socket.onerror = function () {
      try {
        socket.close();
      } catch (error) {
        /* noop */
      }
    };
  }

  function scheduleReconnect() {
    window.setTimeout(connect, App.backoff);
    App.backoff = Math.min(App.backoff * 2, 10000);
  }

  function handleMessage(message) {
    var data = message.data || {};
    switch (message.type) {
      case 'state':
        App.match = data;
        App.paused = false;
        requestRender();
        break;
      case 'scene':
        App.config = data;
        applyPack(data);
        applyLayout(data);
        App.series = data.series || App.series;
        requestRender();
        break;
      case 'series':
        App.series = data;
        requestRender();
        break;
      case 'goal':
        pushEvent({ who: data.scorerName || '', what: 'GOL', team: data.teamNum });
        showGoal(data);
        requestRender();
        break;
      case 'statfeed': {
        var name = data.eventName || '';
        var player = (data.mainTarget && data.mainTarget.name) || '';
        var team = data.mainTarget ? data.mainTarget.teamNum : undefined;
        pushEvent({ who: player, what: EVENT_LABELS[name] || name.toUpperCase(), team: team });
        if (ALERT_TYPES.indexOf(name) !== -1 && name !== 'Goal') {
          pushAlert(EVENT_LABELS[name] || name.toUpperCase(), player, team);
        }
        requestRender();
        break;
      }
      case 'ball_hit':
        if (typeof data.teamNum === 'number' && data.teamNum >= 0 && App.match) {
          App.match.lastTouchTeam = data.teamNum;
        }
        break;
      case 'clock':
        if (App.match) {
          App.match.timeRemaining = data.time;
          requestRender();
        }
        break;
      case 'match_started':
        App.replay = false;
        App.paused = false;
        requestRender();
        break;
      case 'match_ended':
        requestRender();
        break;
      case 'replay_start':
        App.replay = true;
        requestRender();
        break;
      case 'replay_end':
        App.replay = false;
        requestRender();
        break;
      case 'match_paused':
        App.paused = true;
        requestRender();
        break;
      case 'match_unpaused':
        App.paused = false;
        requestRender();
        break;
      case 'countdown_begin':
        pushAlert('KICKOFF', '', undefined);
        break;
      case 'chat':
        pushChat(data);
        break;
      case 'graphic':
        if (data.id) {
          App.visible[data.id] = data.visible !== false;
          requestRender();
        }
        break;
      case 'timer':
        App.timer = data.running ? data : null;
        requestRender();
        break;
      case 'server_stopped':
        App.status = 'offline';
        requestRender();
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------- boot

  function fetchConfig() {
    var query = new URLSearchParams();
    if (TOKEN) query.set('token', TOKEN);
    if (SCENE_ID) query.set('scene', SCENE_ID);
    if (PACK_OVERRIDE) query.set('pack', PACK_OVERRIDE);
    if (STATE_OVERRIDE) query.set('state', STATE_OVERRIDE);
    return fetch('/api/v2/scene?' + query.toString())
      .then(function (response) {
        return response.json();
      })
      .then(function (config) {
        App.config = config;
        applyPack(config);
        applyLayout(config);
        App.series = config.series || null;
        requestRender();
      })
      .catch(function () {
        /* The WebSocket scene event will retry the config. */
      });
  }

  if (window.ResizeObserver) {
    new ResizeObserver(repositionAll).observe(stage);
  } else {
    window.addEventListener('resize', repositionAll);
  }

  window.setInterval(function () {
    App.sponsorIndex += 1;
    requestRender();
  }, SPONSOR_INTERVAL);

  fetchConfig().then(connect);

  window.RLOverlayEngine = {
    app: App,
    renderers: renderers,
    formatClock: formatClock
  };
})();
