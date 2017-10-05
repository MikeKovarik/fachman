import events from 'events'
import os from 'os'
import {isNode} from './platform.mjs'


export var childIdentifArg = 'is-child-worker'

// Tiny promisified version of setTimeout
export var timeout = (millis = 0) => new Promise(resolve => setTimeout(resolve, millis))

export function getCpuCores() {
	if (isNode)
		return os.cpus().length || 1
	else
		return navigator.hardwareConcurrency || 1
}

export const PRIVATE_EVENT_ONLINE = '__thread_online__'
export const PRIVATE_EVENT_EXIT   = '__thread_exit__'