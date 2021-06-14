/*
 * index.js
 */

const fs = require('fs')
const chalk = require('chalk')
const { parse } = require('./parser.js')
const { build, instantiate } = require('./builder.js')


/*
 * TODO:
 * - implement interpreter
 * - instantiate module
 */


/*
 * Demo
 */

const util = require('util')
util.inspect.defaultOptions = {
    depth: 10,
    breakLength: 136,
}

const buffer = fs.readFileSync('./main.wasm')
const result = parse(buffer)

console.log(result)

const wasmModule = build(result.sections)

console.log(wasmModule)

const instance = instantiate(wasmModule, {
    env: {
        log_message: m => console.log(chalk.bold.yellow('[log_message] ') + m),
    }
})

console.log(instance)

console.log('')
console.log(instance.module.functions[1])

console.log('')
console.log(chalk.bold('Running .add_one_and_log:'))

try {
    instance.exports.add_one_and_log(1)
} catch (err) {
    console.log(chalk.bold('Got error: ') + err.message)
}
