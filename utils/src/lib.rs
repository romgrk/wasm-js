extern {
    fn log_message(x: u32);
}

#[no_mangle]
pub extern fn add_one(x: u32) -> u32 {
    x + 1
}

#[no_mangle]
pub extern fn add_one_and_log(x: u32) {
    unsafe {
        log_message(x + 1);
    }
}
