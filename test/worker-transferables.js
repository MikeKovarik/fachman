function echo(arg) {
	return arg
}

function modifyView(original) {
	var view = original
	if (view instanceof ArrayBuffer || view instanceof SharedArrayBuffer)
		view = new Uint8Array(original)
	view[9] = 107 // k
	view[10] = 33  // !
	return original
}