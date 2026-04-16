import '@testing-library/jest-dom';

// jsdom doesn't implement HTMLMediaElement methods — stub them
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => undefined;
window.HTMLMediaElement.prototype.load = () => undefined;
