/** Registers the classic CDN browser build before the game scripts load.
 * Ordinary script tags work from file:// without module CORS requests.
 */
(function (global) {
  'use strict';
  const namespace = global.Starhound = global.Starhound || {};
  if (!global.THREE || global.THREE.REVISION !== '160') {
    document.getElementById('load-error').classList.remove('hidden');
    return;
  }
  namespace.THREE = global.THREE;
})(window);
