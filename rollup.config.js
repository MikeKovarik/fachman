import fs from 'fs'


var pkg = fs.readFileSync('package.json')
pkg = JSON.parse(pkg.toString())

// TODO: define globals with list of Node core modules to prevent bundle to import 'events'
//       as window.$1events

export default {
	input: 'index.mjs',
	output: {
		file: `index.js`,
		format: 'umd',
	},
	name: pkg.name,
}
