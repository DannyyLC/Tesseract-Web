/**
 * Custom Jest environment that extends jsdom and patches window.location
 * to be writable, so tests can freely set window.location.href.
 */
const { TestEnvironment } = require('jest-environment-jsdom');

class CustomJsdomEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    // Override the window.location property on the underlying JSDOM window
    // (not this.global which is a Proxy) so we can freely read/write href.
    const { window: jsdomWindow } = this.dom;
    // Build a plain location stub
    const locationStub = {
      href: '',
      assign: () => {},
      replace: () => {},
      reload: () => {},
      toString() {
        return this.href;
      },
    };
    // Use Reflect to bypass non-configurability
    Reflect.defineProperty(jsdomWindow, 'location', {
      configurable: true,
      writable: true,
      value: locationStub,
    });
    // Also apply to this.global (the Proxy layer Jest uses)
    Reflect.defineProperty(this.global, 'location', {
      configurable: true,
      writable: true,
      value: locationStub,
    });
  }
}

module.exports = CustomJsdomEnvironment;
