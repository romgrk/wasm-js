/*
 * assertions.js
 */


module.exports = {
    assert,
    unreachable,
}


function unreachable() {
    assert(false, 'unreachable')
}

function assert(expression, message) {
    if (!expression)
        throw new Error(message)
}
