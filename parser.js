/*
 * parser.js
 */

const utf8bts = require('utf8bts')
const { assert, unreachable } = require('./assertions.js')


/*
 * Constants
 */

const MININUM_MODULE_LENGTH = 8

const MAGIC_NUMBER = 0x6d736100

const SECTIONS = {
    0:  'CUSTOM',
    1:  'TYPE',     // Function signature declarations
    2:  'IMPORT',   // Import declarations
    3:  'FUNCTION', // Function declarations
    4:  'TABLE',    // Indirect function table and other tables
    5:  'MEMORY',   // Memory attributes
    6:  'GLOBAL',   // Global declarations
    7:  'EXPORT',   // Exports
    8:  'START',    // Start function declaration
    9:  'ELEMENT',  // Elements section
    10: 'CODE',     // Function bodies (code)
    11: 'DATA',     // Data segments

    CUSTOM:   0,
    TYPE:     1,
    IMPORT:   2,
    FUNCTION: 3,
    TABLE:    4,
    MEMORY:   5,
    GLOBAL:   6,
    EXPORT:   7,
    START:    8,
    ELEMENT:  9,
    CODE:     10,
    DATA:     11,
}

const EXTERNAL_KIND = {
    0: 'FUNCTION',
    1: 'TABLE',
    2: 'MEMORY',
    3: 'GLOBAL',

    FUNCTION: 0,
    TABLE:    1,
    MEMORY:   2,
    GLOBAL:   3,
}

const NAME_TYPE = {
    0: 'MODULE',
    1: 'FUNCTION',
    2: 'LOCAL',

    MODULE:   0,
    FUNCTION: 1,
    LOCAL:    2,
}

const TYPE = reverseEnum({
    [-0x01]: 'i32',
    [-0x02]: 'i64',
    [-0x03]: 'f32',
    [-0x04]: 'f64',
    [-0x10]: 'anyfunc',
    [-0x20]: 'func',
    [-0x40]: 'empty',
})

const OP = reverseEnum({
    UNREACHABLE: 0x00, // trap immediately
    NOP:         0x01, // no operation
    BLOCK:       0x02, // sig : block_type           	 begin a sequence of expressions, yielding 0 or 1 values
    LOOP:        0x03, // sig : block_type           	 begin a block which can also form control flow loops
    IF:          0x04, // sig : block_type           	 begin if expression
    ELSE:        0x05, // begin else expression of if
    END:         0x0b, // end a block, loop, or if
    BR:          0x0c, // relative_depth : varuint32 	 break that targets an outer nested block
    BR_IF:       0x0d, // relative_depth : varuint32 	 conditional break that targets an outer nested block
    BR_TABLE:    0x0e, // see below                  	 branch table control flow construct
    RETURN:      0x0f, // return zero or one value from this function

    CALL: 0x10, // function_index : varuint32	call a function by its index
    CALL_INDIRECT: 0x11, // type_index : varuint32, reserved : varuint1	call a function indirect with an expected signature

    DROP: 0x1a, //  	ignore value
    SELECT: 0x1b, //  	select one of two values based on condition

    GET_LOCAL: 0x20, // local_index : varuint32	read a local variable or parameter
    SET_LOCAL: 0x21, // local_index : varuint32	write a local variable or parameter
    TEE_LOCAL: 0x22, // local_index : varuint32	write a local variable or parameter and return the same value
    GET_GLOBAL: 0x23, // global_index : varuint32	read a global variable
    SET_GLOBAL: 0x24, // global_index : varuint32	write a global variable

    I32_LOAD: 0x28, // memory_immediate	load from memory
    I64_LOAD: 0x29, // memory_immediate	load from memory
    F32_LOAD: 0x2a, // memory_immediate	load from memory
    F64_LOAD: 0x2b, // memory_immediate	load from memory
    I32_LOAD8_S: 0x2c, // memory_immediate	load from memory
    I32_LOAD8_U: 0x2d, // memory_immediate	load from memory
    I32_LOAD16_S: 0x2e, // memory_immediate	load from memory
    I32_LOAD16_U: 0x2f, // memory_immediate	load from memory
    I64_LOAD8_S: 0x30, // memory_immediate	load from memory
    I64_LOAD8_U: 0x31, // memory_immediate	load from memory
    I64_LOAD16_S: 0x32, // memory_immediate	load from memory
    I64_LOAD16_U: 0x33, // memory_immediate	load from memory
    I64_LOAD32_S: 0x34, // memory_immediate	load from memory
    I64_LOAD32_U: 0x35, // memory_immediate	load from memory
    I32_STORE: 0x36, // memory_immediate	store to memory
    I64_STORE: 0x37, // memory_immediate	store to memory
    F32_STORE: 0x38, // memory_immediate	store to memory
    F64_STORE: 0x39, // memory_immediate	store to memory
    I32_STORE8: 0x3a, // memory_immediate	store to memory
    I32_STORE16: 0x3b, // memory_immediate	store to memory
    I64_STORE8: 0x3c, // memory_immediate	store to memory
    I64_STORE16: 0x3d, // memory_immediate	store to memory
    I64_STORE32: 0x3e, // memory_immediate	store to memory
    CURRENT_MEMORY: 0x3f, // reserved : varuint1	query the size of memory
    GROW_MEMORY: 0x40, // reserved : varuint1	grow the size of memory

    I32_CONST: 0x41, // value : varint32	a constant value interpreted as i32
    I64_CONST: 0x42, // value : varint64	a constant value interpreted as i64
    F32_CONST: 0x43, // value : uint32	a constant value interpreted as f32
    F64_CONST: 0x44, // value : uint64	a constant value interpreted as f64

    I32_EQZ: 0x45,
    I32_EQ: 0x46,
    I32_NE: 0x47,
    I32_LT_S: 0x48,
    I32_LT_U: 0x49,
    I32_GT_S: 0x4a,
    I32_GT_U: 0x4b,
    I32_LE_S: 0x4c,
    I32_LE_U: 0x4d,
    I32_GE_S: 0x4e,
    I32_GE_U: 0x4f,
    I64_EQZ: 0x50,
    I64_EQ: 0x51,
    I64_NE: 0x52,
    I64_LT_S: 0x53,
    I64_LT_U: 0x54,
    I64_GT_S: 0x55,
    I64_GT_U: 0x56,
    I64_LE_S: 0x57,
    I64_LE_U: 0x58,
    I64_GE_S: 0x59,
    I64_GE_U: 0x5a,
    F32_EQ: 0x5b,
    F32_NE: 0x5c,
    F32_LT: 0x5d,
    F32_GT: 0x5e,
    F32_LE: 0x5f,
    F32_GE: 0x60,
    F64_EQ: 0x61,
    F64_NE: 0x62,
    F64_LT: 0x63,
    F64_GT: 0x64,
    F64_LE: 0x65,
    F64_GE: 0x66,

    I32_CLZ: 0x67,
    I32_CTZ: 0x68,
    I32_POPCNT: 0x69,
    I32_ADD: 0x6a,
    I32_SUB: 0x6b,
    I32_MUL: 0x6c,
    I32_DIV_S: 0x6d,
    I32_DIV_U: 0x6e,
    I32_REM_S: 0x6f,
    I32_REM_U: 0x70,
    I32_AND: 0x71,
    I32_OR: 0x72,
    I32_XOR: 0x73,
    I32_SHL: 0x74,
    I32_SHR_S: 0x75,
    I32_SHR_U: 0x76,
    I32_ROTL: 0x77,
    I32_ROTR: 0x78,
    I64_CLZ: 0x79,
    I64_CTZ: 0x7a,
    I64_POPCNT: 0x7b,
    I64_ADD: 0x7c,
    I64_SUB: 0x7d,
    I64_MUL: 0x7e,
    I64_DIV_S: 0x7f,
    I64_DIV_U: 0x80,
    I64_REM_S: 0x81,
    I64_REM_U: 0x82,
    I64_AND: 0x83,
    I64_OR: 0x84,
    I64_XOR: 0x85,
    I64_SHL: 0x86,
    I64_SHR_S: 0x87,
    I64_SHR_U: 0x88,
    I64_ROTL: 0x89,
    I64_ROTR: 0x8a,
    F32_ABS: 0x8b,
    F32_NEG: 0x8c,
    F32_CEIL: 0x8d,
    F32_FLOOR: 0x8e,
    F32_TRUNC: 0x8f,
    F32_NEAREST: 0x90,
    F32_SQRT: 0x91,
    F32_ADD: 0x92,
    F32_SUB: 0x93,
    F32_MUL: 0x94,
    F32_DIV: 0x95,
    F32_MIN: 0x96,
    F32_MAX: 0x97,
    F32_COPYSIGN: 0x98,
    F64_ABS: 0x99,
    F64_NEG: 0x9a,
    F64_CEIL: 0x9b,
    F64_FLOOR: 0x9c,
    F64_TRUNC: 0x9d,
    F64_NEAREST: 0x9e,
    F64_SQRT: 0x9f,
    F64_ADD: 0xa0,
    F64_SUB: 0xa1,
    F64_MUL: 0xa2,
    F64_DIV: 0xa3,
    F64_MIN: 0xa4,
    F64_MAX: 0xa5,
    F64_COPYSIGN: 0xa6,

    I32_WRAP_I64: 0xa7,
    I32_TRUNC_S_F32: 0xa8,
    I32_TRUNC_U_F32: 0xa9,
    I32_TRUNC_S_F64: 0xaa,
    I32_TRUNC_U_F64: 0xab,
    I64_EXTEND_S_I32: 0xac,
    I64_EXTEND_U_I32: 0xad,
    I64_TRUNC_S_F32: 0xae,
    I64_TRUNC_U_F32: 0xaf,
    I64_TRUNC_S_F64: 0xb0,
    I64_TRUNC_U_F64: 0xb1,
    F32_CONVERT_S_I32: 0xb2,
    F32_CONVERT_U_I32: 0xb3,
    F32_CONVERT_S_I64: 0xb4,
    F32_CONVERT_U_I64: 0xb5,
    F32_DEMOTE_F64: 0xb6,
    F64_CONVERT_S_I32: 0xb7,
    F64_CONVERT_U_I32: 0xb8,
    F64_CONVERT_S_I64: 0xb9,
    F64_CONVERT_U_I64: 0xba,
    F64_PROMOTE_F32: 0xbb,

    I32_REINTERPRET_F32: 0xbc,
    I64_REINTERPRET_F64: 0xbd,
    F32_REINTERPRET_I32: 0xbe,
    F64_REINTERPRET_I64: 0xbf,
})


/*
 * Exports
 */

module.exports = {
    SECTIONS,
    EXTERNAL_KIND,
    NAME_TYPE,
    TYPE,
    OP,
    parse,
}


/*
 * Functions
 */

function parse(buffer) {
    if (buffer.length < MININUM_MODULE_LENGTH)
        throw new Error('Buffer length is under minimum length (8 bytes)')

    let state = {
        buffer: buffer,
        offset: 0,
        lastSectionCode: -1,
        parsedSections: {},
    }

    const magicNumber = readMagicNumber(state)
    const version     = readUInt32(state)

    const sections = []

    while (state.offset < buffer.length) {
        const section = readSection(state)
        section.data = parseSection(section, state)
        sections.push(section)
    }

    assertEndAligned(state)

    return { magicNumber, version, sections }
}

function parseSection(section, state) {
    switch (section.code) {
        case SECTIONS.TYPE:
            return parseTypeSection(section, state)
        case SECTIONS.IMPORT:
            return parseImportSection(section, state)
        case SECTIONS.FUNCTION:
            return parseFunctionSection(section, state)
        case SECTIONS.TABLE:
            return parseTableSection(section, state)
        case SECTIONS.MEMORY:
            return parseMemorySection(section, state)
        case SECTIONS.GLOBAL:
            return parseGlobalSection(section, state)
        case SECTIONS.EXPORT:
            return parseExportSection(section, state)
        case SECTIONS.START:
            return parseStartSection(section, state)
        case SECTIONS.ELEMENT:
            return parseElementSection(section, state)
        case SECTIONS.CODE:
            return parseCodeSection(section, state)
        case SECTIONS.DATA:
            return parseDataSection(section, state)

        case SECTIONS.CUSTOM:
            if (section.name === 'name') {
                try {
                    return parseNameSection(section, state)
                } catch (err) {
                    console.log('Error while parsing "name" section:', err)
                }
            }

        default: // eslint-disable-line no-fallthrough
            return undefined
    }
}

function parseTypeSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const entries = []

    for (let i = 0; i < count; i++) {
        entries.push(readFuncType(subState))
    }

    assertEndAligned(subState)

    return { count, entries }
}

function parseImportSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const entries = []

    for (let i = 0; i < count; i++) {
        entries.push(readImportEntry(subState))
    }

    assertEndAligned(subState)

    return { count, entries }
}

function parseFunctionSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const types = []

    for (let i = 0; i < count; i++) {
        types.push(readVaruintN(subState, 32))
    }

    assertEndAligned(subState)

    return { count, types }
}

function parseTableSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const entries = []

    for (let i = 0; i < count; i++) {
        entries.push(readTableType(subState))
    }

    assertEndAligned(subState)

    return { count, entries }
}

function parseMemorySection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const entries = []

    for (let i = 0; i < count; i++) {
        entries.push(readMemoryType(subState))
    }

    assertEndAligned(subState)

    return { count, entries }
}

function parseGlobalSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const globals = []

    for (let i = 0; i < count; i++) {
        globals.push(readGlobalVariable(subState))
    }

    assertEndAligned(subState)

    return { count, globals }
}

function parseExportSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const entries = []

    for (let i = 0; i < count; i++) {
        entries.push(readExportEntry(subState))
    }

    assertEndAligned(subState)

    return { count, entries }
}

function parseStartSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const index = readVaruintN(subState, 32)

    assertEndAligned(subState)

    return { index }
}

function parseElementSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const entries = []

    for (let i = 0; i < count; i++) {
        entries.push(readElementSegment(subState))
    }

    assertEndAligned(subState)

    return { count, entries }
}

function parseCodeSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const bodies = []

    for (let i = 0; i < count; i++) {
        bodies.push(readFunctionBody(subState))
    }

    assertEndAligned(subState)

    return { count, bodies }
}

function parseDataSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const count = readVaruintN(subState, 32)
    const entries = []

    for (let i = 0; i < count; i++) {
        entries.push(readDataSegment(subState))
    }

    assertEndAligned(subState)

    return { count, entries }
}

function parseNameSection(section, state) {
    const subState = { offset: 0, buffer: section.payload }

    const entries = []

    while (subState.offset < subState.buffer.length) {
        entries.push(readNameSubsection(subState))
    }

    assertEndAligned(subState)

    return { entries }
}


function readSection(state) {
    const code          = readSectionCode(state)
    const payloadLength = readVaruint32(state)

    const payloadOffset = state.offset

    const nameLength = code === 0 ? readVaruint32(state) : 0
    const name       = code === 0 ? readString(state, nameLength) : undefined

    const payload = readBytes(state, payloadLength - (state.offset - payloadOffset))

    if (code !== 0) {
        if (state.parsedSections[code])
            throw new Error('Section present more than once: ' + code)
        else 
            state.parsedSections[code] = true

        if (code < state.lastSectionCode)
            throw new Error('Section out of order: ' + code)
        else 
            state.lastSectionCode = code
    }

    return { code, type: SECTIONS[code], payloadLength, nameLength, name, payload }
}

function readSectionCode(state) {
    const code = readVaruintN(state, 7)

    if (code !== 0 && !(code in SECTIONS))
        throw new Error('Section code not allowed: ' + code)

    return code
}

function readMagicNumber(state) {
    const magicNumber = readUInt32(state)

    if (magicNumber !== MAGIC_NUMBER)
        throw new Error('Invalid magic number: 0x' + magicNumber.toString(16))

    return magicNumber
}

function readBytes(state, length) {
    const bytes = state.buffer.slice(state.offset, state.offset + length)
    state.offset += length
    return bytes
}

function readString(state, length) {
    const bytes = state.buffer.slice(state.offset, state.offset + length)
    const string = utf8bts(bytes)
    state.offset += length
    return string
}

function readUInt32(state) {
    const number = state.buffer.readUInt32LE(state.offset)
    state.offset += 4
    return number
}

function readUInt64(state) {
    const number = state.buffer.readUIntLE(state.offset, 8)
    state.offset += 8
    return number
}

function readFuncType(state) {
    const form = readValueType(state, 7)
    const paramCount = readVaruint32(state)
    const paramTypes = []
    for (let i = 0; i < paramCount; i++) {
        paramTypes.push(readValueType(state))
    }
    const returnCount = readVaruintN(state, 1)
    const returnType = returnCount === 1 ? readValueType(state) : undefined

    assert(form.name === 'func', 'func_type.form is not -0x20')

    return { form, params: paramTypes, returnType }
}

function readImportEntry(state) {
    const moduleNameLength = readVaruint32(state)
    const moduleName = readString(state, moduleNameLength)
    const fieldNameLength = readVaruint32(state)
    const fieldName = readString(state, fieldNameLength)
    const kind = readExternalKind(state)

    let type
    switch (kind) {
        case EXTERNAL_KIND.FUNCTION:
            type = readVaruint32(state); break
        case EXTERNAL_KIND.TABLE:
            type = readTableType(state); break
        case EXTERNAL_KIND.MEMORY:
            type = readMemoryType(state); break
        case EXTERNAL_KIND.GLOBAL:
            type = readGlobalType(state); break
        default:
            unreachable()
    }

    return { moduleName, fieldName, kind, kindName: EXTERNAL_KIND[kind], type }
}

function readExternalKind(state) {
    const byte = readBytes(state, 1)[0]
    assert(byte in EXTERNAL_KIND, 'Invalid external_kind: ' + byte)
    return byte
}

function readValueType(state) {
    const value = readVarIntN(state, 7)

    if (!(value in TYPE))
        throw new Error('Invalid value_type: ' + value)

    return { value, name: TYPE[value] }
}

function readTableType(state) {
    const elementType = readValueType(state)
    const limits = readResizeableLimits(state)
    return { elementType, limits }
}

function readMemoryType(state) {
    const limits = readResizeableLimits(state)
    return { limits }
}

function readResizeableLimits(state) {
    const flags = readVaruintN(state, 1)
    const initial = readVaruint32(state)
    const maximum = flags === 1 ? readVaruint32(state) : undefined
    return { flags, initial, maximum }
}

function readGlobalType(state) {
    const contentType = readValueType(state)
    const mutability = readVaruintN(state, 1) === 1
    return { contentType, mutability }
}

function readGlobalVariable(state) {
    const type = readGlobalType(state)
    const initExpression = readExpression(state)
    return { type, initExpression }
}

function readExportEntry(state) {
    const fieldLength = readVaruint32(state)
    const field = readString(state, fieldLength)
    const kind = readExternalKind(state)
    const index = readVaruint32(state)
    return { field, kind, kindName: EXTERNAL_KIND[kind], index }
}

function readElementSegment(state) {
    const index = readVaruint32(state)
    const offset = readExpression(state)

    const count = readVaruint32(state)
    const elements = []

    for (let i = 0; i < count; i++) {
        elements.push(readVaruint32(state))
    }

    return { index, offset, elements }
}

function readLocalEntry(state) {
    const count = readVaruint32(state)
    const type = readValueType(state)
    return { count, type }
}

function readDataSegment(state) {
    const index = readVaruint32(state)
    const offset = readExpression(state)
    const size = readVaruint32(state)
    const data = readBytes(state, size)
    return { index, offset, data }
}

function readNameSubsection(state) {
    const type = readVaruintN(state, 7)
    const payloadLength = readVaruint32(state)
    const payload = readBytes(state, payloadLength)

    const subState = { offset: 0, buffer: payload }

    let data
    switch (type) {
        case NAME_TYPE.MODULE:
            data = readModuleNameSubsection(subState); break
        case NAME_TYPE.FUNCTION:
            data = readFunctionNameSubsection(subState); break
        case NAME_TYPE.LOCAL:
            data = readLocalNameSubsection(subState); break
        default:
            unreachable()
    }

    return { type, payload, data }
}

function readModuleNameSubsection(state) {
    const nameLength = readVaruint32(state)
    const name = readString(state, nameLength)
    return { name }
}

function readFunctionNameSubsection(state) {
    return readNameMap(state)
}

function readLocalNameSubsection(state) {
    const count = readVaruint32(state)
    const funcs = []
    for (let i = 0; i < count; i++) {
        funcs.push(readLocalNames(state))
    }
    return { funcs }
}

function readNameMap(state) {
    const count = readVaruint32(state)
    const names = []
    for (let i = 0; i < count; i++) {
        names.push(readNaming(state))
    }
    return { names }
}

function readNaming(state) {
    const index = readVaruint32(state)
    const nameLength = readVaruint32(state)
    const name = readString(state, nameLength)
    return { index, name }
}

function readLocalNames(state) {
    const index = readVaruint32(state)
    const localMap = readNameMap(state)
    return { index, localMap }
}

function readVarIntN(state, n) {
    let result = 0
    let shift = 0
    let byte

    do {
        byte = state.buffer[state.offset++]
        result |= (byte & 0b01111111) << shift
        shift += 7
    } while ((byte & 0b10000000) !== 0)

    if ((byte & 0b01000000) !== 0)
        result |= (~0 << shift)

    return result
}

function readVaruintN(state, n) {
    const maxBytes = Math.ceil(n / 8)
    const bytes = []

    for (let i = state.offset; i < (state.offset + maxBytes) && i < state.buffer.length; i++) {
        const byte = state.buffer[i]

        bytes.push(byte)

        if ((byte & 0b10000000) === 0)
            break
    }

    state.offset += bytes.length

    let number = 0

    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i] & 0b01111111
        number |= (byte << (i * 7))
    }

    return number
}

function readVaruint32(state) {
    return readVaruintN(state, 32)
}

function readExpression(state) {
    const ops = []
    let op
    while (!op || op.code !== OP.END) {
        op = readOp(state)
        ops.push(attachOpName(op))
    }
    return ops
}

function readFunctionBody(state) {
    const bodySize = readVaruint32(state)
    const offset = state.offset

    const localsCount = readVaruint32(state)
    const locals = []
    for (let i = 0; i < localsCount; i++) {
        locals.push(readLocalEntry(state))
    }

    const code = []
    let blocks = 0
    do {
        const op = attachOpName(readOp(state))

        if (isBlockOp(op)) 
            blocks++
        else if (isEndOp(op))
            blocks--

        code.push(op)
    } while (blocks >= 0)

    assert(state.offset === offset + bodySize, 'Function body size did not match')

    return { locals, code }
}

function readOp(state) {
    const byte = state.buffer[state.offset++]

    switch (byte) {
        case OP.UNREACHABLE:
            return { code: OP.UNREACHABLE }
        case OP.NOP:
            return { code: OP.NOP }
        case OP.BLOCK:
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
            return { code: OP.BR_IF, data: readVaruint32(state) }
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

function readMemoryImmediate(state) {
    /* The memory_immediate type is encoded as follows:
     * Name      Type        Description
     * flags     varuint32   a bitfield which currently contains the alignment in the least significant
     *                       bits, encoded as log2(alignment)
     * offset    varuint32   the value of the offset */

    const flags = readVaruint32(state)
    const offset = readVaruint32(state)
    return { flags, offset }
}

function readBrTableData(state) {
    const count = readVaruint32(state)
    const targets = []
    for (let i = 0; i < count; i++) {
        targets.push(readVaruint32(state))
    }
    const defaultTarget = readVaruint32(state)
    return { targets, defaultTarget }
}


function isBlockOp(op) {
    return op.code === OP.BLOCK || op.code === OP.LOOP || op.code === OP.IF
}

function isEndOp(op) {
    return op.code === OP.END
}


function assertEndAligned(state) {
    if (state.offset !== state.buffer.length) {
        console.log(state.buffer)
        throw new Error(`Section end doesn't align with buffer end (section end: ${state.offset}, buffer length: ${state.buffer.length})`)
    }
}


function attachOpName(op) {
    return { code: op.code, name: OP[op.code], data: op.data }
}

function toHex(n) {
    return '0x' + n.toString(16)
}

function toBinary(n) {
    const s = n.toString(2)
    return '0b' + s.padStart(8, '0')
}

function reverseEnum(object) {
    Object.keys(object).forEach(key => {
        const value = object[key]
        object[value] = key
    })
    return object
}
