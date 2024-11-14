const terser = require('@rollup/plugin-terser')

const pkg = require("./package.json")

const { name, version } = pkg
// const dist_name = name + "-" + version

module.exports = {
    input: 'src/main.js',
    output: [{
        file: 'dist/' + name + '.mjs',
        format: 'es'
    }, {
        file: 'dist/' + name + '.min.mjs',
        format: 'es',
        plugins: [terser()]
    }, {
        name: name,
        file: 'dist/' + name + '.umd.js',
        format: 'umd',
    }, {
        name: name,
        file: 'dist/' + name + '.umd.min.js',
        format: 'umd',
        plugins: [terser()]
    }]
}
