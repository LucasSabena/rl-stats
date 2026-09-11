/*!
 * RL Overlay SDK v1.1.0
 * Minimal JavaScript SDK for building custom OBS overlays that connect to
 * the RL Stats overlay server.
 *
 * Dependency-free, vanilla JS (ES5 compatible).
 *
 * Usage:
 *   <script src="http://127.0.0.1:9528/sdk/rl-overlay.js"></script>
 *   <script>
 *     var overlay = RLOverlay.connect();
 *     overlay.on('state', function(s) { console.log(s.scoreBlue); });
 *   </script>
 *
 * The SDK auto-detects the port from the page URL, picks up the `token`
 * query parameter (required for overlays loaded from `file://`), and
 * normalizes the legacy `snapshot` event to `state`.
 *
 * @license MIT
 */
(function () {
  'use strict';

  // =========================================================================
  //  Helpers
  // =========================================================================

  function queryParam(name) {
    try {
      if (typeof URLSearchParams === 'function') {
        return new URLSearchParams(window.location.search).get(name) || '';
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // =========================================================================
  //  Event emitter helpers
  // =========================================================================

  function createEmitter() {
    var listeners = {};

    return {
      on: function (event, fn) {
        if (typeof fn !== 'function') { return; }
        if (!listeners[event]) { listeners[event] = []; }
        listeners[event].push(fn);
      },

      off: function (event, fn) {
        var stack = listeners[event];
        if (!stack) { return; }
        if (fn) {
          for (var i = stack.length - 1; i >= 0; i--) {
            if (stack[i] === fn) { stack.splice(i, 1); }
          }
        } else {
          delete listeners[event];
        }
      },

      emit: function (event, data) {
        var stack = listeners[event];
        if (!stack) { return; }
        for (var i = 0; i < stack.length; i++) {
          try { stack[i](data); } catch (e) { /* silent */ }
        }
      },

      removeAll: function () {
        listeners = {};
      }
    };
  }

  // =========================================================================
  //  Connection factory (private)
  // =========================================================================

  function createConnection(opts) {
    opts = opts || {};

    var host = opts.host || '127.0.0.1';
    var port = opts.port || (window.location.port ? Number(window.location.port) : 9528);
    var token = opts.token || queryParam('token') || window.__RL_TOKEN__ || '';
    var initialDelay = (typeof opts.reconnectDelay === 'number') ? opts.reconnectDelay : 1000;
    var url = 'ws://' + host + ':' + port + '/ws' + (token ? '?token=' + encodeURIComponent(token) : '');

    var emitter = createEmitter();
    var ws = null;
    var connected = false;
    var manualClose = false;
    var lastState = null;
    var reconnectTimer = null;
    var reconnectDelay = initialDelay;

    // -- Internal helpers ---------------------------------------------------

    function connect() {
      // Prevent overlapping connections
      if (ws && (ws.readyState === WebSocket.CONNECTING ||
                 ws.readyState === WebSocket.OPEN)) {
        return;
      }
      manualClose = false;

      try {
        ws = new WebSocket(url);
      } catch (e) {
        scheduleReconnect();
        return;
      }

      ws.onopen = function () {
        connected = true;
        reconnectDelay = initialDelay;
        emitter.emit('connected');
      };

      ws.onmessage = function (msg) {
        var payload;
        try { payload = JSON.parse(msg.data); }
        catch (e) { return; } // ignore malformed JSON

        var type = payload.type;
        var data = payload.data;

        switch (type) {
          case 'connected':
            connected = true;
            emitter.emit('connected');
            break;
          // `snapshot` is the legacy name for the full-state event; the
          // server emits `state`, but third-party servers may still send it.
          case 'state':
          case 'snapshot':
            lastState = data;
            emitter.emit('state', data);
            break;
          case 'goal':
            emitter.emit('goal', data);
            break;
          case 'statfeed':
            emitter.emit('statfeed', data);
            break;
          case 'ball_hit':
            emitter.emit('ball_hit', data);
            break;
          case 'clock':
            emitter.emit('clock', data);
            break;
          case 'match_started':
            emitter.emit('match_started');
            break;
          case 'match_ended':
            emitter.emit('match_ended', data);
            break;
          case 'match_paused':
            emitter.emit('match_paused');
            break;
          case 'match_unpaused':
            emitter.emit('match_unpaused');
            break;
          case 'replay_start':
            emitter.emit('replay_start');
            break;
          case 'replay_end':
            emitter.emit('replay_end');
            break;
          case 'countdown_begin':
            emitter.emit('countdown_begin');
            break;
          default:
            // Unknown event types are silently ignored
            break;
        }
      };

      ws.onclose = function () {
        connected = false;
        emitter.emit('disconnected');
        if (!manualClose) { scheduleReconnect(); }
      };

      ws.onerror = function () {
        connected = false;
        // onclose fires afterwards, reconnect logic lives there
      };
    }

    function scheduleReconnect() {
      if (reconnectTimer || manualClose) { return; }
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);
      // Gentle exponential backoff, capped so scene switches recover fast.
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
    }

    function cancelReconnect() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    // -- Public API ---------------------------------------------------------

    var api = {};

    /**
     * Register an event listener.
     * @param {string}   event  Event name (see supported events list)
     * @param {Function} fn     Callback
     */
    api.on = function (event, fn) {
      emitter.on(event, fn);
    };

    /**
     * Remove an event listener. Omit `fn` to remove all for an event.
     * @param {string}   event
     * @param {Function} [fn]
     */
    api.off = function (event, fn) {
      emitter.off(event, fn);
    };

    /**
     * Return the last cached LiveMatchState, or null.
     * @returns {Object|null}
     */
    api.getState = function () {
      return lastState;
    };

    /**
     * Whether the WebSocket is currently connected.
     * @returns {boolean}
     */
    api.isConnected = function () {
      return connected;
    };

    /**
     * Explicitly disconnect. No auto-reconnect after this call.
     */
    api.disconnect = function () {
      manualClose = true;
      cancelReconnect();
      if (ws) {
        ws.close();
        ws = null;
      }
      connected = false;
      lastState = null;
      emitter.removeAll();
    };

    /**
     * Players on a given team from cached state, sorted by score desc.
     * @param {number} team 0 = blue, 1 = orange
     * @returns {Array}
     */
    api.getPlayers = function (team) {
      if (!lastState || !lastState.players) { return []; }
      return lastState.players
        .filter(function (p) { return p.team === team; })
        .sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    };

    /**
     * Blue-team players from cached state, sorted by score desc.
     * @returns {Array}
     */
    api.getBluePlayers = function () {
      return api.getPlayers(0);
    };

    /**
     * Orange-team players from cached state, sorted by score desc.
     * @returns {Array}
     */
    api.getOrangePlayers = function () {
      return api.getPlayers(1);
    };

    /**
     * Format seconds into MM:SS string (e.g. 300 → "5:00", 5 → "0:05").
     * @param {number} seconds
     * @returns {string}
     */
    api.formatTime = function (seconds) {
      if (typeof seconds !== 'number' || seconds < 0) { return '0:00'; }
      var mins = Math.floor(seconds / 60);
      var secs = Math.floor(seconds % 60);
      return mins + ':' + (secs < 10 ? '0' + secs : secs);
    };

    /**
     * Escape a string for safe use in innerHTML. Prefer textContent; use
     * this only when building markup strings.
     * @param {*} value
     * @returns {string}
     */
    api.escapeHtml = escapeHtml;

    // -- Auto-connect on creation -------------------------------------------
    connect();

    return api;
  }

  // =========================================================================
  //  Expose RLOverlay on window
  // =========================================================================

  window.RLOverlay = {
    /**
     * Create and connect a new overlay instance.
     * @param {Object} [opts]            Configuration
     * @param {string} [opts.host]       Server host (default '127.0.0.1')
     * @param {number} [opts.port]       Server port (default from page URL)
     * @param {string} [opts.token]      Bearer token (default from page URL)
     * @param {number} [opts.reconnectDelay]  ms before the first reconnect (default 1000)
     * @returns {Object} Connection instance with .on(), .off(), .getState(), etc.
     */
    connect: function (opts) {
      return createConnection(opts);
    },

    /** Escape helper exposed for overlays that build markup strings. */
    escapeHtml: escapeHtml
  };
})();
