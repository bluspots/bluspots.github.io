// Boot check of the SHIPPED artifact: extract the actual <script type="text/babel">
// content from prototype.html itself (not re-derived from the jsx source) and
// confirm it compiles and renders the Home screen.
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement; global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement; global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;

const { render, screen } = require('@testing-library/react');
const { act } = require('react-dom/test-utils');
const babel = require('@babel/core');
const fs = require('fs');
const React = require('react');

const html = fs.readFileSync('prototype.html', 'utf8');
const scriptMatch = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('BOOT CHECK FAILED: no <script type="text/babel"> block found in prototype.html'); process.exit(1); }
let scriptBody = scriptMatch[1];

// The shipped script ends with root.render(...) using the real ReactDOM API,
// which we don't have in this harness — strip just that trailing render call
// and replace with a version we can capture, without touching anything else.
scriptBody = scriptBody.replace(
  /const root = ReactDOM\.createRoot\(document\.getElementById\('root'\)\);\s*root\.render\(<ErrorBoundary><App\/><\/ErrorBoundary>\);\s*$/,
  'module.exports.App = App; module.exports.ErrorBoundary = ErrorBoundary;'
);

const { code } = babel.transformSync(scriptBody, { presets: [['@babel/preset-react', { runtime: 'classic' }]], filename: 'shipped.jsx' });
const moduleObj = { exports: {} };
const fn = eval(`(function(React, module){ ${code} \n})`);
fn(React, moduleObj);

const { App, ErrorBoundary } = moduleObj.exports;
if (typeof App !== 'function') { console.error('BOOT CHECK FAILED: App not defined in shipped script block'); process.exit(1); }
if (typeof ErrorBoundary !== 'function') { console.error('BOOT CHECK FAILED: ErrorBoundary not defined in shipped script block'); process.exit(1); }

act(() => { render(React.createElement(ErrorBoundary, null, React.createElement(App))); });
const booted = !!screen.queryByText(/need done/);
console.log(booted ? 'BOOT CHECK OK: prototype.html\'s actual shipped script block renders the Home screen, wrapped in ErrorBoundary' : 'BOOT CHECK FAILED: Home screen did not render');
process.exit(booted ? 0 : 1);
