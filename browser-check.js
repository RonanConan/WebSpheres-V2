const WebSpheresBrowser = (() => {
    function supported(brands) {
        const list = brands || (navigator.userAgentData && navigator.userAgentData.brands);
        if (!list) return false;
        const names = list.map(b => b.brand).filter(name => !/^not.a.brand/i.test(name));
        if (names.some(name => ['Google Chrome', 'Microsoft Edge', 'HeadlessChrome'].includes(name))) return true;
        return names.length === 1 && names[0] === 'Chromium';
    }
    return { supported };
})();

if (typeof module !== 'undefined') module.exports = WebSpheresBrowser;
