/*
 * builder.js
 */

const { OP, SECTIONS, EXTERNAL_KIND, NAME_TYPE } = require('./parser.js')
const { assert, unreachable } = require('./assertions.js')


/*
 * Constants
 */

const SOURCE = {
    IMPORT: 'import',
    LOCAL:  'local',
}


/*
 * Exports
 */

module.exports = {
    build,
    instantiate,
}


/*
 * Functions
 */

function build(sections) {
    const module = {
        name: undefined,
        types: [],
        localFunctionsStart: undefined,
        functions: [],
        tables: [],
        memories: [],
        globals: [],
        exports: {},
        startFunction: undefined,
        elementSegments: [],
        dataSegments: [],
        warnings: [],
    }

    let functionIndex = 0

    sections.forEach(section => {
        switch (section.code) {
            case SECTIONS.TYPE: {
                module.types = section.data.entries
                break
            }
            case SECTIONS.IMPORT: {
                for (let i = 0; i < section.data.entries.length; i++) {
                    const entry = section.data.entries[i]

                    switch (entry.kind) {
                        case EXTERNAL_KIND.FUNCTION:
                            module.functions.push({
                                index: functionIndex++,
                                source: SOURCE.IMPORT,
                                name: undefined,
                                type: module.types[entry.type],
                                data: entry,
                            })
                            break
                        case EXTERNAL_KIND.TABLE:
                            module.tables.push({
                                source: SOURCE.IMPORT,
                                elementType: entry.type.elementType,
                                limits: entry.type.limits,
                            })
                            break
                        case EXTERNAL_KIND.MEMORY:
                            module.memories.push({
                                source: SOURCE.IMPORT,
                                ...entry.type
                            })
                            break
                        case EXTERNAL_KIND.GLOBAL:
                            module.globals.push({
                                source: SOURCE.IMPORT,
                                ...entry.type,
                            })
                            break
                        default:
                            unreachable()
                    }
                }
                break
            }
            case SECTIONS.FUNCTION: {
                const types = section.data.types

                module.localFunctionsStart = functionIndex

                for (let i = 0; i < types.length; i++) {
                    module.functions.push({
                        index: functionIndex++,
                        source: SOURCE.LOCAL,
                        name: undefined,
                        type: types[i],
                        data: undefined,
                    })
                }
                break
            }
            case SECTIONS.TABLE: {
                const entries = section.data.entries
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i]
                    module.tables.push({
                        source: SOURCE.LOCAL,
                        elementType: entry.elementType,
                        limits: entry.limits,
                    })
                }
                break
            }
            case SECTIONS.MEMORY: {
                const entries = section.data.entries
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i]
                    module.memories.push({
                        source: SOURCE.LOCAL,
                        ...entry
                    })
                }
                break
            }
            case SECTIONS.GLOBAL: {
                const globals = section.data.globals
                for (let i = 0; i < globals.length; i++) {
                    const global = globals[i]
                    module.globals.push({
                        source: SOURCE.LOCAL,
                        ...global
                    })
                }
                break
            }
            case SECTIONS.EXPORT: {
                module.exports = section.data.entries
                break
            }
            case SECTIONS.START: {
                module.startFunction = section.data.index
                break
            }
            case SECTIONS.ELEMENT: {
                /*
                 * Fill module.tables with element segments
                 */

                module.elementSegments = section.data.entries

                /*
                for (let i = 0; i < elementSegments.length; i++) {
                    const segment = elementSegments[i]
                    const table = module.tables[segment.index]

                    assert(table !== undefined, 'Element section: wrong table index: ' + segment.index)

                    for (let i = 0; i < segment.elements.length; i++) {
                        table.data[segment.offset + i] = segment.elements[i]
                    }
                }
                */

                break
            }
            case SECTIONS.CODE: {
                /*
                 * Function definitions
                 */

                const bodies = section.data.bodies
                for (let i = 0; i < bodies.length; i++) {
                    const fn = module.functions[module.localFunctionsStart + i]
                    fn.data = bodies[i]
                }
                break
            }
            case SECTIONS.DATA: {
                /*
                 * Data to fill memories
                 */

                module.dataSegments = section.data.entries
                break
            }

            case SECTIONS.CUSTOM: {
                if (section.name === 'name') {
                    const entries = section.data.entries

                    for (let i = 0; i < entries.length; i++) {
                        const entry = entries[i]

                        switch (entry.type) {
                            case NAME_TYPE.MODULE: {
                                module.name = entry.data.name
                                break
                            }
                            case NAME_TYPE.FUNCTION: {
                                const names = entry.data.names
                                for (let i = 0; i < names.length; i++) {
                                    const naming = names[i]
                                    const fn = module.functions[naming.index]
                                    if (fn === undefined)
                                        module.warnings.push({ message: `Undefined function index: ${naming.index} "${naming.name}"` })
                                    else
                                        fn.name = naming.name
                                }
                                break
                            }
                            case NAME_TYPE.LOCAL: {
                                /* const names = entry.data.names
                                 * for (let i = 0; i < names.length; i++) {
                                 *     const naming = names[i]
                                 *     module.functions[naming.index].name = naming.name
                                 * } */
                                break
                            }
                            default:
                                unreachable()
                        }
                    }
                    break
                }
            }

            default: // eslint-disable-line no-fallthrough
                break
        }
    })

    return module
}

function instantiate(module, imports) {
    const instance = {
        module: module,
        stack: [],

        functions: [],
        tables: [],
        memories: [],
        globals: [],
        exports: {},

    }

    module.functions.forEach(fn => {
        if (fn.source === SOURCE.IMPORT) {
            const fnModule = imports[fn.data.moduleName]
            assert(fnModule !== undefined, `Module "${fn.data.moduleName}" undefined`)
            const fnInstance = fnModule[fn.data.fieldName]
            assert(fnInstance !== undefined, `Property "${fn.data.fieldName}" of module "${fn.data.moduleName}" undefined`)
            assert(typeof fnInstance === 'function', `Property "${fn.data.fieldName}" of module "${fn.data.moduleName}" is not a function`)
            instance.functions.push(fnInstance)
        }
        else if (fn.source === SOURCE.LOCAL) {
            instance.functions.push((...args) => {
                return callFunction(instance, fn, args)
            })
        }
        else {
            unreachable()
        }
    })

    module.tables.forEach(table => {
        instance.tables.push(Array(table.limits.initial).fill(undefined))
    })

    module.memories.forEach(memory => {
        instance.memories.push(Array(memory.limits.initial).fill(undefined))
    })

    module.globals.forEach(global => {
        switch (global.source) {
            case SOURCE.IMPORT:
                instance.globals.push(createGlobalAccessor(imports[global.moduleName], global.fieldName))
                break
            case SOURCE.LOCAL:
                instance.globals.push({ value: runExpression(instance, global.initExpression) })
                break
            default:
                unreachable()
        }
    })

    module.exports.forEach(entry => {
        switch (entry.kind) {
            case EXTERNAL_KIND.FUNCTION:
                instance.exports[entry.field] = instance.functions[entry.index]
                break;
            case EXTERNAL_KIND.TABLE: {
                Object.defineProperty(instance.exports, entry.field, {
                    enumerable: true,
                    get: () => instance.tables[entry.index]
                })
                break
            }
            case EXTERNAL_KIND.MEMORY: {
                Object.defineProperty(instance.exports, entry.field, {
                    enumerable: true,
                    get: () => instance.memories[entry.index]
                })
                break
            }
            case EXTERNAL_KIND.GLOBAL: {
                const globalEntry = module.globals[entry.index]
                const desc = {
                    enumerable: true,
                    get: () => instance.globals[entry.index].value
                }
                if (globalEntry.mutability)
                    desc.set = (value) => instance.globals[entry.index].value = value

                Object.defineProperty(instance.exports, entry.field, desc)
                break
            }
            default:
                unreachable()
        }
    })

    return instance
}

function createGlobalAccessor(module, field) {
    const object = {}
    Object.defineProperty(object, 'value', {
        get: () => module[field],
        set: value => module[field] = value,
    })
    return object
}

function callFunction(instance, fn, args) {
    throw new Error('not implemented')
}

function compileFunction(instance, fn) {
}

function runExpression(instance, code) {
    const currentInstance = { ...instance, stack: [] }

    let index = 0
    while (code[index] !== undefined) {
        const op = code[index]

        if (op.code === OP.END)
            break

        runExpressionOp(currentInstance, op)

        index++
    }

    return currentInstance.stack.pop()
}

function runExpressionOp(instance, op) {
    switch (op.code) {
        case OP.GET_GLOBAL:
            instance.stack.push(instance.globals[op.data])
            break;

        case OP.I32_CONST:
            instance.stack.push(op.data)
            break;
        case OP.I64_CONST:
            instance.stack.push(op.data)
            break;
        case OP.F32_CONST: // XXX(really read a float)
            instance.stack.push(op.data)
            break;
        case OP.F64_CONST: // XXX(really read a float)
            instance.stack.push(op.data)
            break;

        default:
            unreachable()
    }
}
