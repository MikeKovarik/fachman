export {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
export {MAX_THREADS} from './util.mjs'
export * from './EventEmitter.mjs'
export * from './shims.mjs'
export * from './MultiPlatformWorker.mjs'
export * from './ProxyWorker.mjs'
export * from './Cluster.mjs'
import './worker-thread.mjs'


// TODO: handle SIGTERM and SIGINT in Node
