const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const order = ['index.html', 'sphere-manager.js', 'score-manager.js', 'floating-number.js', 'data-manager.js'];

function build() {
    const files = {};
    order.forEach(name => {
        files[name] = fs.readFileSync(path.join(root, 'practice', name), 'utf8').replace(/\r\n/g, '\n');
    });
    return `(function (root) {\n    const WSA = root.WSA = root.WSA || {};\n    WSA.practiceFiles = ${JSON.stringify(files, null, 4).replace(/\n/g, '\n    ')};\n    if (typeof module !== 'undefined') module.exports = WSA;\n})(typeof window !== 'undefined' ? window : globalThis);\n`;
}

if (require.main === module) {
    fs.writeFileSync(path.join(root, 'js', 'practice-files.js'), build());
    console.log('Wrote js/practice-files.js');
}

module.exports = build;
