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
                                type: entry.type,
                                // typeString: typeToString(module.types[entry.type]),
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
                        // typeString: typeToString(module.types[types[i]]),
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

function callFunction(instance, fn, args) {
    throw new Error('not implemented')
}

function compileFunction(instance, fn) {
}

function compileOp(context, op) {
    switch (op.code) {
        case OP.UNREACHABLE:
            return 'throw new Error("unreachable")'
        case OP.NOP:
            return ''
        case OP.BLOCK:
            context.blocks.push({ code: OP.BLOCK })
            return { code: OP.BLOCK, data: readValueType(state) }
        case OP.LOOP:
            return { code: OP.LOOP, data: readValueType(state) }
        case OP.IF:
            return { code: OP.IF, data: readValueType(state) }
        case OP.ELSE:
            return { code: OP.ELSE }
        case OP.END:
            return { code: OP.END }
        case OP.BR:
            return { code: OP.BR, data: readVaruint32(state) }
        case OP.BR_IF:
            return `{
                if (instance.stack.pop() !== 0)
                    goto(${op.data})
            }`
        case OP.BR_TABLE:
            return { code: OP.BR_TABLE, data: readBrTableData(state) }
        case OP.RETURN:
            return { code: OP.RETURN }

        case OP.CALL: // function_index : varuint32	call a function by its index
            return { code: OP.CALL, data: readVaruint32(state) }
        case OP.CALL_INDIRECT: // type_index : varuint32, reserved : varuint1	call a function indirect with an expected signature
            return { code: OP.CALL_INDIRECT, data: [readVaruint32(state), readVaruintN(state, 1)] }

        case OP.DROP: //  	ignore value
            return { code: OP.DROP }
        case OP.SELECT: //  	select one of two values based on condition
            return { code: OP.SELECT }

        case OP.GET_LOCAL: // local_index : varuint32	read a local variable or parameter
            return { code: OP.GET_LOCAL, data: readVaruint32(state) }
        case OP.SET_LOCAL: // local_index : varuint32	write a local variable or parameter
            return { code: OP.SET_LOCAL, data: readVaruint32(state) }
        case OP.TEE_LOCAL: // local_index : varuint32	write a local variable or parameter and return the same value
            return { code: OP.TEE_LOCAL, data: readVaruint32(state) }
        case OP.GET_GLOBAL: // global_index : varuint32	read a global variable
            return { code: OP.GET_GLOBAL, data: readVaruint32(state) }
        case OP.SET_GLOBAL: // global_index : varuint32	write a global variable
            return { code: OP.SET_GLOBAL, data: readVaruint32(state) }

        case OP.I32_LOAD: // memory_immediate	load from memory
            return { code: OP.I32_LOAD, data: readMemoryImmediate(state) }
        case OP.I64_LOAD: // memory_immediate	load from memory
            return { code: OP.I64_LOAD, data: readMemoryImmediate(state) }
        case OP.F32_LOAD: // memory_immediate	load from memory
            return { code: OP.F32_LOAD, data: readMemoryImmediate(state) }
        case OP.F64_LOAD: // memory_immediate	load from memory
            return { code: OP.F64_LOAD, data: readMemoryImmediate(state) }
        case OP.I32_LOAD8_S: // memory_immediate	load from memory
            return { code: OP.I32_LOAD8_S, data: readMemoryImmediate(state) }
        case OP.I32_LOAD8_U: // memory_immediate	load from memory
            return { code: OP.I32_LOAD8_U, data: readMemoryImmediate(state) }
        case OP.I32_LOAD16_S: // memory_immediate	load from memory
            return { code: OP.I32_LOAD16_S, data: readMemoryImmediate(state) }
        case OP.I32_LOAD16_U: // memory_immediate	load from memory
            return { code: OP.I32_LOAD16_U, data: readMemoryImmediate(state) }
        case OP.I64_LOAD8_S: // memory_immediate	load from memory
            return { code: OP.I64_LOAD8_S, data: readMemoryImmediate(state) }
        case OP.I64_LOAD8_U: // memory_immediate	load from memory
            return { code: OP.I64_LOAD8_U, data: readMemoryImmediate(state) }
        case OP.I64_LOAD16_S: // memory_immediate	load from memory
            return { code: OP.I64_LOAD16_S, data: readMemoryImmediate(state) }
        case OP.I64_LOAD16_U: // memory_immediate	load from memory
            return { code: OP.I64_LOAD16_U, data: readMemoryImmediate(state) }
        case OP.I64_LOAD32_S: // memory_immediate	load from memory
            return { code: OP.I64_LOAD32_S, data: readMemoryImmediate(state) }
        case OP.I64_LOAD32_U: // memory_immediate	load from memory
            return { code: OP.I64_LOAD32_U, data: readMemoryImmediate(state) }
        case OP.I32_STORE: // memory_immediate	store to memory
            return { code: OP.I32_STORE, data: readMemoryImmediate(state) }
        case OP.I64_STORE: // memory_immediate	store to memory
            return { code: OP.I64_STORE, data: readMemoryImmediate(state) }
        case OP.F32_STORE: // memory_immediate	store to memory
            return { code: OP.F32_STORE, data: readMemoryImmediate(state) }
        case OP.F64_STORE: // memory_immediate	store to memory
            return { code: OP.F64_STORE, data: readMemoryImmediate(state) }
        case OP.I32_STORE8: // memory_immediate	store to memory
            return { code: OP.I32_STORE8, data: readMemoryImmediate(state) }
        case OP.I32_STORE16: // memory_immediate	store to memory
            return { code: OP.I32_STORE16, data: readMemoryImmediate(state) }
        case OP.I64_STORE8: // memory_immediate	store to memory
            return { code: OP.I64_STORE8, data: readMemoryImmediate(state) }
        case OP.I64_STORE16: // memory_immediate	store to memory
            return { code: OP.I64_STORE16, data: readMemoryImmediate(state) }
        case OP.I64_STORE32: // memory_immediate	store to memory
            return { code: OP.I64_STORE32, data: readMemoryImmediate(state) }
        case OP.CURRENT_MEMORY: // reserved : varuint1	query the size of memory
            return { code: OP.CURRENT_MEMORY, data: readVaruintN(state, 1) }
        case OP.GROW_MEMORY: // reserved : varuint1	grow the size of memory
            return { code: OP.GROW_MEMORY, data: readVaruintN(state, 1) }

        case OP.I32_CONST: // value : varint32	a constant value interpreted as i32
            return { code: OP.I32_CONST, data: readVarIntN(state, 32) }
        case OP.I64_CONST: // value : varint64	a constant value interpreted as i64
            return { code: OP.I64_CONST, data: readVarIntN(state, 64) }
        case OP.F32_CONST: // value : uint32	a constant value interpreted as f32
            return { code: OP.F32_CONST, data: readUInt32(state) }
        case OP.F64_CONST: // value : uint64	a constant value interpreted as f64
            return { code: OP.F64_CONST, data: readUInt64(state) }

        case OP.I32_EQZ:
            return { code: OP.I32_EQZ }
        case OP.I32_EQ:
            return { code: OP.I32_EQ }
        case OP.I32_NE:
            return { code: OP.I32_NE }
        case OP.I32_LT_S:
            return { code: OP.I32_LT_S }
        case OP.I32_LT_U:
            return { code: OP.I32_LT_U }
        case OP.I32_GT_S:
            return { code: OP.I32_GT_S }
        case OP.I32_GT_U:
            return { code: OP.I32_GT_U }
        case OP.I32_LE_S:
            return { code: OP.I32_LE_S }
        case OP.I32_LE_U:
            return { code: OP.I32_LE_U }
        case OP.I32_GE_S:
            return { code: OP.I32_GE_S }
        case OP.I32_GE_U:
            return { code: OP.I32_GE_U }
        case OP.I64_EQZ:
            return { code: OP.I64_EQZ }
        case OP.I64_EQ:
            return { code: OP.I64_EQ }
        case OP.I64_NE:
            return { code: OP.I64_NE }
        case OP.I64_LT_S:
            return { code: OP.I64_LT_S }
        case OP.I64_LT_U:
            return { code: OP.I64_LT_U }
        case OP.I64_GT_S:
            return { code: OP.I64_GT_S }
        case OP.I64_GT_U:
            return { code: OP.I64_GT_U }
        case OP.I64_LE_S:
            return { code: OP.I64_LE_S }
        case OP.I64_LE_U:
            return { code: OP.I64_LE_U }
        case OP.I64_GE_S:
            return { code: OP.I64_GE_S }
        case OP.I64_GE_U:
            return { code: OP.I64_GE_U }
        case OP.F32_EQ:
            return { code: OP.F32_EQ }
        case OP.F32_NE:
            return { code: OP.F32_NE }
        case OP.F32_LT:
            return { code: OP.F32_LT }
        case OP.F32_GT:
            return { code: OP.F32_GT }
        case OP.F32_LE:
            return { code: OP.F32_LE }
        case OP.F32_GE:
            return { code: OP.F32_GE }
        case OP.F64_EQ:
            return { code: OP.F64_EQ }
        case OP.F64_NE:
            return { code: OP.F64_NE }
        case OP.F64_LT:
            return { code: OP.F64_LT }
        case OP.F64_GT:
            return { code: OP.F64_GT }
        case OP.F64_LE:
            return { code: OP.F64_LE }
        case OP.F64_GE:
            return { code: OP.F64_GE }

        case OP.I32_CLZ:
            return { code: OP.I32_CLZ }
        case OP.I32_CTZ:
            return { code: OP.I32_CTZ }
        case OP.I32_POPCNT:
            return { code: OP.I32_POPCNT }
        case OP.I32_ADD:
            return { code: OP.I32_ADD }
        case OP.I32_SUB:
            return { code: OP.I32_SUB }
        case OP.I32_MUL:
            return { code: OP.I32_MUL }
        case OP.I32_DIV_S:
            return { code: OP.I32_DIV_S }
        case OP.I32_DIV_U:
            return { code: OP.I32_DIV_U }
        case OP.I32_REM_S:
            return { code: OP.I32_REM_S }
        case OP.I32_REM_U:
            return { code: OP.I32_REM_U }
        case OP.I32_AND:
            return { code: OP.I32_AND }
        case OP.I32_OR:
            return { code: OP.I32_OR }
        case OP.I32_XOR:
            return { code: OP.I32_XOR }
        case OP.I32_SHL:
            return { code: OP.I32_SHL }
        case OP.I32_SHR_S:
            return { code: OP.I32_SHR_S }
        case OP.I32_SHR_U:
            return { code: OP.I32_SHR_U }
        case OP.I32_ROTL:
            return { code: OP.I32_ROTL }
        case OP.I32_ROTR:
            return { code: OP.I32_ROTR }
        case OP.I64_CLZ:
            return { code: OP.I64_CLZ }
        case OP.I64_CTZ:
            return { code: OP.I64_CTZ }
        case OP.I64_POPCNT:
            return { code: OP.I64_POPCNT }
        case OP.I64_ADD:
            return { code: OP.I64_ADD }
        case OP.I64_SUB:
            return { code: OP.I64_SUB }
        case OP.I64_MUL:
            return { code: OP.I64_MUL }
        case OP.I64_DIV_S:
            return { code: OP.I64_DIV_S }
        case OP.I64_DIV_U:
            return { code: OP.I64_DIV_U }
        case OP.I64_REM_S:
            return { code: OP.I64_REM_S }
        case OP.I64_REM_U:
            return { code: OP.I64_REM_U }
        case OP.I64_AND:
            return { code: OP.I64_AND }
        case OP.I64_OR:
            return { code: OP.I64_OR }
        case OP.I64_XOR:
            return { code: OP.I64_XOR }
        case OP.I64_SHL:
            return { code: OP.I64_SHL }
        case OP.I64_SHR_S:
            return { code: OP.I64_SHR_S }
        case OP.I64_SHR_U:
            return { code: OP.I64_SHR_U }
        case OP.I64_ROTL:
            return { code: OP.I64_ROTL }
        case OP.I64_ROTR:
            return { code: OP.I64_ROTR }
        case OP.F32_ABS:
            return { code: OP.F32_ABS }
        case OP.F32_NEG:
            return { code: OP.F32_NEG }
        case OP.F32_CEIL:
            return { code: OP.F32_CEIL }
        case OP.F32_FLOOR:
            return { code: OP.F32_FLOOR }
        case OP.F32_TRUNC:
            return { code: OP.F32_TRUNC }
        case OP.F32_NEAREST:
            return { code: OP.F32_NEAREST }
        case OP.F32_SQRT:
            return { code: OP.F32_SQRT }
        case OP.F32_ADD:
            return { code: OP.F32_ADD }
        case OP.F32_SUB:
            return { code: OP.F32_SUB }
        case OP.F32_MUL:
            return { code: OP.F32_MUL }
        case OP.F32_DIV:
            return { code: OP.F32_DIV }
        case OP.F32_MIN:
            return { code: OP.F32_MIN }
        case OP.F32_MAX:
            return { code: OP.F32_MAX }
        case OP.F32_COPYSIGN:
            return { code: OP.F32_COPYSIGN }
        case OP.F64_ABS:
            return { code: OP.F64_ABS }
        case OP.F64_NEG:
            return { code: OP.F64_NEG }
        case OP.F64_CEIL:
            return { code: OP.F64_CEIL }
        case OP.F64_FLOOR:
            return { code: OP.F64_FLOOR }
        case OP.F64_TRUNC:
            return { code: OP.F64_TRUNC }
        case OP.F64_NEAREST:
            return { code: OP.F64_NEAREST }
        case OP.F64_SQRT:
            return { code: OP.F64_SQRT }
        case OP.F64_ADD:
            return { code: OP.F64_ADD }
        case OP.F64_SUB:
            return { code: OP.F64_SUB }
        case OP.F64_MUL:
            return { code: OP.F64_MUL }
        case OP.F64_DIV:
            return { code: OP.F64_DIV }
        case OP.F64_MIN:
            return { code: OP.F64_MIN }
        case OP.F64_MAX:
            return { code: OP.F64_MAX }
        case OP.F64_COPYSIGN:
            return { code: OP.F64_COPYSIGN }

        case OP.I32_WRAP_I64:
            return { code: OP.I32_WRAP_I64 }
        case OP.I32_TRUNC_S_F32:
            return { code: OP.I32_TRUNC_S_F32 }
        case OP.I32_TRUNC_U_F32:
            return { code: OP.I32_TRUNC_U_F32 }
        case OP.I32_TRUNC_S_F64:
            return { code: OP.I32_TRUNC_S_F64 }
        case OP.I32_TRUNC_U_F64:
            return { code: OP.I32_TRUNC_U_F64 }
        case OP.I64_EXTEND_S_I32:
            return { code: OP.I64_EXTEND_S_I32 }
        case OP.I64_EXTEND_U_I32:
            return { code: OP.I64_EXTEND_U_I32 }
        case OP.I64_TRUNC_S_F32:
            return { code: OP.I64_TRUNC_S_F32 }
        case OP.I64_TRUNC_U_F32:
            return { code: OP.I64_TRUNC_U_F32 }
        case OP.I64_TRUNC_S_F64:
            return { code: OP.I64_TRUNC_S_F64 }
        case OP.I64_TRUNC_U_F64:
            return { code: OP.I64_TRUNC_U_F64 }
        case OP.F32_CONVERT_S_I32:
            return { code: OP.F32_CONVERT_S_I32 }
        case OP.F32_CONVERT_U_I32:
            return { code: OP.F32_CONVERT_U_I32 }
        case OP.F32_CONVERT_S_I64:
            return { code: OP.F32_CONVERT_S_I64 }
        case OP.F32_CONVERT_U_I64:
            return { code: OP.F32_CONVERT_U_I64 }
        case OP.F32_DEMOTE_F64:
            return { code: OP.F32_DEMOTE_F64 }
        case OP.F64_CONVERT_S_I32:
            return { code: OP.F64_CONVERT_S_I32 }
        case OP.F64_CONVERT_U_I32:
            return { code: OP.F64_CONVERT_U_I32 }
        case OP.F64_CONVERT_S_I64:
            return { code: OP.F64_CONVERT_S_I64 }
        case OP.F64_CONVERT_U_I64:
            return { code: OP.F64_CONVERT_U_I64 }
        case OP.F64_PROMOTE_F32:
            return { code: OP.F64_PROMOTE_F32 }

        case OP.I32_REINTERPRET_F32:
            return { code: OP.I32_REINTERPRET_F32 }
        case OP.I64_REINTERPRET_F64:
            return { code: OP.I64_REINTERPRET_F64 }
        case OP.F32_REINTERPRET_I32:
            return { code: OP.F32_REINTERPRET_I32 }
        case OP.F64_REINTERPRET_I64:
            return { code: OP.F64_REINTERPRET_I64 }

        default:
            unreachable()
    }
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


/*
 * Helpers
 */

function createGlobalAccessor(module, field) {
    const object = {}
    Object.defineProperty(object, 'value', {
        get: () => module[field],
        set: value => module[field] = value,
    })
    return object
}

function typeToString(type) {
    return `(${type.params.map(p => p.name).join(', ')}) -> ${type.returnType ? type.returnType.name : '()'}`
}
