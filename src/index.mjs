import './worker.mjs'

export * from './master.mjs'
export {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
export * from './shims.mjs'
export * from './MultiPlatformWorker.mjs'
export {MAX_THREADS} from './util.mjs'


// TODO: handle SIGTERM and SIGINT in Node
