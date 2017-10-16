import os from 'os'
import {isNode} from './platform.mjs'


// Tiny promisified version of setTimeout
export var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis))

export var MAX_THREADS = 0
if (isNode)
	MAX_THREADS = os.cpus().length || 1
else
	MAX_THREADS = navigator.hardwareConcurrency || 1

export function removeFromArray(array, item) {
	var index = array.indexOf(item)
	if (index !== -1)
		array.splice(index, 1)
}
