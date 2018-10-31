/*
 * goto.js
 */


function test() {
    let label = 0
    while (true) {
    switch (label) {
        case 0:
        case 1:
        case 2:
            label = 4; continue
        case 3:
            console.log('skipped')
        case 4:
    }
    }
}

function test2() {
    label_1: while (true) {

    label_2: while (true) {

        break label_2
    }
    }
}

/*
(func $add_one (export "add_one") (type $t5) (param $p0 i32) (result i32)
    (local $l0 i32) (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32) (local $l6 i32) (local $l7 i32) (local $l8 i32) (local $l9 i32) (local $l10 i32) (local $l11 i32) (local $l12 i32)
    get_global $g0
    set_local $l0
    i32.const 16
    set_local $l1
    get_local $l0
    get_local $l1
    i32.sub
    set_local $l2
    get_local $l2
    set_global $g0
    get_local $l2
    get_local $p0
    i32.store offset=12
    get_local $l2
    i32.load offset=12
    set_local $l3
    i32.const 1
    set_local $l4
    get_local $l3
    get_local $l4
    i32.add
    set_local $l5
    get_local $l5
    get_local $l3
    i32.lt_u
    set_local $l6
    i32.const 1
    set_local $l7
    get_local $l6
    get_local $l7
    i32.and
    set_local $l8
    block $B0
        get_local $l8
        br_if $B0
        i32.const 16
        set_local $l9
        get_local $l2
        get_local $l9
        i32.add
        set_local $l10
        get_local $l10
        set_global $g0
        get_local $l5
        return
    end
    i32.const 1049440
    set_local $l11
    get_local $l11
    set_local $l12
    get_local $l12
    call $core::panicking::panic::h3ce90303d4c75e95
    unreachable)
*/

const instance = {
    stack: [],
    globals: [undefined, undefined, undefined, undefined, undefined]
}
const { stack, globals } = instance

function add_one() {
    const locals = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined]
    stack.push(globals[0])
    locals[0] = stack.pop()
    stack.push(16)
    locals[1] = stack.pop()
    stack.push(locals[0])
    stack.push(locals[1])
    { const a = stack.pop(), b = stack.pop(); stack.push(a - b) }

    label_0: while(true) {
        stack.push(locals[8])
        if (stack.pop() !== 0)
            break label_0
        stack.push(16)

        break label_0
    }
    // block $B0
    //     get_local $l8
    //     br_if $B0
    //     i32.const 16
    //     set_local $l9
    //     get_local $l2
    //     get_local $l9
    //     i32.add
    //     set_local $l10
    //     get_local $l10
    //     set_global $g0
    //     get_local $l5
    //     return
    // end

    label_0: while(true) {
        if (stack.pop() !== 0) {

        }
        else {

        }
        break label_0
    }
    // if
    //     get_local $l8
    // else
    //     get_local $l5
    //     return
    // end
}
