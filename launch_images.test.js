/**
 * iPhone launch images (Customer). iOS ignores the manifest background for
 * home-screen apps and shows a blank screen until the page paints, unless an
 * apple-touch-startup-image matches the device exactly. Each image is the
 * opening splash's first frame (plain navy), so tap → navy → HAVEN fades in.
 */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const pre = fs.readFileSync('_shell_pre.txt', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const splashBg = (pre.match(/#haven-splash\{[^}]*background:(#[0-9A-Fa-f]{6})/) || [])[1];
const tags = [...pre.matchAll(/<link rel="apple-touch-startup-image" media="screen and \(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: portrait\)" href="(splash\/[^"]+)"\/>/g)];
ok(tags.length === 13, '13 iPhone screen sizes covered (got ' + tags.length + ')');
ok(pre.indexOf('apple-touch-startup-image') < pre.indexOf('<script'), 'launch images are declared in the head before any script');
ok(html.includes('apple-touch-startup-image'), 'the built index.html carries the launch images');
for (const [, w, h, r, href] of tags) {
  const file = path.join(__dirname, href);
  ok(fs.existsSync(file), href + ' exists');
  const buf = fs.readFileSync(file);
  const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
  ok(pw === w * r && ph === h * r, href + ' is exactly ' + (w * r) + 'x' + (h * r) + ' px');
  ok(buf.length < 2048, href + ' is tiny (' + buf.length + ' bytes)');
}
ok(splashBg && splashBg.toUpperCase() === '#1C2B3A', 'splash first frame is navy #1C2B3A');
console.log(`--- Launch images: ${pass} passing, 0 failing ---`);
