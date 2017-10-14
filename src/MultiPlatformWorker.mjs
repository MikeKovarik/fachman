import BrowserWorker from './MultiPlatformWorker-browser.mjs'
import NodeWorker from './MultiPlatformWorker-node.mjs'
import {isBrowser} from './platform.mjs'


// WebWorker native class or shim for node's spawn
export var MultiPlatformWorker = isBrowser ? BrowserWorker : NodeWorker
export default MultiPlatformWorker