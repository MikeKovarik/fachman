import './worker.mjs'

export * from './master.mjs'
export {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
export {EventEmitter, Worker} from './shims.mjs'
export {MAX_THREADS} from './util.mjs'


// TODO: handle SIGTERM and SIGINT in Node
