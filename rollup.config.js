const terser = require('@rollup/plugin-terser')
const path = require("path")
const pkg = require("./package.json")

const { name, version } = pkg
const basename = path.basename(name)

module.exports = {
    input: 'src/main.js',
    output: [{
        file: 'dist/' + basename + '.mjs',
        format: 'es'
    }, {
        file: 'dist/' + basename + '.min.mjs',
        format: 'es',
        plugins: [terser()]
    }, {
        name: basename,
        file: 'dist/' + basename + '.umd.js',
        format: 'umd',
    }, {
        name: basename,
        file: 'dist/' + basename + '.umd.min.js',
        format: 'umd',
        plugins: [terser()]
    }]
}
