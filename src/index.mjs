export {isMaster, isWorker, isNode, isBrowser} from './platform.mjs'
import './shim-node-globals.mjs'
export * from './shim-events.mjs'
export * from './shim-ipc.mjs'
import './construct-wrapper.mjs'
export {MAX_THREADS} from './util.mjs'
export * from './MultiPlatformWorker.mjs'
export * from './ProxyWorker.mjs'
export * from './Cluster.mjs'
export * from './worker-thread.mjs'

// TODO: handle SIGTERM and SIGINT in Node
