import {isWorker, isNode, isBrowser, launchedAsWrapper} from './platform.mjs'
import {setContext} from './worker-thread.mjs'
import {sanitizePath} from './shim-path.mjs'


if (isNode && isWorker && launchedAsWrapper) {
	// This very script 'fachman' has been spawned as a child process (second argument equals __filename).
	// That means this is a worker thread and wrapping user scripts for easier context accessing is enabled.
	// Now we need to execute (by requiring) user's script he initially wanted to launch in the worker.

	// Delay loading user script until all of fachman is loaded and interpreted.
	// NOTE: This is necessary because rollup shoves all fachman souce files into one. This file will end up
	//       in the middle of it and would start requiring/loading user's worker script before fachman is fully ready.
	setTimeout(loadUserWorkerScript)

	// Import user worker script
	function loadUserWorkerScript() {
		// We've passed path of target worker script from master process to this worker proces in arguments.
		var userScriptRelPath = process.argv[1]
		userScriptRelPath = sanitizePath(userScriptRelPath)
		try {
			// Try to load the path as is (it could be a whole module)
			var ctx = require(userScriptRelPath)
		} catch (e) {
			// If the loading fails, add ./ and try again
			userScriptRelPath = relativizie(userScriptRelPath)
			var ctx = require(userScriptRelPath)
		}
		// Handle transpiler/bundle ES module format using 'default' key.
		if (ctx.hasOwnProperty('default'))
			ctx = ctx['default']
		// And finally set the export context of the module as fachmans lookup input.
		setContext(ctx)
	}

	function relativizie(string) {
		if (!string.startsWith('./') && !string.startsWith('../'))
			return './' + string
	}
}


// Browser is capable of creating worker code dynamically in browser by turning the code into blob and then to url.

var blobUrl

export function getBlobUrl(esm = false) {
	// TODO: ES Module support when it's available in browsers
	if (!blobUrl) {
		// Note: Relative URLs can't be used in blob worker.
		//       Absolute paths of scripts to import has to be sent through message.
		var code = `
			self.onmessage = e => {
				var {fachmanPath, workerPath} = e.data
				self.onmessage = undefined
				importScripts(fachmanPath, workerPath)
			}
			`
		blobUrl = createBlobUrl(code)
	}
	return blobUrl
}

function createBlobUrl(string) {
	var blob = new Blob([string], {type: 'application/javascript'})
	return URL.createObjectURL(blob)
}